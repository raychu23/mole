// T74 steering dials: PreToolUse + UserPromptSubmit deliver pending `mole steer` signals/accepted updates exactly
// once, as additionalContext, and never block or fail the session (contract tasks/T74-steering-dials/0 start.md).
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const plugin = join(dirname(fileURLToPath(import.meta.url)), '..');
const cli = join(plugin, '../../packages/daemon/dist/cli.js');
let root = '';
let data = '';
const g = (...args: string[]) => execFileSync('git', ['-C', root, '-c', 'user.name=Fixture', '-c', 'user.email=f@example.com', '-c', 'commit.gpgsign=false', ...args], { encoding: 'utf8' });
const mole = (...args: string[]) => execFileSync(process.execPath, ['--no-warnings', cli, ...args, '--root', root], { encoding: 'utf8' });

function hook(script: 'pre-tool-use' | 'user-prompt-submit', input: Record<string, unknown>, env: Record<string, string> = {}): { stdout: string; json?: Record<string, any> } {
  const stdout = execFileSync(process.execPath, [join(plugin, 'scripts', `${script}.mjs`)], {
    input: JSON.stringify(input),
    encoding: 'utf8',
    env: { ...process.env, MOLE_BIN: cli, CLAUDE_PLUGIN_ROOT: plugin, CLAUDE_PLUGIN_DATA: data, ...env },
    timeout: 60_000,
  });
  return { stdout, json: stdout.trim() ? JSON.parse(stdout) : undefined };
}
const common = (sid: string, event: string) => ({ session_id: sid, transcript_path: join(data, `${sid}.jsonl`), cwd: root, permission_mode: 'default', hook_event_name: event });

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'mole-steer-hook-'));
  data = mkdtempSync(join(tmpdir(), 'mole-steer-hook-data-'));
  g('init', '-q', '-b', 'main');
  writeFileSync(join(root, 'a.ts'), 'export const a = 1;\n');
  g('add', '.');
  g('commit', '-q', '-m', 'init');
}, 60_000);
afterAll(() => {
  rmSync(root, { recursive: true, force: true });
  rmSync(data, { recursive: true, force: true });
});

describe('PreToolUse: delivers a pending signal once, on any tool (not only Edit|Write)', () => {
  it('a Read tool call gets the signal as additionalContext; a second call gets nothing new', () => {
    mole('steer', 'signal', '--session', 'sess-pt1', 'stop editing a.ts for now');
    const first = hook('pre-tool-use', { ...common('sess-pt1', 'PreToolUse'), tool_name: 'Read', tool_input: { file_path: join(root, 'a.ts') } });
    const ctx: string = first.json?.hookSpecificOutput?.additionalContext ?? '';
    expect(ctx).toContain('stop editing a.ts for now');
    expect(first.json?.hookSpecificOutput?.hookEventName).toBe('PreToolUse');
    const second = hook('pre-tool-use', { ...common('sess-pt1', 'PreToolUse'), tool_name: 'Read', tool_input: { file_path: join(root, 'a.ts') } });
    expect(second.stdout.trim()).toBe('');
  });
  it('an accepted update is delivered once on a tool call with no path at all (e.g. Bash)', () => {
    mole('steer', 'update', '--session', 'sess-pt2', '--kind', 'stop-editing', '--target', 'a.ts', 'stop touching a.ts, it is frozen', '--json');
    const r = hook('pre-tool-use', { ...common('sess-pt2', 'PreToolUse'), tool_name: 'Bash', tool_input: { command: 'npm test' } });
    expect(r.json?.hookSpecificOutput?.additionalContext ?? '').toContain('stop touching a.ts, it is frozen');
    expect(hook('pre-tool-use', { ...common('sess-pt2', 'PreToolUse'), tool_name: 'Bash', tool_input: { command: 'npm test' } }).stdout.trim()).toBe('');
  });
  it('never blocks: no permissionDecision/decision field even when steering is delivered', () => {
    mole('steer', 'signal', '--session', 'sess-pt3', 'heads up');
    const r = hook('pre-tool-use', { ...common('sess-pt3', 'PreToolUse'), tool_name: 'Bash', tool_input: { command: 'rm -rf /tmp/x' } });
    expect(r.json?.decision).toBeUndefined();
    expect(r.json?.hookSpecificOutput?.permissionDecision).toBeUndefined();
  });
});

describe('UserPromptSubmit: delivers a pending signal/update once, alongside any governing-decisions text', () => {
  it('a queued signal reaches the next prompt as additionalContext, then is gone', () => {
    mole('steer', 'signal', '--session', 'sess-up1', 'the plan changed: focus on tests only');
    const first = hook('user-prompt-submit', { ...common('sess-up1', 'UserPromptSubmit'), prompt: 'keep going' });
    expect(first.json?.hookSpecificOutput?.additionalContext ?? '').toContain('the plan changed: focus on tests only');
    const second = hook('user-prompt-submit', { ...common('sess-up1', 'UserPromptSubmit'), prompt: 'keep going' });
    expect(second.stdout.trim()).toBe('');
  });
  it('silent (exit 0, no output) with an empty prompt and nothing queued', () => {
    const r = hook('user-prompt-submit', { ...common('sess-up2', 'UserPromptSubmit'), prompt: '' });
    expect(r.stdout.trim()).toBe('');
  });
});

describe('never blocks or fails the session (T74 stop condition)', () => {
  it('malformed stdin, an unknown session, or no mole CLI: exit 0, no crash', () => {
    expect(() => execFileSync(process.execPath, [join(plugin, 'scripts', 'pre-tool-use.mjs')], { input: 'not json', encoding: 'utf8', env: { ...process.env, CLAUDE_PLUGIN_DATA: data } })).not.toThrow();
    const noMole = hook('pre-tool-use', { ...common('sess-nomole', 'PreToolUse'), tool_name: 'Bash', tool_input: { command: 'echo hi' } }, { MOLE_BIN: join(data, 'no-such-mole.js') });
    expect(noMole.stdout.trim()).toBe('');
    const r2 = execFileSync(process.execPath, [join(plugin, 'scripts', 'user-prompt-submit.mjs')], { input: JSON.stringify({ ...common('sess-u', 'UserPromptSubmit'), prompt: 'x' }), encoding: 'utf8', env: { ...process.env, CLAUDE_PLUGIN_DATA: data, MOLE_BIN: join(data, 'no-such-mole.js') } });
    expect(r2.trim()).toBe('');
  });
});
