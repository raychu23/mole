// T92 review-1 fix (HIGH 1): pre-tool-use.mjs's crispDenyReason used to write the PROSPECTIVE content onto the
// REAL file, run `mole rules`, then restore it in a `finally`. A SIGKILL between the write and the restore left
// the user's file permanently changed to an edit that was never actually applied (nor even allowed) --
// reproduced live in review (4 log/t92-review-1.md): killedAt 956ms, file left holding the prospective edit.
// Fix: crispDenyReason never writes to the real path at all -- it evaluates the prospective content on a
// throwaway temp overlay (buildOverlay in lib.mjs: the directory is mirrored with symlinks, and only the one
// file under test becomes a real file, holding the content being probed). This mirrors eslint's own
// `--stdin --stdin-filename` (https://eslint.org/docs/latest/use/command-line-interface#--stdin, fetched
// 2026-11-04: pipe content in, never touch the real file) and dependency-cruiser's programmatic API taking
// file content directly rather than requiring an on-disk write (https://github.com/sverweij/dependency-cruiser/
// blob/main/doc/cli.md#programmatic-use, fetched 2026-11-04). Since the real working-tree file is never opened
// for writing, there is no window in which a SIGKILL (or any crash) can leave it changed -- this is proved
// below by polling as fast as possible for ANY divergence and killing the instant one is seen; done-when is
// zero divergences ever observed, across several kill delays.
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
  const root = mkdtempSync(join(tmpdir(), 'mole-t92-nowrite-'));
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

function spawnPreToolUse(root: string, data: string, sessionId: string) {
  const child = spawn(process.execPath, [join(plugin, 'scripts/pre-tool-use.mjs')], {
    env: { ...process.env, MOLE_BIN: cli, CLAUDE_PLUGIN_ROOT: plugin, CLAUDE_PLUGIN_DATA: data },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  child.stdin.write(JSON.stringify({ session_id: sessionId, cwd: root, hook_event_name: 'PreToolUse', tool_name: 'Edit', tool_input: { file_path: join(root, 'src/a.ts'), old_string: 'return 1;', new_string: "return require('./b').b();" } }));
  child.stdin.end();
  return child;
}

describe('T92 review-1 fix (HIGH 1): PreToolUse never writes the real file', () => {
  it.each([0, 2, 5, 15, 40, 200, 500, 900, 1300])('SIGKILL %ims after spawn: the real file never diverges from its original bytes', async (delayMs) => {
    const root = repo();
    const data = mkdtempSync(join(tmpdir(), 'mole-t92-data-'));
    dirs.push(data);
    const original = readFileSync(join(root, 'src/a.ts'), 'utf8');
    let sawDivergence = false;
    const poll = setInterval(() => {
      let cur: string | undefined;
      try {
        cur = readFileSync(join(root, 'src/a.ts'), 'utf8');
      } catch {
        cur = undefined;
      }
      if (cur !== undefined && cur !== original) sawDivergence = true;
    }, 1);
    const child = spawnPreToolUse(root, data, `sigkill-${delayMs}`);
    await new Promise((r) => setTimeout(r, delayMs));
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL');
      await new Promise((r) => child.on('exit', r));
    }
    // give any async fs activity a moment to settle, then poll once more
    await new Promise((r) => setTimeout(r, 50));
    clearInterval(poll);
    expect(sawDivergence).toBe(false);
    expect(readFileSync(join(root, 'src/a.ts'), 'utf8')).toBe(original);
  }, 20_000);

  it('concurrent PreToolUse invocations on the same file never corrupt it and each gets a correct answer', async () => {
    const root = repo();
    const data = mkdtempSync(join(tmpdir(), 'mole-t92-data-'));
    dirs.push(data);
    const original = readFileSync(join(root, 'src/a.ts'), 'utf8');
    const run = (sessionId: string) =>
      new Promise<{ json: unknown }>((resolve, reject) => {
        const child = spawn(process.execPath, [join(plugin, 'scripts/pre-tool-use.mjs')], {
          env: { ...process.env, MOLE_BIN: cli, CLAUDE_PLUGIN_ROOT: plugin, CLAUDE_PLUGIN_DATA: data },
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        let out = '';
        child.stdout.on('data', (d) => (out += d));
        child.on('error', reject);
        child.on('exit', () => resolve({ json: out.trim() ? JSON.parse(out) : undefined }));
        child.stdin.write(JSON.stringify({ session_id: sessionId, cwd: root, hook_event_name: 'PreToolUse', tool_name: 'Edit', tool_input: { file_path: join(root, 'src/a.ts'), old_string: 'return 1;', new_string: "return require('./b').b();" } }));
        child.stdin.end();
      });
    const results = await Promise.all([run('c1'), run('c2'), run('c3'), run('c4'), run('c5'), run('c6')]);
    // the real file was never touched by any concurrent invocation (none of them write the real path at all)
    expect(readFileSync(join(root, 'src/a.ts'), 'utf8')).toBe(original);
    // and every single one still correctly denies the edit (the violation-adding content), despite racing
    for (const r of results) {
      expect((r.json as { hookSpecificOutput?: { permissionDecision?: string } } | undefined)?.hookSpecificOutput?.permissionDecision).toBe('deny');
    }
  }, 30_000);
}, 180_000);
