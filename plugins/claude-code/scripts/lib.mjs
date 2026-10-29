// Shared helpers for the Mole Claude Code hooks (node >= 22, no dependencies).
// Hook I/O follows https://code.claude.com/docs/en/hooks : JSON on stdin (session_id, cwd, hook_event_name, ...), JSON on
// stdout on exit 0. A hook never fails the session: any problem = exit 0 with no output (and a line on stderr, which Claude
// Code only writes to its debug log for exit 0).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
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
