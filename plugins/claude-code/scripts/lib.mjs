// Shared helpers for the Mole Claude Code hooks (node >= 22, no dependencies).
// Hook I/O follows https://code.claude.com/docs/en/hooks : JSON on stdin (session_id, cwd, hook_event_name, ...), JSON on
// stdout on exit 0. A hook never fails the session: any problem = exit 0 with no output (and a line on stderr, which Claude
// Code only writes to its debug log for exit 0).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
/** Claude Code caps additionalContext / systemMessage at 10,000 characters. */
export const MAX_CHARS = 9500;

export function readInput() {
  try {
    const raw = readFileSync(0, 'utf8').trim();
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function git(cwd, args) {
  try {
    return execFileSync('git', ['-C', cwd, '-c', 'log.showSignature=false', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 });
  } catch {
    return undefined;
  }
}

/** The repository root of `cwd`, or undefined outside git. */
export function repoRoot(cwd) {
  return git(cwd, ['rev-parse', '--show-toplevel'])?.trim() || undefined;
}

const isFile = (p) => {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
};

/**
 * How the hooks find the Mole CLI, first match wins:
 *   1. MOLE_BIN: a path to the CLI (a .js/.cjs/.mjs file runs with this node; anything else is executed). Set but missing = no CLI.
 *   2. `mole` on PATH (npm link / a global install of @mole/daemon).
 *   3. packages/daemon/dist/cli.js in the session's repository (working on Mole itself) or next to this plugin (plugin used from a Mole checkout).
 * Returns [command, prefixArgs] or undefined.
 */
export function findMole(root) {
  const asCmd = (p) => (/\.[cm]?js$/.test(p) ? [process.execPath, ['--no-warnings', p]] : [p, []]);
  if (process.env.MOLE_BIN !== undefined && process.env.MOLE_BIN !== '') return isFile(process.env.MOLE_BIN) ? asCmd(resolve(process.env.MOLE_BIN)) : undefined;
  for (const dir of (process.env.PATH ?? '').split(delimiter)) if (dir && isFile(join(dir, 'mole'))) return [join(dir, 'mole'), []];
  for (const p of [root && join(root, 'packages/daemon/dist/cli.js'), resolve(here, '../../../packages/daemon/dist/cli.js')]) if (p && isFile(p)) return asCmd(p);
  return undefined;
}

/** Run the Mole CLI and parse its --json output; undefined on any failure. */
export function moleJson(mole, root, args, timeoutMs = 45_000) {
  try {
    const out = execFileSync(mole[0], [...mole[1], ...args, '--root', root], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024 });
    return JSON.parse(out);
  } catch (e) {
    process.stderr.write(`mole hook: ${args[0]} failed: ${String(e.message ?? e).split('\n')[0]}\n`);
    return undefined;
  }
}

/** Where a session's start state lives: CLAUDE_PLUGIN_DATA (persistent plugin dir) else $TMPDIR/mole-claude-code. */
export function sessionFile(sessionId) {
  const dir = join(process.env.CLAUDE_PLUGIN_DATA || join(tmpdir(), 'mole-claude-code'), 'sessions');
  return join(dir, `${String(sessionId || 'unknown').replace(/[^\w.-]/g, '_')}.json`);
}

export function saveSession(sessionId, data) {
  try {
    const f = sessionFile(sessionId);
    mkdirSync(dirname(f), { recursive: true });
    writeFileSync(f, JSON.stringify(data));
  } catch {
    // no state = Stop falls back to the working tree vs HEAD
  }
}

export function loadSession(sessionId) {
  try {
    const f = sessionFile(sessionId);
    return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : undefined;
  } catch {
    return undefined;
  }
}

export const clip = (s, n = MAX_CHARS) => (s.length > n ? `${s.slice(0, n - 40)}\n… (cut at ${n} chars: run mole for the rest)` : s);

/** Print one JSON object for Claude Code and exit 0. */
export function emit(obj) {
  process.stdout.write(`${JSON.stringify(obj)}\n`);
}

// ---------------------------------------------------------------- T21: parallel-agent collisions for this session
const hhmm = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};
const via = (p) => (p.path?.length ? p.path.join(', ') : `shared ${p.shared.join(', ')}`);

/**
 * The repo root written the way Claude Code writes paths for this session (its cwd), not git's resolved form: transcripts
 * record cwd + file paths as the session saw them (/var/... vs git's /private/var/..., or a symlinked project folder), and
 * mole collisions matches runs to the repo by path prefix.
 */
export function sameFormRoot(root, cwd) {
  try {
    if (!cwd) return root;
    const rel = relative(root, realpathSync(cwd));
    if (rel.startsWith('..')) return root;
    const parts = rel ? rel.split('/').length : 0;
    let r = resolve(cwd);
    for (let i = 0; i < parts; i++) r = dirname(r);
    return realpathSync(r) === realpathSync(root) ? r : root;
  } catch {
    return root;
  }
}

/**
 * `mole collisions --json --run <session>` for the last few hours; undefined when the CLI fails or the session is unknown.
 * Only when the session's transcript already has a tool call: a session with no steps of its own can't collide, and the
 * CLI call (reads every harness's recent runs) is skipped.
 */
export function sessionCollisions(mole, root, input, hours = 4) {
  const sessionId = input.session_id;
  if (!sessionId || !input.transcript_path) return undefined;
  try {
    if (!readFileSync(input.transcript_path, 'utf8').includes('"tool_use"')) return undefined;
  } catch {
    return undefined;
  }
  const r = moleJson(mole, sameFormRoot(root, input.cwd), ['collisions', '--json', '--run', String(sessionId), '--since', String(hours)]);
  return r && Array.isArray(r.pairs) ? r : undefined;
}

/** SessionStart: other parallel runs whose work meets this session's (max 3 pairs). '' when none. */
export function collisionsStartText(r, sessionId) {
  const pairs = (r?.pairs ?? []).filter((p) => p.a.run === sessionId || p.b.run === sessionId);
  if (!pairs.length) return '';
  const out = [`mole: ${pairs.length} parallel run${pairs.length === 1 ? '' : 's'} touch code near yours (mole collisions):`];
  for (const p of pairs.slice(0, 3)) {
    const other = p.a.run === sessionId ? p.b : p.a;
    const did = p.changes.filter((c) => c.run === other.run).map((c) => `${c.how === 'edit' ? 'edited' : 'read'} ${c.symbol} ${hhmm(c.time)}`);
    out.push(`- ${other.harness} ${other.run}${other.title ? ` (${other.title})` : ''}: ${did.join('; ') || 'related code'}`, `  path: ${via(p)}`);
  }
  if (pairs.length > 3) out.push(`(${pairs.length - 3} more: mole collisions --run ${sessionId})`);
  return out.join('\n');
}

/** Stop: what THIS session edited that another parallel run relies on, + its edits under notes. '' when none. */
export function collisionsStopText(r, sessionId) {
  const out = [];
  for (const p of r?.pairs ?? []) {
    if (p.a.run !== sessionId && p.b.run !== sessionId) continue;
    const other = p.a.run === sessionId ? p.b : p.a;
    for (const c of p.changes.filter((c) => c.run === sessionId && c.how === 'edit')) out.push(`mole: you changed ${c.symbol}; ${other.harness} ${other.run} relies on it (${via(p)})`);
  }
  for (const n of r?.notes ?? []) if (n.run === sessionId) out.push(`mole: you edited ${n.symbol} under note ${n.note}`);
  return [...new Set(out)].join('\n');
}
