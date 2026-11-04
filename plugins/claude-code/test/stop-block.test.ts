// T92/D102: the Stop hook blocks by default when a crisp (zero-model, deterministic) decision-rule violation
// (packages/decisions/src/rules, T27 `mole rules`) is in the session's diff. Anthropic's own Stop decision
// control contract (fetched 2026-11-04, code.claude.com/docs/en/hooks#stop-decision-control; see
// 4 log/prior-art.md): {"decision": "block", "reason": "..."}, with stop_hook_active true meaning "already
// continuing from a block this turn -- never block again". By-meaning/judged matches (verify.mjs) never go
// through this path; only a rule a decision record itself wrote.
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

/** A repo with one decision whose rules: forbid src/a.ts importing src/b.ts, clean at HEAD. */
function repo(): string {
  const root = mkdtempSync(join(tmpdir(), 'mole-t92-stop-'));
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

function stop(root: string, sessionId: string, env: Record<string, string> = {}, extra: Record<string, unknown> = {}) {
  const data = mkdtempSync(join(tmpdir(), 'mole-t92-data-'));
  dirs.push(data);
  const out = execFileSync(process.execPath, [join(plugin, 'scripts/stop.mjs')], {
    input: JSON.stringify({ session_id: sessionId, cwd: root, hook_event_name: 'Stop', stop_hook_active: false, ...extra }),
    encoding: 'utf8',
    env: { ...process.env, MOLE_BIN: cli, CLAUDE_PLUGIN_ROOT: plugin, CLAUDE_PLUGIN_DATA: data, MOLE_STOP_VERIFY: '0', ...env },
    timeout: 120_000,
  });
  return { json: out.trim() ? JSON.parse(out) : undefined, data };
}

describe('T92/D102 stop.mjs: crisp-rule violation blocks by default', () => {
  it('a seeded violation -> decision: "block", reason names the decision id, the rule, and a fix hint', () => {
    const root = repo();
    write(root, 'src/a.ts', "import { b } from './b';\nexport function a() {\n  return b();\n}\n");
    const { json } = stop(root, 's1');
    expect(json?.decision).toBe('block');
    expect(json?.reason).toContain('D1');
    expect(json?.reason).toMatch(/import .*\.\/b/);
    expect(json?.reason).toContain('b has no audit log'); // the decision's own `why`, used as the fix hint
    expect(json?.reason).toMatch(/mole rules/);
  });

  it('a clean diff never blocks', () => {
    const root = repo();
    const { json } = stop(root, 's2');
    expect(json?.decision).toBeUndefined();
  });

  it('stop_hook_active: true -- already continuing from a block this turn -- never blocks again', () => {
    const root = repo();
    write(root, 'src/a.ts', "import { b } from './b';\nexport function a() {\n  return b();\n}\n");
    const data = mkdtempSync(join(tmpdir(), 'mole-t92-data-'));
    dirs.push(data);
    const call = (active: boolean) =>
      JSON.parse(
        execFileSync(process.execPath, [join(plugin, 'scripts/stop.mjs')], {
          input: JSON.stringify({ session_id: 's3', cwd: root, hook_event_name: 'Stop', stop_hook_active: active }),
          encoding: 'utf8',
          env: { ...process.env, MOLE_BIN: cli, CLAUDE_PLUGIN_ROOT: plugin, CLAUDE_PLUGIN_DATA: data, MOLE_STOP_VERIFY: '0' },
          timeout: 120_000,
        }).trim() || '{}',
      );
    expect(call(false).decision).toBe('block');
    expect(call(true).decision).toBeUndefined();
  });

  it('a retry cap (MOLE_STOP_BLOCK_CAP) stops forcing a block after N blocks in one session, even with stop_hook_active false', () => {
    const root = repo();
    write(root, 'src/a.ts', "import { b } from './b';\nexport function a() {\n  return b();\n}\n");
    const data = mkdtempSync(join(tmpdir(), 'mole-t92-data-'));
    dirs.push(data);
    const call = () =>
      JSON.parse(
        execFileSync(process.execPath, [join(plugin, 'scripts/stop.mjs')], {
          input: JSON.stringify({ session_id: 's4', cwd: root, hook_event_name: 'Stop', stop_hook_active: false }),
          encoding: 'utf8',
          env: { ...process.env, MOLE_BIN: cli, CLAUDE_PLUGIN_ROOT: plugin, CLAUDE_PLUGIN_DATA: data, MOLE_STOP_VERIFY: '0', MOLE_STOP_BLOCK_CAP: '2' },
          timeout: 120_000,
        }).trim() || '{}',
      );
    expect(call().decision).toBe('block'); // 1
    expect(call().decision).toBe('block'); // 2 (cap)
    expect(call().decision).toBeUndefined(); // 3: cap reached, never loops forever
  });

  it('MOLE_STOP_BLOCK=0 opts out: the violation still shows as text, but never blocks', () => {
    const root = repo();
    write(root, 'src/a.ts', "import { b } from './b';\nexport function a() {\n  return b();\n}\n");
    const { json } = stop(root, 's5', { MOLE_STOP_BLOCK: '0' });
    expect(json?.decision).toBeUndefined();
    expect(json?.systemMessage ?? '').toContain('D1');
  });
}, 180_000);
