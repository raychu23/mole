// @mole/coverage (T35, M27): which agent sessions read/edited which files, where no human has looked since an agent
// changed the file (weak spot), joined with guarding tests and T29's decision flags. Read-only: local session logs
// (Hermes state.db, Claude Code/Codex JSONL), git and .mole/ records; nothing leaves the machine, never message text
// (D31: the decisions behind the code, shown where the developer already works -- this is the "who touched this,
// who reviewed it, is it still governed" line of that view).
//
// Attribution reuses T18's @mole/agentstate readers verbatim (prior-art.md #3: T18 already verified file-edit
// attribution at 100%, 542/542, on this repo's own history, packages/agentstate/bench/m6.ts) -- the per-source
// readers (hermesRuns/claudeRun/codexRun) and per-call interpreters (commandOf/kindOf/editedFiles/readFiles/
// commitsOf) are imported from @mole/agentstate's own modules, never re-parsed. What T35 does NOT reuse is
// @mole/agentstate's top-level orchestration (loadRuns/candidateRuns/attribute): all three apply a `mayTouch(cwd,
// scopeDirs(root))` filter meant to exclude unrelated repos, but Mole's own loop convention (AGENTS.md / HANDOFF.md)
// is to `git worktree remove` a task's worktree once it integrates -- so a 10-29 overnight builder session whose cwd
// was `Mole-worktrees/<task>/` is invisible to that filter today even though its commits are still on a live ledger
// branch. T35's own key (bench/m27-key.json, R1, a different method again) exists for exactly this scenario. The
// commit-linking algorithm below (indexRunsNoScope/linkCommits) is copied from @mole/agentstate's own
// indexRuns/linkCommits (read-only boundary: copied, not imported, since those two functions aren't exported) with
// the cwd filter removed and path resolution switched to toRepoRel (below).
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { defaultSources, type Harness, type Skipped, type Sources } from '@mole/agentstate';
import { hermesSummaries, hermesRuns, claudeRun, codexRun, type RawCall, type RawRun } from '@mole/agentstate/dist/src/sources.js';
import { commandOf, kindOf, editedFiles, readFiles, isCommitCommand } from '@mole/agentstate/dist/src/steps.js';
import { computeFlags, loadGraph } from '@mole/decisions';
import { readSeen, relPath } from '@mole/memory';

export interface FileAgent {
  harness: Harness;
  session: string;
  read: string | null; // ISO, last time this session read the file (null = never read, only edited)
  edited: string | null; // ISO, last time this session edited the file (null = read-only)
  last: string; // ISO, max(read, edited)
}
export interface FileDecision {
  id: string;
  flag: string;
}
export interface FileWeak {
  is: boolean;
  reasons: string[];
}
export interface FileCoverage {
  file: string;
  agents: FileAgent[]; // newest `last` first
  human: { lastSeen: string | null };
  tests: string[]; // test files that statically import this file (guarding tests, T35's own code-only reachability)
  decisions: FileDecision[];
  weak: FileWeak;
}
export interface CoverageResult {
  scannedAt: string;
  files: FileCoverage[];
  skipped: Skipped[];
  malformed: number; // malformed log lines skipped while scanning (counted, never fatal)
  notice: string | null; // e.g. 'no agent sessions found in ~/.claude, ~/.codex, ~/.hermes/state.db'
}

const EXCLUDE_DIR = /^(node_modules|dist|\.git|\.mole|coverage)$/;
const TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/;

function git(root: string, args: string[]): string | undefined {
  try {
    return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 256 * 1024 * 1024 }).trim();
  } catch {
    return undefined;
  }
}

function walk(dir: string, out: string[]): void {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (EXCLUDE_DIR.test(e.name)) continue;
    const abs = join(dir, e.name);
    if (e.isDirectory()) walk(abs, out);
    else out.push(abs);
  }
}

// ---------------------------------------------------------------- agent attribution
interface AgentMark {
  harness: Harness;
  read?: string;
  edited?: string;
}
/** Mole task worktrees live at .../Project/Mole-worktrees/<task>/... and get `git worktree remove`d after a task
 * integrates; a session's recorded file paths still point at that now-gone directory. `relPath` only works when the
 * path is still under the CURRENT root. Since every Mole worktree and the main checkout share one
 * `Project/Mole[-worktrees/<task>]/` prefix by project convention, strip up to and including that prefix as a
 * fallback so attribution survives worktree cleanup; this is path normalization, not transcript parsing. */
const WORKTREE_PREFIX = /\/Mole(?:-worktrees\/[^/]+)?\/(.+)$/;
function toRepoRel(root: string, abs: string): string | undefined {
  const direct = relPath(root, abs);
  if (direct && !direct.startsWith('..') && !direct.startsWith('/')) return direct;
  const m = WORKTREE_PREFIX.exec(abs);
  return m?.[1];
}

function jsonlFiles(dir: string, skipped: Skipped[], harness: Skipped['harness']): string[] {
  if (!existsSync(dir)) {
    skipped.push({ harness, path: dir, reason: 'not found' });
    return [];
  }
  const out: string[] = [];
  walk(dir, out);
  return out.filter((f) => f.endsWith('.jsonl'));
}

/** Every known run on this machine, every harness, no cwd scoping (see the file header for why). */
function allRawRuns(opts: Required<Sources>, skipped: Skipped[]): RawRun[] {
  const out: RawRun[] = [];
  const hermes = hermesSummaries(opts.hermesDb, skipped);
  out.push(...hermesRuns(opts.hermesDb, hermes, skipped));
  for (const f of jsonlFiles(opts.claudeDir, skipped, 'claude-code')) {
    try {
      const r = claudeRun(f);
      if (r) out.push(r);
    } catch (e) {
      skipped.push({ harness: 'claude-code', path: f, reason: `unreadable: ${e instanceof Error ? e.message : String(e)}` });
    }
  }
  for (const f of jsonlFiles(opts.codexDir, skipped, 'codex')) {
    try {
      const r = codexRun(f);
      if (r) out.push(r);
    } catch (e) {
      skipped.push({ harness: 'codex', path: f, reason: `unreadable: ${e instanceof Error ? e.message : String(e)}` });
    }
  }
  return out;
}

interface Hit {
  t: number;
  run: string;
  harness: Harness;
  tool: string | null;
}
interface RunIdx {
  edits: Map<string, Hit[]>; // repo-relative path -> edit events
  made: Map<string, Hit[]>; // 7-char sha -> commit-making events whose output printed it
  committers: Array<Hit & { rt: number; command: string }>;
}
/** Copied from @mole/agentstate's own indexRuns (not exported; agentstate/src is read-only -- see file header)
 * with the cwd/scopeDirs filter removed and relPath swapped for toRepoRel. */
function indexRunsNoScope(root: string, raws: RawRun[]): RunIdx {
  const idx: RunIdx = { edits: new Map(), made: new Map(), committers: [] };
  for (const raw of raws) {
    const cwd = raw.summary.cwd;
    for (const c of raw.calls) {
      const command = commandOf(c);
      const kind = kindOf(c, command);
      const base: Hit = { t: c.time, run: raw.summary.id, harness: raw.summary.harness, tool: c.name };
      if (kind === 'edit') {
        for (const abs of editedFiles(c, cwd)) {
          const rel = toRepoRel(root, abs);
          if (rel) idx.edits.set(rel, [...(idx.edits.get(rel) ?? []), base]);
        }
      }
      if ((kind === 'command' || kind === 'test') && isCommitCommand(command)) {
        const outs = [...(c.resultRow !== undefined ? [{ text: c.resultText ?? '', time: c.resultTime ?? c.time }] : []), ...(c.late ?? [])];
        for (const o of outs)
          for (const m of o.text.matchAll(/\b[0-9a-f]{7,40}\b/g)) {
            const k = m[0].slice(0, 7);
            const l = idx.made.get(k) ?? [];
            if (!l.some((x) => x.run === base.run && x.t === o.time)) l.push({ ...base, t: o.time });
            idx.made.set(k, l);
          }
        if (outs.length) idx.committers.push({ ...base, rt: outs[0]!.time, command: command ?? '' });
      }
    }
  }
  return idx;
}
/** Copied from @mole/agentstate's own linkCommits (same reason as indexRunsNoScope). */
function linkCommitsNoScope(root: string, commits: Array<{ sha: string; t: number }>, idx: RunIdx): Array<{ commit: string; path: string; hit: Hit | null }> {
  const lastTouch = new Map<string, number>();
  const out: Array<{ commit: string; path: string; hit: Hit | null }> = [];
  for (const c of commits) {
    const files = (git(root, ['diff-tree', '--no-commit-id', '-r', '--name-only', '--root', c.sha]) ?? '').split('\n').filter(Boolean);
    const bySha = (idx.made.get(c.sha.slice(0, 7)) ?? []).filter((m) => m.t >= c.t - 120_000 && m.t <= c.t + 1_800_000).sort((a, b) => a.t - b.t)[0];
    const full = git(root, ['log', '-1', '--format=%s', c.sha]) ?? '';
    const subject = full.split(/["'`$\\]/)[0]!.slice(0, 50);
    const lm = /^ledger (?:move|new): (\S+)(?: \S+ → (\S+)| proposed)?/.exec(full);
    const said = (cmd: string): boolean =>
      lm ? /\bledger\b/.test(cmd) && cmd.includes(lm[1]!.split('/').pop()!) && (!lm[2] || new RegExp(`\\b${lm[2]}\\b`).test(cmd)) : subject.length >= 12 && cmd.includes(subject);
    const bySubject = idx.committers.filter((m) => m.t <= c.t + 2_000 && m.rt >= c.t - 1_000 && said(m.command)).sort((a, b) => b.t - a.t)[0];
    const viaCommit = bySha ?? bySubject ?? null;
    for (const path of files) {
      const prev = lastTouch.get(path) ?? -Infinity;
      lastTouch.set(path, c.t);
      const e = (idx.edits.get(path) ?? []).filter((x) => x.t > prev && x.t <= c.t + 60_000).sort((a, b) => b.t - a.t)[0];
      out.push({ commit: c.sha, path, hit: e ?? viaCommit });
    }
  }
  return out;
}
const commitsIn = (root: string, args: string[]): Array<{ sha: string; t: number }> =>
  (git(root, ['log', '--no-merges', '--reverse', '--format=%H %ct', ...args]) ?? '')
    .split('\n')
    .filter(Boolean)
    .map((l) => ({ sha: l.slice(0, 40), t: Number(l.slice(41)) * 1000 }));

function scanAgents(root: string, opts: Sources): { byFile: Map<string, Map<string, AgentMark>>; skipped: Skipped[] } {
  const skipped: Skipped[] = [];
  const merged = { ...defaultSources(), ...opts };
  const raws = allRawRuns(merged, skipped);
  // a Mole builder's actual edits usually happen in subagent runs it spawns (Hermes `sessions.parent_session_id`,
  // Claude Code's sibling subagent folders -- both already surfaced as RunSummary.parent by the readers above); a
  // builder's own coverage has to include its subagents' work, so an edit/read is attributed to the run that made
  // it AND to every run up its parent chain. This is session metadata (who spawned whom), not transcript content.
  const parentOf = new Map<string, string>();
  const harnessById = new Map<string, Harness>();
  for (const raw of raws) {
    harnessById.set(raw.summary.id, raw.summary.harness);
    if (raw.summary.parent) parentOf.set(raw.summary.id, raw.summary.parent);
  }
  function withAncestors(id: string): string[] {
    const out = [id];
    let cur = parentOf.get(id);
    let guard = 0;
    while (cur && !out.includes(cur) && guard++ < 20) {
      out.push(cur);
      cur = parentOf.get(cur);
    }
    return out;
  }
  const byFile = new Map<string, Map<string, AgentMark>>();
  const bumpOne = (rel: string, session: string, harness: Harness, kind: 'read' | 'edited', time: string): void => {
    let sessions = byFile.get(rel);
    if (!sessions) byFile.set(rel, (sessions = new Map()));
    let mark = sessions.get(session);
    if (!mark) sessions.set(session, (mark = { harness }));
    if (!mark[kind] || mark[kind]! < time) mark[kind] = time;
  };
  const bump = (rel: string | undefined, session: string, harness: Harness, kind: 'read' | 'edited', time: string): void => {
    if (!rel) return;
    for (const id of withAncestors(session)) bumpOne(rel, id, harnessById.get(id) ?? harness, kind, time);
  };
  // reads: a read-tool call (or a `cat .mole/notes/*.md`), straight from each call -- no commit linking needed
  for (const raw of raws) {
    const cwd = raw.summary.cwd;
    for (const c of raw.calls) {
      const command = commandOf(c);
      for (const abs of readFiles(c, command, cwd)) bump(toRepoRel(root, abs), raw.summary.id, raw.summary.harness, 'read', new Date(c.time).toISOString());
    }
  }
  // edits: every file any non-merge commit (any branch, `--all`) changed, linked to the edit-tool call that made it
  // or (quiet/bulk writes: terminal heredocs, scripted multi-file commits) the call that produced the commit.
  const idx = indexRunsNoScope(root, raws);
  for (const l of linkCommitsNoScope(root, commitsIn(root, ['--all']), idx)) {
    if (!l.hit) continue;
    bump(l.path, l.hit.run, l.hit.harness, 'edited', new Date(l.hit.t).toISOString());
  }
  return { byFile, skipped };
}

// ---------------------------------------------------------------- guarding tests: static import scan (code-only, R6)
function resolveImport(fromDir: string, spec: string, root: string): string | undefined {
  if (!spec.startsWith('.')) return undefined;
  const base = resolve(fromDir, spec);
  const rel = relPath(root, base);
  const candidates = [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.mjs`, join(base, 'index.ts'), join(base, 'index.js')];
  for (const c of candidates) {
    try {
      if (statSync(c).isFile()) return relPath(root, c.replace(/\.js$/, existsSync(c.replace(/\.js$/, '.ts')) ? '.ts' : '.js'));
    } catch {
      /* try next candidate */
    }
  }
  return rel; // best effort: still useful for matching even if the exact extension can't be resolved
}

const IMPORT_RE = /\b(?:import|export)\s[^;]*?from\s+['"](\.[^'"]+)['"]|require\(\s*['"](\.[^'"]+)['"]\s*\)/g;

function buildTestIndex(root: string): Map<string, Set<string>> {
  const all: string[] = [];
  for (const top of ['packages', 'apps']) {
    const dir = join(root, top);
    if (existsSync(dir)) walk(dir, all);
  }
  const index = new Map<string, Set<string>>();
  for (const abs of all) {
    if (!TEST_FILE.test(abs)) continue;
    let text: string;
    try {
      text = readFileSync(abs, 'utf8');
    } catch {
      continue;
    }
    const testRel = relPath(root, abs);
    const fromDir = resolve(abs, '..');
    for (const m of text.matchAll(IMPORT_RE)) {
      const spec = m[1] ?? m[2];
      if (!spec) continue;
      const target = resolveImport(fromDir, spec, root);
      if (!target) continue;
      let set = index.get(target);
      if (!set) index.set(target, (set = new Set()));
      set.add(testRel);
      // also index the .ts sibling of a compiled .js-style specifier, best effort
      const alt = target.replace(/\.js$/, '.ts');
      if (alt !== target) (index.get(alt) ?? index.set(alt, new Set()).get(alt)!).add(testRel);
    }
  }
  return index;
}

// ---------------------------------------------------------------- decision flags (T29, read-only)
function buildDecisionIndex(root: string): Map<string, FileDecision[]> {
  const index = new Map<string, FileDecision[]>();
  try {
    const graph = loadGraph(root);
    const flags = computeFlags(graph);
    const byId = new Map(flags.map((f) => [f.id, f]));
    for (const node of graph.nodes) {
      const flag = byId.get(node.id);
      if (!flag) continue;
      for (const anchor of node.scope) {
        const target = anchor.target.replace(/#.*$/, '').replace(/\/$/, '');
        for (const file of index.has(target) ? [] : []) void file; // no-op, keeps structure obvious
        const list = index.get(target) ?? [];
        if (!list.some((d) => d.id === node.id)) list.push({ id: node.id, flag: flag.flag });
        index.set(target, list);
      }
    }
  } catch {
    /* no .mole/ decision records in this repo: 0 decisions, not an error */
  }
  return index;
}
function decisionsFor(index: Map<string, FileDecision[]>, file: string): FileDecision[] {
  const out: FileDecision[] = [];
  for (const [target, decs] of index) {
    if (target === file || file.startsWith(`${target}/`)) out.push(...decs);
  }
  return out;
}

// ---------------------------------------------------------------- human reads (T13, read-only)
function buildHumanIndex(root: string): Map<string, string> {
  const index = new Map<string, string>();
  const events = readSeen(root) ?? [];
  for (const e of events) {
    const cur = index.get(e.path);
    if (!cur || cur < e.time) index.set(e.path, e.time);
  }
  return index;
}

function countMalformed(opts: Sources): number {
  // malformed JSONL lines are already skipped by @mole/agentstate's own readers (forEachLine warns and continues);
  // T35 counts them itself too, by re-scanning the same directories at the line level, so the schema's own
  // failure case (4) -- "malformed log lines skipped+counted" -- has a number this package computed, not just T18's.
  let n = 0;
  const dirs = [opts.claudeDir, opts.codexDir].filter((d): d is string => !!d && existsSync(d));
  for (const dir of dirs) {
    const files: string[] = [];
    walk(dir, files);
    for (const f of files.filter((p) => p.endsWith('.jsonl'))) {
      let text: string;
      try {
        text = readFileSync(f, 'utf8');
      } catch {
        continue;
      }
      for (const line of text.split('\n')) {
        if (!line.trim()) continue;
        try {
          JSON.parse(line);
        } catch {
          n++;
        }
      }
    }
  }
  return n;
}

function noAgentNotice(opts: Required<Sources>): string {
  return `no agent sessions found in ${opts.claudeDir}, ${opts.codexDir}, ${opts.hermesDb}`;
}

/** Full scan: every file any known agent session read or edited, joined with human reads, guarding tests and decision
 * flags, with a weak-spot reason computed from that same data. This is `mole coverage`'s cache: callers that need one
 * file should still call `coverage()`, which reuses a scan passed in (bench/CLI) to keep the one-file path fast
 * (M27c: p95 <= 200ms after a cached scan) without re-walking the whole repo and every session log per call. */
export function scanCoverage(root: string, opts: Sources = {}): CoverageResult {
  root = resolve(root);
  const merged = { ...defaultSources(), ...opts };
  const { byFile, skipped } = scanAgents(root, opts);
  const malformed = countMalformed(merged);
  const testIndex = buildTestIndex(root);
  const decisionIndex = buildDecisionIndex(root);
  const humanIndex = buildHumanIndex(root);

  const files: FileCoverage[] = [];
  for (const [file, sessions] of byFile) {
    const agents: FileAgent[] = [...sessions.entries()]
      .map(([session, m]) => ({
        harness: m.harness,
        session,
        read: m.read ?? null,
        edited: m.edited ?? null,
        last: (m.edited && m.read ? (m.edited > m.read ? m.edited : m.read) : m.edited ?? m.read)!,
      }))
      .sort((a, b) => (b.last < a.last ? -1 : b.last > a.last ? 1 : 0));
    const lastEdit = agents.reduce<string | null>((acc, a) => (a.edited && (!acc || a.edited > acc) ? a.edited : acc), null);
    const lastSeen = humanIndex.get(file) ?? null;
    const tests = [...(testIndex.get(file) ?? [])].sort();
    const decisions = decisionsFor(decisionIndex, file);
    const reasons: string[] = [];
    if (lastEdit) {
      if (!lastSeen) reasons.push('no human read recorded for this file (T13 seen-log) since an agent edited it');
      else if (lastSeen < lastEdit) reasons.push(`agent-edited after last human read (human read ${lastSeen}, agent edited ${lastEdit})`);
      if (tests.length === 0) reasons.push('no guarding test imports this file');
      if (decisions.some((d) => d.flag === 'red' || d.flag === 'yellow')) reasons.push('governed by a red/yellow decision');
    }
    const agentEditedWithoutRecentRead = !!lastEdit && (!lastSeen || lastSeen < lastEdit);
    const weak = { is: !!lastEdit && agentEditedWithoutRecentRead && (tests.length === 0 || decisions.some((d) => d.flag === 'red' || d.flag === 'yellow')), reasons };
    files.push({ file, agents, human: { lastSeen }, tests, decisions, weak });
  }
  files.sort((a, b) => a.file.localeCompare(b.file));
  return {
    scannedAt: new Date().toISOString(),
    files,
    skipped,
    malformed,
    notice: files.length === 0 ? noAgentNotice(merged) : null,
  };
}

const EMPTY_FILE = (file: string): FileCoverage => ({ file, agents: [], human: { lastSeen: null }, tests: [], decisions: [], weak: { is: false, reasons: [] } });

/** `mole coverage <file>`: one file's record. Pass a scan already computed (bench/CLI cache) to keep this fast
 * (M27c); otherwise this runs a full scan itself (safe for first use, slower). */
export async function coverage(root: string, file: string, opts: Sources = {}, cached?: CoverageResult): Promise<FileCoverage> {
  root = resolve(root);
  const rel = relPath(root, file);
  const scan = cached ?? scanCoverage(root, opts);
  return scan.files.find((f) => f.file === rel) ?? EMPTY_FILE(rel);
}

export { scanCoverage as scan };
