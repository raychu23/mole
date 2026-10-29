// T18 bench M6 (checks: `npm run check && node packages/agentstate/dist/bench/m6.js && node packages/agentstate/dist/bench/m7.js`).
// M6 agent-edit attribution: every file edit (commit, path) of the non-merge commits in RANGE (Mole's T1-T15 build history,
// B6: from the workspace scaffold bbb385d to T18's base 767f129) must link to a run step, >= 95%.
// The population comes from git here, not from the library. Every link the library returns is RE-CHECKED against the raw
// source record it points at (Hermes messages row / JSONL line), with this file's own reader:
//   edit link    the call record names an edit tool and its arguments contain the file path under the Mole repo or one of
//                its worktrees (or the bare repo-relative path when the run's cwd is there); the call is not after the commit
//   commit link  the call is a shell/code tool whose arguments run a commit-making command (git commit|merge|cherry-pick|
//                revert|am|rebase, or the ledger), its result contains the commit's 7-char sha, and the result time is in
//                [commit time - 120 s, commit time + 1800 s]
//                or (key ruling 1, `git commit -q` prints no sha): the result lacks the sha but the call's args name the
//                commit (subject prefix up to the first " ' ` $ \, 12-50 chars; ledger 'move: <task> <a> → <b>' / 'new: <task>
//                proposed' = `ledger` + the task's last path part + <b> as a word) and the commit happened while the call ran:
//                call time <= commit time + 2 s and result time >= commit time - 1 s
// A link that fails the re-check counts as unlinked. Exit 0 only when verified links >= 95%.
// usage: node packages/agentstate/dist/bench/m6.js [--metrics-out FILE] [--details FILE]
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { attribute, defaultSources, type Attribution, type SourceRef } from '../src/index.js';

export const RANGE = 'bbb385d^..767f129';
const TARGET = 0.95;
const EDIT_TOOLS = new Set(['write_file', 'patch', 'Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'apply_patch']);
const SHELL_TOOLS = new Set(['terminal', 'execute_code', 'Bash', 'shell', 'exec_command', 'exec', 'local_shell']);
const COMMIT_CMD = /\bgit\b[\s\S]*?\b(commit|merge|cherry-pick|revert|am|rebase)\b|\bledger\b/;

const args = process.argv.slice(2);
const flag = (n: string): string | undefined => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};
const git = (cwd: string, a: string[]): string => execFileSync('git', ['-C', cwd, ...a], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }).trim();

const top = git(process.cwd(), ['rev-parse', '--show-toplevel']);
const worktrees = git(top, ['worktree', 'list', '--porcelain'])
  .split('\n')
  .filter((l) => l.startsWith('worktree '))
  .map((l) => l.slice('worktree '.length));
const repoDirs = [...new Set([top, ...worktrees])];

// ---------- population (git only) ----------
interface Edit {
  commit: string;
  short: string;
  time: number;
  subject: string;
  path: string;
}
const edits: Edit[] = [];
for (const line of git(top, ['log', '--no-merges', '--format=%H %ct %s', RANGE]).split('\n').filter(Boolean)) {
  const [sha, ct, ...rest] = line.split(' ');
  const files = git(top, ['diff-tree', '--no-commit-id', '-r', '--name-only', '--root', sha!]).split('\n').filter(Boolean);
  for (const path of files) edits.push({ commit: sha!, short: sha!.slice(0, 7), time: Number(ct), subject: rest.join(' '), path });
}

// ---------- independent raw reader ----------
interface RawCall {
  tools: Array<{ name: string; args: string }>;
  time: number; // seconds
  cwd: string | null;
}
const dbs = new Map<string, DatabaseSync>();
const lines = new Map<string, string[]>();
function hermesRow(file: string, id: number): { role: string; tool_calls: string | null; content: string | null; timestamp: number; session_id: string } | undefined {
  let db = dbs.get(file);
  if (!db) dbs.set(file, (db = new DatabaseSync(file, { readOnly: true })));
  return db.prepare('SELECT role, tool_calls, content, timestamp, session_id FROM messages WHERE id = ?').get(id) as never;
}
function hermesCwd(file: string, session: string): string | null {
  const db = dbs.get(file)!;
  const r = db.prepare('SELECT cwd FROM sessions WHERE id = ?').get(session) as { cwd: string | null } | undefined;
  return r?.cwd ?? null;
}
function jsonLine(file: string, n: number): Record<string, unknown> | undefined {
  const l = lines.get(file) ?? readFileSync(file, 'utf8').split('\n');
  lines.set(file, l);
  const raw = l[n - 1];
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}
const sec = (v: unknown): number => (typeof v === 'number' ? v : Date.parse(String(v)) / 1000);
function codexCwd(file: string): string | null {
  const first = jsonLine(file, 1);
  const p = first?.payload as { cwd?: string } | undefined;
  return p?.cwd ?? null;
}

function rawCall(ref: SourceRef): RawCall | undefined {
  if (ref.harness === 'hermes') {
    const r = hermesRow(ref.file, ref.row);
    if (!r || !r.tool_calls) return undefined;
    const calls = JSON.parse(r.tool_calls) as Array<{ function?: { name?: string; arguments?: string } }>;
    return { tools: calls.map((c) => ({ name: c.function?.name ?? '', args: c.function?.arguments ?? '' })), time: r.timestamp, cwd: hermesCwd(ref.file, r.session_id) };
  }
  const o = jsonLine(ref.file, ref.row);
  if (!o) return undefined;
  if (ref.harness === 'claude-code') {
    const content = (o.message as { content?: unknown } | undefined)?.content;
    if (!Array.isArray(content)) return undefined;
    const tools = content
      .filter((b: { type?: string }) => b.type === 'tool_use')
      .map((b: { name?: string; input?: unknown }) => ({ name: b.name ?? '', args: JSON.stringify(b.input ?? {}) }));
    return { tools, time: sec(o.timestamp), cwd: typeof o.cwd === 'string' ? o.cwd : null };
  }
  const p = o.payload as { type?: string; name?: string; arguments?: string; input?: string } | undefined;
  if (!p || !p.name) return undefined;
  return { tools: [{ name: p.name, args: p.arguments ?? p.input ?? '' }], time: sec(o.timestamp), cwd: codexCwd(ref.file) };
}
function rawResult(ref: SourceRef): { text: string; time: number } | undefined {
  if (ref.resultRow === undefined) return undefined;
  if (ref.harness === 'hermes') {
    const r = hermesRow(ref.file, ref.resultRow);
    return r ? { text: r.content ?? '', time: r.timestamp } : undefined;
  }
  const o = jsonLine(ref.file, ref.resultRow);
  return o ? { text: JSON.stringify(o), time: sec(o.timestamp) } : undefined;
}

/** key ruling 1, rule (a): the call's args name the commit by its -m subject prefix, or (ledger commits) by task + target state */
function namesCommit(subject: string, args: string): boolean {
  let parsed = '';
  try {
    const o = JSON.parse(args) as Record<string, unknown>;
    parsed = [o.command, o.code, o.cmd].filter((v) => typeof v === 'string').join('\n');
  } catch {
    // raw args only
  }
  const texts = [args, parsed];
  const lm = /^ledger move: (\S+) \S+ → (\S+)/.exec(subject) ?? /^ledger new: (\S+) (proposed)/.exec(subject);
  if (lm) {
    const task = lm[1]!.split('/').pop()!;
    const word = new RegExp(`\\b${lm[2]!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
    return texts.some((t) => /\bledger\b/.test(t) && t.includes(task) && (lm[2] === 'proposed' || word.test(t)));
  }
  const prefix = subject.split(/["'`$\\]/)[0]!.slice(0, 50);
  return prefix.length >= 12 && texts.some((t) => t.includes(prefix));
}

const inRepo = (d: string | null): boolean => !!d && repoDirs.some((r) => d === r || d.startsWith(`${r}/`));
function verify(e: Edit, a: Attribution | undefined): { ok: boolean; why: string } {
  const link = a?.link;
  if (!link) return { ok: false, why: 'no link' };
  const call = rawCall(link.ref);
  if (!call) return { ok: false, why: `raw call record not found (${link.ref.harness} ${link.ref.file} #${link.ref.row})` };
  if (link.kind === 'edit') {
    if (call.time > e.time + 60) return { ok: false, why: 'edit step is after the commit' };
    const hit = call.tools.some((t) => {
      if (!EDIT_TOOLS.has(t.name)) return false;
      if (repoDirs.some((d) => t.args.includes(`${d}/${e.path}`))) return true;
      // bare repo-relative path (agent cwd inside the repo)
      return inRepo(call.cwd) && new RegExp(`(^|["'\\s:=])(\\./)?${e.path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(["'\\s,]|$)`).test(t.args);
    });
    return hit ? { ok: true, why: 'edit' } : { ok: false, why: 'edit call does not name the file under the repo' };
  }
  const res = rawResult(link.ref);
  if (!res) return { ok: false, why: 'raw result record not found' };
  if (!call.tools.some((t) => SHELL_TOOLS.has(t.name) && COMMIT_CMD.test(t.args))) return { ok: false, why: 'call is not a commit-making command' };
  if (!res.text.includes(e.short)) {
    const named = call.tools.some((t) => SHELL_TOOLS.has(t.name) && COMMIT_CMD.test(t.args) && namesCommit(e.subject, t.args));
    if (!(named && call.time <= e.time + 2 && res.time >= e.time - 1)) return { ok: false, why: 'result does not contain the sha' };
  }
  if (res.time < e.time - 120 || res.time > e.time + 1800) return { ok: false, why: 'result time outside the commit window' };
  return { ok: true, why: 'commit' };
}

// ---------- run ----------
const t0 = performance.now();
let got: Attribution[] = [];
let error: string | undefined;
try {
  got = attribute(top, RANGE, defaultSources());
} catch (err) {
  error = err instanceof Error ? err.message : String(err);
}
const ms = performance.now() - t0;
const byKey = new Map(got.map((a) => [`${a.commit} ${a.path}`, a]));
let viaEdit = 0;
let viaCommit = 0;
const misses: Array<{ commit: string; subject: string; path: string; why: string }> = [];
for (const e of edits) {
  const v = verify(e, byKey.get(`${e.commit} ${e.path}`));
  if (v.ok && v.why === 'edit') viaEdit++;
  else if (v.ok) viaCommit++;
  else misses.push({ commit: e.short, subject: e.subject.slice(0, 80), path: e.path, why: v.why });
}
const linked = viaEdit + viaCommit;
const share = edits.length ? linked / edits.length : 0;
const commits = new Set(edits.map((e) => e.commit)).size;
const missCommits = new Set(misses.map((m) => m.commit));
const pct = (x: number): string => `${(100 * x).toFixed(1)}%`;
const summary = `M6 ${pct(share)} (${linked}/${edits.length} file edits in ${commits} commits; via edit step ${viaEdit}, via commit step ${viaCommit}; ${missCommits.size} commits with a miss) target >= 95%`;
console.log(summary);
if (error) console.log(`  ERROR ${error}`);
console.log(`  attribute() ${Math.round(ms)} ms`);
const whyCount = new Map<string, number>();
for (const m of misses) whyCount.set(m.why, (whyCount.get(m.why) ?? 0) + 1);
for (const [w, n] of whyCount) console.log(`  miss: ${w} x${n}`);
for (const c of [...missCommits].slice(0, 15)) {
  const m = misses.filter((x) => x.commit === c);
  console.log(`  ${c} ${m[0]!.subject}  (${m.length} file${m.length === 1 ? '' : 's'}: ${m[0]!.why})`);
}
const out = flag('--metrics-out');
if (out) writeFileSync(out, JSON.stringify({ M6: summary.slice(3), M6_share: share, M6_detail: { linked, total: edits.length, viaEdit, viaCommit, ms: Math.round(ms), error } }));
const det = flag('--details');
if (det) writeFileSync(det, JSON.stringify({ misses }, null, 1));
process.exit(!error && share >= TARGET ? 0 : 1);
