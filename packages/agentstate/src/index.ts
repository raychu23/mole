// @mole/agentstate (T18): agent runs read from the local transcripts into state graphs. See types.ts for the shapes.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync, type Dirent } from 'node:fs';
import { join, resolve } from 'node:path';
import { findSymbol, memory, relPath, type MemoryEntry } from '@mole/memory';
import {
  claudeRun,
  codexMeta,
  codexRun,
  defaultSources,
  forEachLine,
  hermesRun,
  hermesRuns,
  hermesSummaries,
  type RawRun,
} from './sources.js';
import { commandOf, commitsOf, editedFiles, isCommitCommand, kindOf, operationOf, outcomeOf, readFiles } from './steps.js';
import type {
  AgentEdit,
  AgentsResult,
  Attribution,
  Checkpoint,
  ContextVersion,
  RunGraph,
  RunsOptions,
  RunSummary,
  Skipped,
  Sources,
  Step,
  StepFlag,
  TriedItem,
  TriedResult,
} from './types.js';

export * from './types.js';
export { defaultSources } from './sources.js';
export { agentCli } from './cli.js';

const srcOf = (o: Sources): Required<Sources> => ({ ...defaultSources(), ...Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) });
const git = (cwd: string, args: string[]): string | undefined => {
  try {
    return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 256 * 1024 * 1024 }).trim();
  } catch {
    return undefined;
  }
};

// ---------------------------------------------------------------- scope: the repo, its git worktrees
const scopeCache = new Map<string, string[]>();
function scopeDirs(root: string): string[] {
  const hit = scopeCache.get(root);
  if (hit) return hit;
  const wt = (git(root, ['worktree', 'list', '--porcelain']) ?? '')
    .split('\n')
    .filter((l) => l.startsWith('worktree '))
    .map((l) => l.slice('worktree '.length));
  const dirs = [...new Set([resolve(root), ...wt])].sort((a, b) => b.length - a.length);
  scopeCache.set(root, dirs);
  return dirs;
}
const under = (p: string | null, dir: string): boolean => !!p && (p === dir || p.startsWith(`${dir}/`));
const inScope = (cwd: string | null, dirs: string[]): boolean => dirs.some((d) => under(cwd, d));
/** cwd inside the repo, or a parent folder of it (an agent in ~/Desktop/CS Code can edit Project/Mole files) */
const mayTouch = (cwd: string | null, dirs: string[]): boolean => !cwd || inScope(cwd, dirs) || dirs.some((d) => d.startsWith(`${cwd}/`));
function toRel(p: string, dirs: string[]): string | undefined {
  for (const d of dirs) if (p.startsWith(`${d}/`)) return p.slice(d.length + 1);
  return undefined;
}

// ---------------------------------------------------------------- listing
interface Listed {
  summary: RunSummary;
  load: () => RawRun | undefined;
}

function claudeCwd(file: string): { id: string | null; cwd: string | null } {
  let id: string | null = null;
  let cwd: string | null = null;
  forEachLine(file, (line, n) => {
    const m = /"cwd":\s*"((?:[^"\\]|\\.)*)"/.exec(line);
    const s = /"sessionId":\s*"([^"]+)"/.exec(line);
    if (m && !cwd) cwd = JSON.parse(`"${m[1]}"`) as string;
    if (s && !id) id = s[1]!;
    return cwd && id ? false : n < 200;
  });
  return { id, cwd };
}

function listAll(o: RunsOptions, skipped: Skipped[], filter?: (cwd: string | null) => boolean): Listed[] {
  const s = srcOf(o);
  const out: Listed[] = [];
  for (const sum of hermesSummaries(s.hermesDb, skipped)) if (!filter || filter(sum.cwd)) out.push({ summary: sum, load: () => hermesRun(s.hermesDb, sum, skipped) });
  for (const r of jsonlOrSkip('claude-code', s.claudeDir, skipped)) {
    if (filter && !filter(claudeCwd(r).cwd)) continue;
    try {
      const run = claudeRun(r);
      if (run) out.push({ summary: run.summary, load: () => run });
    } catch (e) {
      skipped.push({ harness: 'claude-code', path: r, reason: `unreadable: ${e instanceof Error ? e.message : String(e)}` });
    }
  }
  for (const f of jsonlOrSkip('codex', s.codexDir, skipped)) {
    try {
      const meta = codexMeta(f);
      if (filter && !filter(meta?.cwd ?? null)) continue;
      const run = codexRun(f);
      if (run) out.push({ summary: run.summary, load: () => run });
    } catch (e) {
      skipped.push({ harness: 'codex', path: f, reason: `unreadable: ${e instanceof Error ? e.message : String(e)}` });
    }
  }
  return out;
}
/** the .jsonl files under a transcript folder; a missing/unreadable folder is a Skipped entry */
function jsonlOrSkip(harness: Skipped['harness'], dir: string, skipped: Skipped[]): string[] {
  const l = listJsonl(dir);
  if (l) return l;
  skipped.push({ harness, path: dir, reason: existsSync(dir) ? 'not a readable directory' : 'not found' });
  return [];
}
function listJsonl(dir: string): string[] | undefined {
  try {
    const out: string[] = [];
    const walk = (d: string, depth: number): void => {
      if (depth > 6) return;
      for (const e of readdirSafe(d)) {
        const p = join(d, e.name);
        if (e.isDirectory()) walk(p, depth + 1);
        else if (e.isFile() && e.name.endsWith('.jsonl')) out.push(p);
      }
    };
    if (!isDir(dir)) return undefined;
    walk(dir, 0);
    return out.sort();
  } catch {
    return undefined;
  }
}
const readdirSafe = (d: string): Dirent[] => {
  try {
    return readdirSync(d, { withFileTypes: true });
  } catch {
    return [];
  }
};
const isDir = (d: string): boolean => {
  try {
    return statSync(d).isDirectory();
  } catch {
    return false;
  }
};

const newestFirst = (a: RunSummary, b: RunSummary): number => Date.parse(b.start) - Date.parse(a.start) || a.id.localeCompare(b.id);

/** `mole runs`: every run in the 3 local sources (limited to root + its worktrees unless all), newest first. */
export function listRuns(opts: RunsOptions = {}): { runs: RunSummary[]; skipped: Skipped[] } {
  const skipped: Skipped[] = [];
  const dirs = opts.root && !opts.all ? scopeDirs(opts.root) : undefined;
  const runs = listAll(opts, skipped, dirs ? (cwd) => inScope(cwd, dirs) : undefined).map((l) => l.summary);
  return { runs: runs.sort(newestFirst), skipped: dedupeSkipped(skipped) };
}
const dedupeSkipped = (s: Skipped[]): Skipped[] => [...new Map(s.map((x) => [`${x.harness} ${x.path}`, x])).values()];

/** find one run by id or unique id prefix, without parsing every transcript */
function findRun(id: string, o: RunsOptions, skipped: Skipped[]): { raw: RawRun; all: () => RunSummary[] } | undefined {
  const s = srcOf(o);
  const hermes = hermesSummaries(s.hermesDb, skipped);
  const cands: Array<{ id: string; load: () => RawRun | undefined }> = [];
  for (const h of hermes) if (h.id.startsWith(id)) cands.push({ id: h.id, load: () => hermesRun(s.hermesDb, h, skipped) });
  for (const f of listJsonl(s.claudeDir) ?? []) {
    const name = f.split('/').pop()!.replace(/\.jsonl$/, '');
    if (name.startsWith(id) || (name.startsWith('agent-') && name.slice(6).startsWith(id))) cands.push({ id: name, load: () => claudeRun(f) });
  }
  for (const f of listJsonl(s.codexDir) ?? []) {
    const m = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/.exec(f);
    if (m && m[1]!.startsWith(id)) cands.push({ id: m[1]!, load: () => codexRun(f) });
  }
  const exact = cands.filter((c) => c.id === id);
  const pick = exact.length ? exact : cands;
  if (pick.length !== 1) return undefined;
  const raw = pick[0]!.load();
  if (!raw) return undefined;
  return { raw, all: () => hermes };
}

// ---------------------------------------------------------------- git timeline (context version)
interface Timeline {
  repo: string;
  commits: Array<{ sha: string; t: number }>;
  objects: Map<string, Record<string, string | null>>;
}
const timelines = new Map<string, Timeline | null>();
function timeline(repo: string): Timeline | null {
  if (timelines.has(repo)) return timelines.get(repo)!;
  const log = git(repo, ['log', '--all', '--format=%H %ct']);
  const tl = log === undefined ? null : { repo, commits: log.split('\n').filter(Boolean).map((l) => ({ sha: l.slice(0, 40), t: Number(l.slice(41)) * 1000 })).sort((a, b) => a.t - b.t), objects: new Map() };
  timelines.set(repo, tl);
  return tl;
}
const GUIDES = ['AGENTS.md', 'CLAUDE.md', '.mole'];
function shaAt(tl: Timeline, t: number): string | null {
  let lo = 0;
  let hi = tl.commits.length - 1;
  let best = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (tl.commits[mid]!.t <= t) {
      best = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return best >= 0 ? tl.commits[best]!.sha : null;
}
function objectsAt(tl: Timeline, sha: string | null): Record<string, string | null> {
  const none = Object.fromEntries(GUIDES.map((g) => [g, null])) as Record<string, string | null>;
  if (!sha) return none;
  const hit = tl.objects.get(sha);
  if (hit) return hit;
  const out = { ...none };
  for (const l of (git(tl.repo, ['ls-tree', sha, '--', ...GUIDES]) ?? '').split('\n')) {
    const m = /^\d+ \w+ ([0-9a-f]+)\t(.+)$/.exec(l);
    if (m && m[2]! in out) out[m[2]!] = m[1]!;
  }
  tl.objects.set(sha, out);
  return out;
}

// ---------------------------------------------------------------- one run -> steps + graph
function buildSteps(raw: RawRun): Step[] {
  const cwd = raw.summary.cwd;
  const items: Array<{ order: number; step: Omit<Step, 'index'> }> = [];
  raw.compactions.forEach((c, i) =>
    items.push({
      order: c.order,
      step: {
        id: `${raw.summary.id}:compaction-${i + 1}`,
        run: raw.summary.id,
        time: new Date(c.time).toISOString(),
        operation: 'compaction',
        kind: 'compaction',
        tool: null,
        command: null,
        outcome: null,
        files: { read: [], edited: [] },
        commits: [],
        child: null,
        segment: i + 1,
        ref: { harness: raw.summary.harness, file: raw.file, row: c.row },
        flags: [],
      },
    }),
  );
  for (const c of raw.calls) {
    const command = commandOf(c);
    const kind = kindOf(c, command);
    const seg = raw.compactions.findIndex((k) => k.order > c.order);
    items.push({
      order: c.order,
      step: {
        id: `${raw.summary.id}:${c.callId}`,
        run: raw.summary.id,
        time: new Date(Number.isFinite(c.time) ? c.time : Date.parse(raw.summary.start)).toISOString(),
        operation: operationOf(c, kind),
        kind,
        tool: c.name || null,
        command,
        outcome: kind === 'read' || kind === 'other' ? (c.resultText === undefined ? 'unknown' : 'pass') : outcomeOf(c, kind, command, raw),
        files: { read: readFiles(c, command, cwd), edited: editedFiles(c, cwd) },
        commits: commitsOf(c, command),
        child: null,
        segment: seg === -1 ? null : seg + 1,
        ref: { harness: raw.summary.harness, file: raw.file, row: c.row, ...(c.resultRow !== undefined ? { resultRow: c.resultRow } : {}) },
        flags: [],
      },
    });
  }
  // a compaction sorts after everything it compacted (same order key never happens: rows/lines are unique)
  items.sort((a, b) => a.order - b.order || (a.step.kind === 'compaction' ? 1 : -1));
  return items.map((x, index) => ({ ...x.step, index }));
}

function triedOf(s: Step): TriedItem | undefined {
  if (s.kind !== 'command' && s.kind !== 'test' && s.kind !== 'edit') return undefined;
  const command = s.kind === 'edit' ? `${s.tool ?? 'edit'} ${s.files.edited.join(' ')}`.trim() : (s.command ?? '');
  return { command, kind: s.kind, outcome: s.outcome ?? 'unknown', at: s.time, segment: s.segment, run: s.run, step: s.id };
}

function repoOf(raw: RawRun, root: string | undefined): string | null {
  const cwd = raw.summary.cwd;
  if (root && inScope(cwd, scopeDirs(root))) return resolve(root);
  if (!cwd) return null;
  return git(cwd, ['rev-parse', '--show-toplevel']) ?? null;
}

function children(raw: RawRun, steps: Step[], o: RunsOptions, skipped: Skipped[], hermesAll: () => RunSummary[]): RunGraph['children'] {
  const out: RunGraph['children'] = [];
  if (raw.summary.harness === 'hermes') {
    const kids = hermesAll().filter((s) => s.parent === raw.summary.id).sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
    const delegates = steps.filter((s) => s.kind === 'subagent');
    for (const k of kids) {
      const start = Date.parse(k.start);
      const by = [...delegates].reverse().find((d) => Date.parse(d.time) <= start + 5000) ?? null;
      const call = by ? raw.calls.find((c) => `${raw.summary.id}:${c.callId}` === by.id) : undefined;
      if (by && !by.child) by.child = k.id;
      out.push({ run: k, spawnedBy: by?.id ?? null, mergedAt: call?.resultTime ? new Date(call.resultTime).toISOString() : null });
    }
  } else if (raw.summary.harness === 'claude-code') {
    const dir = join(raw.file.replace(/\.jsonl$/, ''), 'subagents');
    for (const f of listJsonl(dir) ?? []) {
      const k = claudeRun(f);
      if (!k) continue;
      let toolUseId: string | undefined;
      try {
        toolUseId = (JSON.parse(readFileSync(f.replace(/\.jsonl$/, '.meta.json'), 'utf8')) as { toolUseId?: string }).toolUseId;
      } catch {
        // no meta file: fall back to time
      }
      const by = (toolUseId && steps.find((s) => s.id === `${raw.summary.id}:${toolUseId}`)) || [...steps].reverse().find((s) => s.kind === 'subagent' && Date.parse(s.time) <= Date.parse(k.summary.start) + 5000) || null;
      const call = by ? raw.calls.find((c) => `${raw.summary.id}:${c.callId}` === by.id) : undefined;
      if (by && !by.child) by.child = k.summary.id;
      out.push({ run: { ...k.summary, parent: raw.summary.id }, spawnedBy: by?.id ?? null, mergedAt: call?.resultTime ? new Date(call.resultTime).toISOString() : null });
    }
  }
  void o;
  void skipped;
  return out;
}

const STALE: ReadonlySet<string> = new Set(['stale', 'orphaned', 'invalid']);
function flagSteps(steps: Step[], repo: string | null, dirs: string[], tl: Timeline | null): void {
  if (!repo) return;
  let notes: MemoryEntry[] | undefined;
  const headObjs = tl ? objectsAt(tl, git(repo, ['rev-parse', 'HEAD']) ?? null) : undefined;
  for (const s of steps) {
    for (const f of s.files.read) {
      const rel = toRel(f, dirs);
      if (!rel) continue;
      if (rel.startsWith('.mole/notes/')) {
        notes ??= safeMemory(repo);
        const e = notes.find((n) => n.file === rel);
        if (e && (STALE.has(e.status) || (e.status === 'moved' && e.changed)))
          s.flags.push({ kind: 'stale-note', file: rel, detail: `note on ${e.symbol ?? rel} is now ${e.status}${e.changed ? ' (body changed)' : ''}` });
      } else if ((rel === 'AGENTS.md' || rel === 'CLAUDE.md') && tl && headObjs) {
        const then = objectsAt(tl, shaAt(tl, Date.parse(s.time)))[rel];
        if (then && headObjs[rel] && then !== headObjs[rel]) s.flags.push({ kind: 'context-changed', file: rel, detail: `${rel} changed since this step read it` });
      }
    }
  }
}
function safeMemory(repo: string): MemoryEntry[] {
  try {
    return memory(repo);
  } catch {
    return [];
  }
}

function graphOf(raw: RawRun, o: RunsOptions, skipped: Skipped[], hermesAll: () => RunSummary[]): RunGraph {
  const steps = buildSteps(raw);
  const kids = children(raw, steps, o, skipped, hermesAll);
  const repo = repoOf(raw, o.root);
  const dirs = repo ? (o.root && repo === resolve(o.root) ? scopeDirs(o.root) : [repo]) : [];
  const tl = repo ? timeline(repo) : null;
  flagSteps(steps, repo, dirs, tl);
  const checkpoints: Checkpoint[] = [];
  const read: string[] = [];
  const files = new Set<string>();
  const commits = new Set<string>();
  let parent: string | null = null;
  for (const s of steps) {
    for (const f of s.files.read) if (!read.includes(f)) read.push(f);
    for (const f of s.files.edited) files.add(f);
    for (const c of s.commits) commits.add(c);
    const sha = tl ? shaAt(tl, Date.parse(s.time)) : null;
    const context: ContextVersion = { repo, gitSha: sha, files: tl ? objectsAt(tl, sha) : Object.fromEntries(GUIDES.map((g) => [g, null])), read: [...read] };
    const t = triedOf(s);
    const id = `${raw.summary.id}:${s.index}`;
    checkpoints.push({
      thread_id: raw.summary.id,
      checkpoint_ns: '',
      checkpoint_id: id,
      parent_checkpoint_id: parent,
      ts: s.time,
      metadata: { source: raw.summary.harness, step: s.index, operation: s.operation, kind: s.kind },
      values: { context, tried: t ? [t] : [], changed: { files: [...files], commits: [...commits] } },
    });
    parent = id;
  }
  const compactions = steps.filter((s) => s.kind === 'compaction').map((s) => ({ index: s.segment!, time: s.time, step: s.id }));
  return { run: { ...raw.summary, steps: steps.length - compactions.length }, steps, children: kids, compactions, checkpoints, skipped: dedupeSkipped(skipped) };
}

/** `mole run <id>`: the state graph of one run (id or unique prefix). null when no source has it. */
export function getRun(id: string, opts: RunsOptions = {}): RunGraph | null {
  const skipped: Skipped[] = [];
  const f = findRun(id, opts, skipped);
  return f ? graphOf(f.raw, opts, skipped, f.all) : null;
}

// ---------------------------------------------------------------- tried
/** `mole tried <run | file#Symbol>`: commands/tests/fixes already tried, with outcome and the compaction they came before. */
export function tried(target: string, opts: RunsOptions = {}): TriedResult {
  const skipped: Skipped[] = [];
  const isFile = /[#/]|\.[A-Za-z]+$/.test(target);
  const f = isFile ? undefined : findRun(target, opts, skipped);
  if (f) {
    const items = buildSteps(f.raw).map(triedOf).filter((x): x is TriedItem => !!x);
    return { target, runs: [f.raw.summary.id], items, skipped: dedupeSkipped(skipped) };
  }
  if (!opts.root) return { target, runs: [], items: [], skipped: dedupeSkipped(skipped) };
  const a = agentsIn(target, { ...opts, root: opts.root }, skipped);
  const runs = [...new Set(a.edits.map((e) => e.run))];
  const items: TriedItem[] = [];
  for (const r of runs) {
    const raw = a.raws.get(r);
    if (raw) for (const s of buildSteps(raw)) {
      const t = triedOf(s);
      if (t) items.push(t);
    }
  }
  return { target, runs, items, skipped: dedupeSkipped(skipped) };
}

// ---------------------------------------------------------------- agents + attribution
function candidateRuns(o: RunsOptions & { root: string }, skipped: Skipped[]): RawRun[] {
  const s = srcOf(o);
  const dirs = scopeDirs(o.root);
  const hermes = hermesSummaries(s.hermesDb, skipped).filter((h) => mayTouch(h.cwd, dirs));
  const out = hermesRuns(s.hermesDb, hermes, skipped);
  for (const f of jsonlOrSkip('claude-code', s.claudeDir, skipped)) {
    try {
      if (!mayTouch(claudeCwd(f).cwd, dirs)) continue;
      const r = claudeRun(f);
      if (r) out.push(r);
    } catch (e) {
      skipped.push({ harness: 'claude-code', path: f, reason: `unreadable: ${e instanceof Error ? e.message : String(e)}` });
    }
  }
  for (const f of jsonlOrSkip('codex', s.codexDir, skipped)) {
    try {
      if (!mayTouch(codexMeta(f)?.cwd ?? null, dirs)) continue;
      const r = codexRun(f);
      if (r) out.push(r);
    } catch (e) {
      skipped.push({ harness: 'codex', path: f, reason: `unreadable: ${e instanceof Error ? e.message : String(e)}` });
    }
  }
  return out;
}

const editText = (args: Record<string, unknown>): string[] => {
  const out: string[] = [];
  for (const k of ['new_string', 'content', 'new_source']) if (typeof args[k] === 'string') out.push(args[k] as string);
  if (Array.isArray(args.edits)) for (const e of args.edits as Array<{ new_string?: unknown }>) if (typeof e.new_string === 'string') out.push(e.new_string);
  for (const k of ['patch', 'input']) if (typeof args[k] === 'string') out.push((args[k] as string).split('\n').filter((l) => l.startsWith('+')).map((l) => l.slice(1)).join('\n'));
  return out;
};
const meaningful = (l: string): boolean => l.trim().replace(/[{}();,\s]/g, '').length >= 4;

function agentsIn(target: string, o: RunsOptions & { root: string }, skipped: Skipped[]): AgentsResult & { raws: Map<string, RawRun> } {
  const root = resolve(o.root);
  const dirs = scopeDirs(root);
  const hash = target.indexOf('#');
  const rel = relPath(root, hash > 0 ? target.slice(0, hash) : target);
  const tail = hash > 0 ? target.slice(hash + 1) : undefined;
  let body: Set<string> | undefined;
  if (tail) {
    const sym = findSymbol(root, `${rel}#${tail}`);
    if (!sym) return { target, edits: [], skipped: dedupeSkipped(skipped), raws: new Map() };
    const lines = readFileSync(join(root, rel), 'utf8').split('\n').slice(sym.startLine - 1, sym.endLine);
    body = new Set(lines.map((l) => l.trim()).filter(meaningful));
  }
  const edits: AgentEdit[] = [];
  const raws = new Map<string, RawRun>();
  const commitFiles = new Map<string, string[]>();
  for (const raw of candidateRuns({ ...o, root }, skipped)) {
    const steps = buildSteps(raw);
    for (const s of steps) {
      if (s.kind === 'edit' && s.files.edited.some((f) => toRel(f, dirs) === rel)) {
        if (body) {
          const call = raw.calls.find((c) => `${raw.summary.id}:${c.callId}` === s.id);
          const touched = editText(call?.args ?? {}).some((t) => t.split('\n').some((l) => meaningful(l) && body!.has(l.trim())));
          if (!touched) continue;
        }
        edits.push({ run: raw.summary.id, harness: raw.summary.harness, step: s.id, time: s.time, tool: s.tool, via: 'edit', commit: null });
        raws.set(raw.summary.id, raw);
      } else if (!body && s.commits.length) {
        for (const c of s.commits) {
          let files = commitFiles.get(c);
          if (!files) commitFiles.set(c, (files = (git(root, ['show', '--name-only', '--format=', c]) ?? '').split('\n').filter(Boolean)));
          if (files.includes(rel)) {
            edits.push({ run: raw.summary.id, harness: raw.summary.harness, step: s.id, time: s.time, tool: s.tool, via: 'commit', commit: c });
            raws.set(raw.summary.id, raw);
          }
        }
      }
    }
  }
  edits.sort((a, b) => Date.parse(b.time) - Date.parse(a.time) || b.step.localeCompare(a.step));
  return { target, edits, skipped: dedupeSkipped(skipped), raws };
}

/** `mole agents <file[#Symbol]>`: runs + steps that edited it, newest first. */
export function agents(target: string, opts: RunsOptions & { root: string }): AgentsResult {
  const { raws: _raws, ...r } = agentsIn(target, opts, []);
  return r;
}

/** M6: every file edit of every non-merge commit in range, linked to the run step that edited it (or committed it). */
export function attribute(root: string, range: string, opts: Sources = {}): Attribution[] {
  root = resolve(root);
  const dirs = scopeDirs(root);
  const log = git(root, ['log', '--no-merges', '--reverse', '--format=%H %ct', range]) ?? '';
  const commits = log.split('\n').filter(Boolean).map((l) => ({ sha: l.slice(0, 40), t: Number(l.slice(41)) * 1000 }));
  const edits = new Map<string, Array<{ t: number; run: string; step: string; ref: Step['ref'] }>>();
  const made = new Map<string, Array<{ t: number; run: string; step: string; ref: Step['ref'] }>>();
  const committers: Array<{ t: number; command: string; run: string; step: string; ref: Step['ref'] }> = [];
  for (const raw of candidateRuns({ ...opts, root }, [])) {
    for (const s of buildSteps(raw)) {
      const t = Date.parse(s.time);
      if (s.kind === 'edit' && s.outcome !== 'fail')
        for (const f of s.files.edited) {
          const rel = toRel(f, dirs);
          if (rel) edits.set(rel, [...(edits.get(rel) ?? []), { t, run: s.run, step: s.id, ref: s.ref }]);
        }
      if ((s.kind === 'command' || s.kind === 'test') && isCommitCommand(s.command)) {
        const call = raw.calls.find((c) => `${raw.summary.id}:${c.callId}` === s.id);
        if (!call) continue;
        // the sha is printed by the command itself, or (background command) in a later poll / completion notice
        const outs = [
          ...(call.resultRow !== undefined ? [{ row: call.resultRow, text: call.resultText ?? '', time: call.resultTime ?? t }] : []),
          ...(call.late ?? []),
        ];
        for (const o of outs)
          for (const m of o.text.matchAll(/\b[0-9a-f]{7,40}\b/g)) {
            const k = m[0].slice(0, 7);
            const l = made.get(k) ?? [];
            if (!l.some((x) => x.step === s.id)) l.push({ t: o.time, run: s.run, step: s.id, ref: { ...s.ref, resultRow: o.row } });
            made.set(k, l);
          }
        if (outs.length) committers.push({ t, command: s.command ?? '', run: s.run, step: s.id, ref: { ...s.ref, resultRow: outs[0]!.row } });
      }
    }
  }
  const lastTouch = new Map<string, number>();
  const out: Attribution[] = [];
  for (const c of commits) {
    const files = (git(root, ['diff-tree', '--no-commit-id', '-r', '--name-only', '--root', c.sha]) ?? '').split('\n').filter(Boolean);
    // 1) the commit-making command printed the sha; 2) it ran `git commit -q` (prints nothing): its -m message is the subject
    const bySha = (made.get(c.sha.slice(0, 7)) ?? []).filter((m) => m.t >= c.t - 120_000 && m.t <= c.t + 1_800_000).sort((a, b) => a.t - b.t)[0];
    const full = git(root, ['log', '-1', '--format=%s', c.sha]) ?? '';
    const subject = full.split(/["'`$\\]/)[0]!.slice(0, 50);
    // the ledger writes its own subject ('ledger move: tasks/T2-x verified → integrated'): match the command that asked for it
    const lm = /^ledger (?:move|new): (\S+)(?: \S+ → (\S+)| proposed)?/.exec(full);
    const said = (cmd: string): boolean =>
      lm ? /\bledger\b/.test(cmd) && cmd.includes(lm[1]!.split('/').pop()!) && (!lm[2] || new RegExp(`\\b${lm[2]}\\b`).test(cmd)) : subject.length >= 12 && cmd.includes(subject);
    const bySubject = committers.filter((m) => m.t >= c.t - 1_800_000 && m.t <= c.t + 60_000 && said(m.command)).sort((a, b) => b.t - a.t)[0];
    const viaCommit = bySha ?? bySubject;
    for (const path of files) {
      const prev = lastTouch.get(path) ?? -Infinity;
      const e = (edits.get(path) ?? []).filter((x) => x.t > prev && x.t <= c.t + 60_000).sort((a, b) => b.t - a.t)[0];
      out.push({
        commit: c.sha,
        path,
        link: e ? { kind: 'edit', run: e.run, step: e.step, ref: e.ref } : viaCommit ? { kind: 'commit', run: viaCommit.run, step: viaCommit.step, ref: viaCommit.ref } : null,
      });
      lastTouch.set(path, c.t);
    }
  }
  return out;
}
