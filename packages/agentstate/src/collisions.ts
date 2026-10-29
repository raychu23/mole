// T21 parallel-agent collisions. Two runs collide when their activity comes within N minutes of each other (both live at
// once; a run's activity = its complete steps split at idle gaps > N minutes, so a resumed chat is not live during its gap), neither is the other's parent/subagent, and one edits a function the other edited or read, or one within a
// directed call chain of <= `hops` calls edges of it (T1 call graph). Also: a run that edits a function a note is on (T11).
// Only complete steps count: a tool call with no result yet, or a half-written last JSONL line, is not evidence.
// Definition + labels: packages/agentstate/bench/m11-key.json (written before this code).
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { indexRepo, readGraph } from '@mole/indexer';
import { memory, symbolsOfText, type CodeSymbol } from '@mole/memory';
import { loadRuns, type LoadedRun } from './index.js';
import type { RawCall } from './sources.js';
import type { Harness, Skipped, Sources, Step } from './types.js';

export interface CollisionsOptions extends Sources {
  /** repo root: runs in it or its git worktrees */
  root: string;
  /** only these run ids (exact); default every in-scope run */
  runs?: string[];
  /** only pairs that include this run id (or unique prefix): what a hook asks for its own session */
  run?: string;
  /** only runs with a complete step at or after this time (ms since epoch); default now - 24 h; 0 = all */
  since?: number;
  /** N: two runs are parallel when their windows come within N minutes (default 15) */
  windowMinutes?: number;
  /** max calls edges on a directed chain between the two runs' functions (default 2) */
  hops?: number;
  /** use this call graph (edges 'path#A.b' -> 'path#C') instead of indexing the checkouts (tests) */
  graph?: { edges: Array<[string, string]> };
}

export interface CollisionRun {
  id: string;
  harness: Harness;
  title: string | null;
  parent: string | null;
  first: string; // ISO, first complete step
  last: string; // ISO, last complete step
}

/** one function a run edited or read, with the step that did it */
export interface CollisionTouch {
  run: string;
  symbol: string; // repo-relative path#Qualified.name
  how: 'edit' | 'read';
  time: string;
  step: string;
}

/** one side of a pair: the run, its harness and window */
export interface CollisionSide {
  run: string;
  harness: Harness;
  title: string | null;
  first: string;
  last: string;
}

export interface Collision {
  a: CollisionSide;
  b: CollisionSide;
  /** functions both runs touched (at least one of them edited it) */
  shared: string[];
  /** shortest directed call chain between the two runs' functions, one 'from -> to' per edge (empty when shared) */
  path: string[];
  /** which run changed / read what, newest first */
  changes: CollisionTouch[];
  /** newest evidence time (pairs are sorted newest first) */
  time: string;
}

export interface NoteCollision {
  run: string;
  harness: Harness;
  symbol: string;
  note: string; // repo-relative .mole/notes/<slug>.md
  time: string;
  step: string;
}

export interface CollisionsResult {
  windowMinutes: number;
  hops: number;
  runs: CollisionRun[];
  pairs: Collision[];
  notes: NoteCollision[];
  skipped: Skipped[];
}

const DAY = 24 * 3600_000;
const CODE = /\.(?:[cm]?[jt]sx?)$/;

// ---------------------------------------------------------------- which functions a step edited / read
interface Touch extends CollisionTouch {
  checkout: string;
}
type Sym = CodeSymbol;

const fileCache = new Map<string, { text: string; syms: Sym[] } | null>();
function fileAt(abs: string, rel: string): { text: string; syms: Sym[] } | null {
  if (fileCache.has(abs)) return fileCache.get(abs)!;
  let out: { text: string; syms: Sym[] } | null = null;
  try {
    if (existsSync(abs)) {
      const text = readFileSync(abs, 'utf8');
      out = { text, syms: safeSymbols(rel, text) };
    }
  } catch {
    out = null;
  }
  fileCache.set(abs, out);
  return out;
}
function safeSymbols(rel: string, text: string): Sym[] {
  try {
    return symbolsOfText(rel, text);
  } catch {
    return [];
  }
}
/** innermost symbols overlapping lines [a, b]: a class only when none of its methods is in range */
function innermost(syms: Sym[], a: number, b: number): Sym[] {
  const hit = syms.filter((s) => s.startLine <= b && s.endLine >= a);
  return hit.filter((s) => !hit.some((o) => o !== s && o.startLine >= s.startLine && o.endLine <= s.endLine && (o.startLine > s.startLine || o.endLine < s.endLine)));
}
const ALL = Number.MAX_SAFE_INTEGER;
const lineOf = (text: string, idx: number): number => text.slice(0, idx).split('\n').length;
const meaningful = (l: string): boolean => l.trim().replace(/[{}();,\s]/g, '').length >= 4;
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

/** the edit's new text for one file: whole = the full new file, pieces = replaced fragments */
function editTexts(c: RawCall, abs: string): { whole?: string; pieces: string[] } {
  const a = c.args;
  const content = str(a.content);
  if (content !== undefined) return { whole: content, pieces: [] };
  const pieces: string[] = [];
  for (const k of ['new_string', 'new_source']) if (str(a[k])) pieces.push(a[k] as string);
  if (Array.isArray(a.edits)) for (const e of a.edits as Array<{ new_string?: unknown }>) if (typeof e.new_string === 'string') pieces.push(e.new_string);
  const patch = str(a.patch) ?? str(a.input) ?? (c.name === 'apply_patch' ? c.argsText : undefined);
  if (patch) {
    // V4A / apply_patch: one section per file; keep the '+' and context lines of the section naming this file
    for (const p of patch.split(/^\*\*\* (?:Update|Add) File: /m).slice(1)) {
      const nl = p.indexOf('\n');
      if (!abs.endsWith(p.slice(0, nl).trim().replace(/^\.\//, ''))) continue;
      for (const hunk of p.slice(nl + 1).split(/^@@.*$/m)) {
        const lines = hunk.split('\n').filter((l) => l.startsWith('+') || l.startsWith(' ')).map((l) => l.slice(1));
        if (lines.some(meaningful)) pieces.push(lines.join('\n'));
      }
    }
  }
  return { pieces };
}

function editedSymbols(c: RawCall, abs: string, rel: string): Sym[] {
  const t = editTexts(c, abs);
  if (t.whole !== undefined) return innermost(safeSymbols(rel, t.whole), 1, ALL); // a whole-file write edits every function
  const f = fileAt(abs, rel);
  const out = new Map<string, Sym>();
  for (const piece of t.pieces) {
    if (!piece.trim()) continue;
    if (!f) {
      // the file is gone: the functions the fragment itself defines
      for (const s of innermost(safeSymbols(rel, piece), 1, ALL)) out.set(s.tail, s);
      continue;
    }
    const idx = f.text.indexOf(piece);
    if (idx >= 0) {
      for (const s of innermost(f.syms, lineOf(f.text, idx), lineOf(f.text, idx + piece.length))) out.set(s.tail, s);
      continue;
    }
    // the file changed since: the lines of the fragment that occur exactly once in it
    const lines = f.text.split('\n').map((l) => l.trim());
    for (const l of piece.split('\n').map((x) => x.trim()).filter(meaningful)) {
      const i = lines.indexOf(l);
      if (i < 0 || lines.indexOf(l, i + 1) >= 0) continue;
      for (const s of innermost(f.syms, i + 1, i + 1)) out.set(s.tail, s);
    }
  }
  return [...out.values()];
}

function readSymbols(c: RawCall, abs: string, rel: string): Sym[] {
  const f = fileAt(abs, rel);
  if (!f) return [];
  const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : undefined);
  const offset = num(c.args.offset);
  const limit = num(c.args.limit);
  if (offset === undefined && limit === undefined) return innermost(f.syms, 1, ALL);
  const from = Math.max(1, offset ?? 1);
  return innermost(f.syms, from, from + (limit ?? 2000) - 1);
}

/** a step is evidence only once it finished: its result is in the transcript, and it did not fail */
const complete = (s: Step): boolean => s.ref.resultRow !== undefined && s.outcome !== 'fail';

function touchesOf(r: LoadedRun, dirs: string[]): Touch[] {
  const out: Touch[] = [];
  const where = (p: string): { checkout: string; rel: string } | undefined => {
    for (const d of dirs) if (p.startsWith(`${d}/`)) return { checkout: d, rel: p.slice(d.length + 1) };
    return undefined;
  };
  for (const s of r.steps) {
    if ((s.kind !== 'edit' && s.kind !== 'read') || !complete(s)) continue;
    const c = r.call(s.id);
    if (!c) continue;
    for (const f of new Set(s.kind === 'edit' ? s.files.edited : s.files.read)) {
      const w = where(resolve(f));
      if (!w || !CODE.test(w.rel)) continue;
      const abs = join(w.checkout, w.rel);
      const syms = s.kind === 'edit' ? editedSymbols(c, abs, w.rel) : readSymbols(c, abs, w.rel);
      for (const y of syms) out.push({ run: s.run, symbol: `${w.rel}#${y.tail}`, how: s.kind, time: s.time, step: s.id, checkout: w.checkout });
    }
  }
  return out;
}

// ---------------------------------------------------------------- the call graph: T1's indexer over each checkout
/** workspace packages of a checkout (package.json workspaces 'dir/*') -> their src/index.ts, so cross-package calls resolve */
function workspacePaths(dir: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  try {
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { workspaces?: string[] | { packages?: string[] } };
    const globs = Array.isArray(pkg.workspaces) ? pkg.workspaces : (pkg.workspaces?.packages ?? []);
    for (const g of globs) {
      const m = /^([^*]+)\/\*$/.exec(g);
      if (!m) continue;
      for (const n of readdirSync(join(dir, m[1]!))) {
        const pj = join(dir, m[1]!, n, 'package.json');
        const entry = join(dir, m[1]!, n, 'src/index.ts');
        if (!existsSync(pj) || !existsSync(entry)) continue;
        const name = (JSON.parse(readFileSync(pj, 'utf8')) as { name?: string }).name;
        if (name) out[name] = [entry];
      }
    }
  } catch {
    // no package.json / no workspaces: in-package calls only
  }
  return out;
}

const DIST = /(^|\/)dist(-tsc)?\//;
const graphCache = new Map<string, Array<[string, string]>>();
function checkoutEdges(dir: string): Array<[string, string]> {
  const hit = graphCache.get(dir);
  if (hit) return hit;
  const tmp = mkdtempSync(join(tmpdir(), 'mole-collisions-'));
  let edges: Array<[string, string]> = [];
  try {
    const cfg = join(tmp, 'tsconfig.json');
    writeFileSync(cfg, JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler', jsx: 'react-jsx', strict: true, skipLibCheck: true, noEmit: true, paths: workspacePaths(dir) }, files: [] }));
    const { indexer } = indexRepo({ root: dir, tsconfig: cfg, srcDir: existsSync(join(dir, 'src')) ? 'src' : '.', commit: 'collisions' });
    try {
      const strip = (id: string): string => id.slice(id.indexOf(':') + 1);
      edges = readGraph(indexer.db)
        .edges.filter((e) => e.kind === 'calls' && !e.from.startsWith('file:') && !e.to.startsWith('file:'))
        .map((e) => [strip(e.from), strip(e.to)] as [string, string])
        .filter(([a, b]) => a !== b && !DIST.test(a) && !DIST.test(b));
    } finally {
      indexer.close();
    }
  } catch {
    edges = []; // a checkout the indexer can't read: same-function matches still work
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  graphCache.set(dir, edges);
  return edges;
}

class Graph {
  private out = new Map<string, Set<string>>();
  add(a: string, b: string): void {
    const s = this.out.get(a);
    if (s) s.add(b);
    else this.out.set(a, new Set([b]));
  }
  /** shortest directed chain from any of `from` to any of `to`, <= hops edges, as the node list */
  chain(from: Set<string>, to: Set<string>, hops: number): string[] | undefined {
    const prev = new Map<string, string | null>();
    let frontier = [...from].sort();
    for (const f of frontier) prev.set(f, null);
    for (let d = 1; d <= hops && frontier.length; d++) {
      const next: string[] = [];
      for (const x of frontier)
        for (const y of [...(this.out.get(x) ?? [])].sort()) {
          if (prev.has(y)) continue;
          prev.set(y, x);
          if (to.has(y)) {
            const p = [y];
            for (let c = prev.get(y); c; c = prev.get(c)) p.unshift(c);
            return p;
          }
          next.push(y);
        }
      frontier = next;
    }
    return undefined;
  }
}

// ---------------------------------------------------------------- pairs
const iso = (t: number): string => new Date(t).toISOString();
interface R {
  info: CollisionRun;
  first: number;
  last: number;
  /** activity segments [start, end]: complete steps split where none happened for more than N minutes (a resumed chat is not live during its idle gap) */
  segs: Array<[number, number]>;
  touches: Touch[];
}

function segments(times: number[], gap: number): Array<[number, number]> {
  const t = [...times].sort((x, y) => x - y);
  const out: Array<[number, number]> = [];
  for (const x of t) {
    const cur = out.at(-1);
    if (cur && x - cur[1] <= gap) cur[1] = x;
    else out.push([x, x]);
  }
  return out;
}

/** `mole collisions`: pairs of parallel runs whose functions meet (same function, or a call chain <= hops), newest first. */
export function collisions(opts: CollisionsOptions): CollisionsResult {
  const N = opts.windowMinutes ?? 15;
  const hops = opts.hops ?? 2;
  const since = opts.since ?? Date.now() - DAY;
  const skipped: Skipped[] = [];
  const root = resolve(opts.root);
  const loaded = loadRuns({ ...opts, root }, skipped, { ids: opts.runs ? new Set(opts.runs) : undefined, since });
  fileCache.clear();

  const runs: R[] = [];
  for (const r of loaded.runs) {
    // the window: first and last COMPLETE step (a pending call or a half-written line is not activity yet)
    const done = r.steps.filter((s) => s.kind !== 'compaction' && s.ref.resultRow !== undefined).map((s) => Date.parse(s.time)).filter(Number.isFinite);
    if (!done.length) continue;
    const first = Math.min(...done);
    const last = Math.max(...done);
    if (last < since) continue;
    const sum = r.raw.summary;
    runs.push({ info: { id: sum.id, harness: sum.harness, title: sum.title, parent: sum.parent ?? loaded.parents.get(sum.id) ?? null, first: iso(first), last: iso(last) }, first, last, segs: segments(done, N * 60_000), touches: touchesOf(r, loaded.dirs) });
  }
  runs.sort((a, b) => b.last - a.last || a.info.id.localeCompare(b.info.id));

  const focusId = opts.run ? (runs.find((r) => r.info.id === opts.run) ?? runs.find((r) => r.info.id.startsWith(opts.run!)))?.info.id ?? opts.run : undefined;
  const parentOf = (id: string): string | undefined => loaded.parents.get(id) ?? runs.find((r) => r.info.id === id)?.info.parent ?? undefined;
  const ancestor = (a: string, b: string): boolean => {
    for (let p = parentOf(b), i = 0; p && i < 20; p = parentOf(p), i++) if (p === a) return true;
    return false;
  };
  const win = N * 60_000;
  const cands: Array<[R, R]> = [];
  for (let i = 0; i < runs.length; i++)
    for (let j = i + 1; j < runs.length; j++) {
      const a = runs[i]!;
      const b = runs[j]!;
      if (focusId && a.info.id !== focusId && b.info.id !== focusId) continue;
      if (a.first > b.last + win || b.first > a.last + win) continue; // not live at the same time
      if (!a.segs.some(([s1, e1]) => b.segs.some(([s2, e2]) => s1 <= e2 + win && s2 <= e1 + win))) continue; // only one side's idle gap overlaps
      if (ancestor(a.info.id, b.info.id) || ancestor(b.info.id, a.info.id)) continue; // delegation, not parallel work
      if (!a.touches.some((t) => t.how === 'edit') && !b.touches.some((t) => t.how === 'edit')) continue;
      if (!a.touches.length || !b.touches.length) continue;
      cands.push([a, b]);
    }

  // the call graph: the root + every checkout a candidate pair worked in
  const graph = new Graph();
  if (opts.graph) for (const [x, y] of opts.graph.edges) graph.add(x, y);
  else if (cands.length) {
    const dirs = new Set<string>([root]);
    for (const [a, b] of cands) for (const t of [...a.touches, ...b.touches]) dirs.add(t.checkout);
    for (const d of [...dirs].sort()) for (const [x, y] of checkoutEdges(d)) graph.add(x, y);
  }

  const pairs: Collision[] = [];
  for (const [a, b] of cands) {
    const set = (r: R, how?: 'edit'): Set<string> => new Set(r.touches.filter((t) => !how || t.how === how).map((t) => t.symbol));
    const ea = set(a, 'edit');
    const eb = set(b, 'edit');
    const ta = set(a);
    const tb = set(b);
    const shared = [...new Set([...ea].filter((s) => tb.has(s)).concat([...eb].filter((s) => ta.has(s))))].sort();
    let chain: string[] | undefined;
    if (!shared.length) {
      // a directed chain either way: one run's edited function calls (via <= hops edges) the other's, or is called by it
      const tries = [graph.chain(ea, tb, hops), graph.chain(tb, ea, hops), graph.chain(eb, ta, hops), graph.chain(ta, eb, hops)].filter((x): x is string[] => !!x);
      chain = tries.sort((x, y) => x.length - y.length)[0];
      if (!chain) continue;
    }
    const involved = new Set(shared.length ? shared : [chain![0]!, chain!.at(-1)!]);
    const newest = new Map<string, Touch>();
    for (const t of [...a.touches, ...b.touches]) {
      if (!involved.has(t.symbol)) continue;
      const k = `${t.run} ${t.how} ${t.symbol}`;
      const prev = newest.get(k);
      if (!prev || Date.parse(t.time) > Date.parse(prev.time)) newest.set(k, t);
    }
    const changes = [...newest.values()]
      .filter((t) => t.how === 'edit' || !newest.has(`${t.run} edit ${t.symbol}`)) // a read of what the run also edited adds nothing
      .sort((x, y) => Date.parse(y.time) - Date.parse(x.time) || x.run.localeCompare(y.run))
      .map(({ checkout: _c, ...t }) => t);
    if (!changes.length) continue;
    const side = (r: R): CollisionSide => ({ run: r.info.id, harness: r.info.harness, title: r.info.title, first: r.info.first, last: r.info.last });
    const [x, y] = changes[0]!.run === a.info.id ? [a, b] : [b, a]; // a = the run with the newest change
    const path = chain ? chain.slice(1).map((n, i) => `${chain![i]} -> ${n}`) : [];
    pairs.push({ a: side(x), b: side(y), shared, path, changes, time: changes[0]!.time });
  }
  pairs.sort((p, q) => Date.parse(q.time) - Date.parse(p.time) || p.a.run.localeCompare(q.a.run));

  return { windowMinutes: N, hops, runs: runs.map((r) => r.info), pairs, notes: noteHits(root, runs, focusId), skipped: [...new Map(skipped.map((s) => [`${s.harness} ${s.path}`, s])).values()] };
}

/** a run edits a function a note (T11 .mole/notes) is anchored to, at its current place */
function noteHits(root: string, runs: R[], focusId: string | undefined): NoteCollision[] {
  const editors = runs.filter((r) => (!focusId || r.info.id === focusId) && r.touches.some((t) => t.how === 'edit'));
  if (!editors.length) return [];
  let entries: ReturnType<typeof memory> = [];
  try {
    entries = memory(root);
  } catch {
    return [];
  }
  const on = new Map<string, string>(); // path#tail -> note file
  for (const e of entries) {
    if (!e.symbol || e.status === 'orphaned' || e.status === 'invalid') continue;
    const h = e.symbol.indexOf('#');
    on.set(`${e.newPath ?? e.path ?? e.symbol.slice(0, h)}#${e.symbol.slice(h + 1)}`, e.file);
  }
  const out: NoteCollision[] = [];
  for (const r of editors) {
    const seen = new Map<string, Touch>();
    for (const t of r.touches) if (t.how === 'edit' && on.has(t.symbol) && (!seen.has(t.symbol) || Date.parse(t.time) > Date.parse(seen.get(t.symbol)!.time))) seen.set(t.symbol, t);
    for (const t of seen.values()) out.push({ run: r.info.id, harness: r.info.harness, symbol: t.symbol, note: on.get(t.symbol)!, time: t.time, step: t.step });
  }
  return out.sort((p, q) => Date.parse(q.time) - Date.parse(p.time));
}

// ---------------------------------------------------------------- text view
const when = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};
const zone = (): string => {
  const m = -new Date().getTimezoneOffset();
  return `UTC${m >= 0 ? '+' : '-'}${String(Math.floor(Math.abs(m) / 60)).padStart(2, '0')}:${String(Math.abs(m) % 60).padStart(2, '0')}`;
};

export function formatCollisions(r: CollisionsResult): string {
  const out: string[] = [];
  const n = r.pairs.length;
  const runs = `${r.runs.length} run${r.runs.length === 1 ? '' : 's'}`;
  out.push(`mole collisions: ${n ? `${n} pair${n === 1 ? '' : 's'} of parallel runs touch related code` : 'none'} (${runs}, window ${r.windowMinutes} min, call chains <= ${r.hops} hops; times ${zone()})`);
  for (const p of r.pairs) {
    out.push('', `${when(p.time)}  ${p.a.harness} ${p.a.run}  ×  ${p.b.harness} ${p.b.run}`);
    if (p.shared.length) out.push(`  shared: ${p.shared.join(', ')}`);
    if (p.path.length) out.push(`  path:   ${p.path.join('  ·  ')}`);
    for (const c of p.changes) out.push(`  ${when(c.time)}  ${c.run}  ${c.how === 'edit' ? 'edited' : 'read  '}  ${c.symbol}`);
  }
  if (r.notes.length) {
    out.push('', 'edits under a note:');
    for (const x of r.notes) out.push(`  ${when(x.time)}  ${x.harness} ${x.run}  edited ${x.symbol}  (note ${x.note})`);
  }
  for (const s of r.skipped) out.push(`skipped ${s.harness} ${s.path}: ${s.reason}`);
  return out.join('\n');
}
