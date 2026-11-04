// T92 review-1 fix (HIGH 2): stop.mjs used to block on ANY crisp violation present in a file the session
// touched, even one that pre-dates the session entirely (already committed to HEAD, or already dirty in the
// working tree before SessionStart ever ran) -- reproduced live in review (4 log/t92-review-1.md) with both a
// synthetic session (no SessionStart call) and the REAL SessionStart flow. Fix: session-start.mjs now also
// snapshots a git blob (`git hash-object -w`, never a checkout, never touches the working tree) for every file
// already dirty at session start, alongside the existing `head` commit. Stop then computes "baseline"
// violations for exactly the files that have a violation NOW, evaluated via the SAME temp-overlay mechanism
// pre-tool-use.mjs uses (never a checkout) against that recorded baseline content (the blob if the file was
// already dirty at session start, else the file's content at `head`), and blocks only on violation keys
// (decision id + rule + file + target) present now but absent from that baseline -- i.e., only what THIS
// session introduced.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const plugin = join(dirname(fileURLToPath(import.meta.url)), '..');
const cli = join(plugin, '../../packages/daemon/dist/cli.js');
const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));
const ENV = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
const git = (root: string, ...a: string[]) => execFileSync('git', ['-C', root, ...a], { encoding: 'utf8', env: ENV }).trim();
function write(root: string, file: string, text: string): void {
  mkdirSync(dirname(join(root, file)), { recursive: true });
  writeFileSync(join(root, file), text);
}

function repo(): string {
  const root = mkdtempSync(join(tmpdir(), 'mole-t92-baseline-'));
  dirs.push(root);
  git(root, 'init', '-q', '-b', 'main');
  write(
    root,
    '.mole/decisions/d1.md',
    ['---', 'id: D1', "title: 'a never imports b'", 'status: accepted', 'approver: fixture-owner', 'scope:', '  - src/a.ts', 'rules:', '  - forbid: import', '    from: src/a.ts', '    to: src/b.ts', '    why: b has no audit log; a must stay auditable', '---', '## Decision', 'a() never imports b() directly.', ''].join('\n'),
  );
  write(root, 'src/a.ts', 'export function a() {\n  return 1;\n}\n');
  write(root, 'src/b.ts', 'export function b() {\n  return 2;\n}\n');
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'base: clean');
  return root;
}

function run(script: string, root: string, sessionId: string, data: string, extra: Record<string, unknown> = {}, env: Record<string, string> = {}) {
  const out = execFileSync(process.execPath, [join(plugin, 'scripts', script)], {
    input: JSON.stringify({ session_id: sessionId, cwd: root, stop_hook_active: false, ...extra }),
    encoding: 'utf8',
    env: { ...process.env, MOLE_BIN: cli, CLAUDE_PLUGIN_ROOT: plugin, CLAUDE_PLUGIN_DATA: data, MOLE_STOP_VERIFY: '0', ...env },
    timeout: 120_000,
  });
  return out.trim() ? JSON.parse(out) : undefined;
}

describe('T92 review-1 fix (HIGH 2): Stop blocks only on violations THIS session introduced', () => {
  it('a violation already COMMITTED to HEAD before the session, touched only by an unrelated edit -> no block', () => {
    const root = repo();
    write(root, 'src/a.ts', "import { b } from './b';\nexport function a() {\n  return b();\n}\n");
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'pre-existing violation, committed before any Claude Code session');
    const data = mkdtempSync(join(tmpdir(), 'mole-t92-data-'));
    dirs.push(data);
    const sessionId = 'pre-existing-committed';
    run('session-start.mjs', root, sessionId, data, { hook_event_name: 'SessionStart', source: 'startup' });
    write(root, 'src/a.ts', "import { b } from './b';\nexport function a() {\n  return b();\n}\nexport function unrelated() {\n  return 42; // not implicated by D1 at all\n}\n");
    const result = run('stop.mjs', root, sessionId, data, { hook_event_name: 'Stop' });
    expect(result?.decision).toBeUndefined();
  });

  it('a violation already DIRTY in the working tree at session start, touched only by an unrelated edit -> no block', () => {
    const root = repo();
    const data = mkdtempSync(join(tmpdir(), 'mole-t92-data-'));
    dirs.push(data);
    const sessionId = 'pre-existing-dirty';
    // violation exists in the working tree BEFORE SessionStart fires (uncommitted) -- session-start.mjs must
    // snapshot it (git hash-object -w) so Stop can tell it apart from one the session itself introduces.
    write(root, 'src/a.ts', "import { b } from './b';\nexport function a() {\n  return b();\n}\n");
    run('session-start.mjs', root, sessionId, data, { hook_event_name: 'SessionStart', source: 'startup' });
    write(root, 'src/a.ts', "import { b } from './b';\nexport function a() {\n  return b();\n}\nexport function unrelated() {\n  return 42;\n}\n");
    const result = run('stop.mjs', root, sessionId, data, { hook_event_name: 'Stop' });
    expect(result?.decision).toBeUndefined();
  });

  it('a violation the SESSION introduces (clean at SessionStart) -> block, reason names the decision', () => {
    const root = repo();
    const data = mkdtempSync(join(tmpdir(), 'mole-t92-data-'));
    dirs.push(data);
    const sessionId = 'introduces-new';
    run('session-start.mjs', root, sessionId, data, { hook_event_name: 'SessionStart', source: 'startup' });
    write(root, 'src/a.ts', "import { b } from './b';\nexport function a() {\n  return b();\n}\n");
    const result = run('stop.mjs', root, sessionId, data, { hook_event_name: 'Stop' });
    expect(result?.decision).toBe('block');
    expect(result?.reason).toContain('D1');
  });

  it('stop_hook_active true still never blocks, and the per-session cap is still respected, with a real SessionStart baseline', () => {
    const root = repo();
    const data = mkdtempSync(join(tmpdir(), 'mole-t92-data-'));
    dirs.push(data);
    const sessionId = 'cap-check';
    run('session-start.mjs', root, sessionId, data, { hook_event_name: 'SessionStart', source: 'startup' });
    write(root, 'src/a.ts', "import { b } from './b';\nexport function a() {\n  return b();\n}\n");
    const stop = (active: boolean) => run('stop.mjs', root, sessionId, data, { hook_event_name: 'Stop', stop_hook_active: active }, { MOLE_STOP_BLOCK_CAP: '2' });
    expect(stop(false)?.decision).toBe('block'); // 1
    expect(stop(false)?.decision).toBe('block'); // 2 (cap)
    expect(stop(false)?.decision).toBeUndefined(); // 3: cap reached
    expect(stop(true)?.decision).toBeUndefined(); // stop_hook_active: never re-block
  });
}, 180_000);
