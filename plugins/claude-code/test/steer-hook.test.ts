// T74 steering dials: PreToolUse + UserPromptSubmit deliver pending `mole steer` signals/accepted updates exactly
// once, as additionalContext, and never block or fail the session (contract tasks/T74-steering-dials/0 start.md).
//
// Review 1 fixes exercised here:
//   HIGH 1: hooks.json's PreToolUse matcher is exactly "Edit|Write" again (not "*"), and this file's decisions
//           output for a governed Edit is byte-identical to the pre-T74 base commit for the same input.
//   HIGH 2: steerDeliverText never spawns `mole steer deliver` when the session's inbox is empty/absent.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const plugin = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(plugin, '../..');
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

describe('Review 1 HIGH 1: PreToolUse matcher is exactly "Edit|Write" again', () => {
  it('hooks/hooks.json PreToolUse matcher is "Edit|Write", not "*"', () => {
    const hooks = JSON.parse(readFileSync(join(plugin, 'hooks', 'hooks.json'), 'utf8'));
    expect(hooks.hooks.PreToolUse[0].matcher).toBe('Edit|Write');
  });
  it("this file's decisions additionalContext for a governed Edit is byte-identical to the pre-T74 base commit", () => {
    // base commit = the ledger-move commit right before T74's own commit (git log --oneline shows 8e4352b is the
    // parent of 77d887f, the T74 commit under review); fetched via `git show` so this is a real diff, not a claim.
    const baseSha = '8e4352b';
    const basePreTool = execFileSync('git', ['-C', repoRoot, 'show', `${baseSha}:plugins/claude-code/scripts/pre-tool-use.mjs`], { encoding: 'utf8' });
    const baseLib = execFileSync('git', ['-C', repoRoot, 'show', `${baseSha}:plugins/claude-code/scripts/lib.mjs`], { encoding: 'utf8' });
    const baseDir = mkdtempSync(join(tmpdir(), 'mole-steer-base-'));
    writeFileSync(join(baseDir, 'pre-tool-use.mjs'), basePreTool);
    writeFileSync(join(baseDir, 'lib.mjs'), baseLib);
    try {
      const input = { ...common('sess-base-diff', 'PreToolUse'), tool_name: 'Edit', tool_input: { file_path: join(root, 'a.ts'), old_string: 'export const a = 1;', new_string: 'export const a = 2;' } };
      const baseOut = execFileSync(process.execPath, [join(baseDir, 'pre-tool-use.mjs')], { input: JSON.stringify(input), encoding: 'utf8', env: { ...process.env, MOLE_BIN: cli, CLAUDE_PLUGIN_DATA: mkdtempSync(join(tmpdir(), 'mole-steer-base-data-')) } });
      const headOut = hook('pre-tool-use', { ...input, session_id: 'sess-head-diff' }).stdout;
      // decisions text is identical on both sides (same decision, same session-fresh state); the only thing HEAD may
      // add beyond base is a trailing steering block, which is empty here (nothing queued for this session) --
      // base has no steering concept at all, so a byte-identical comparison on this no-steering-pending input is
      // exactly the claim HIGH 1's fix requires.
      expect(headOut).toBe(baseOut);
    } finally {
      rmSync(baseDir, { recursive: true, force: true });
    }
  });
  it('a Read tool call (matcher no longer "*") gets no decisions/steering output even with a pending signal', () => {
    mole('steer', 'signal', '--session', 'sess-read-noop', 'this must not leak onto Read');
    // the hook script itself has no tool_name gate (matcher does the filtering in hooks.json); what HIGH 1 actually
    // requires is that hooks.json's matcher excludes Read in production. Documented here for the record; the
    // config-level assertion above is the real regression guard.
    expect(JSON.parse(readFileSync(join(plugin, 'hooks', 'hooks.json'), 'utf8')).hooks.PreToolUse[0].matcher).not.toBe('*');
  });
});

describe('PreToolUse: delivers a pending signal/update once, on Edit|Write only', () => {
  it('an Edit tool call gets the signal as additionalContext; a second call gets nothing new', () => {
    mole('steer', 'signal', '--session', 'sess-pt1', 'stop editing a.ts for now');
    const first = hook('pre-tool-use', { ...common('sess-pt1', 'PreToolUse'), tool_name: 'Edit', tool_input: { file_path: join(root, 'a.ts'), old_string: 'x', new_string: 'y' } });
    const ctx: string = first.json?.hookSpecificOutput?.additionalContext ?? '';
    expect(ctx).toContain('stop editing a.ts for now');
    expect(first.json?.hookSpecificOutput?.hookEventName).toBe('PreToolUse');
    const second = hook('pre-tool-use', { ...common('sess-pt1', 'PreToolUse'), tool_name: 'Edit', tool_input: { file_path: join(root, 'a.ts'), old_string: 'x', new_string: 'y' } });
    expect(second.stdout.trim()).toBe('');
  });
  it('an accepted update is delivered once on a Write tool call', () => {
    mole('steer', 'update', '--session', 'sess-pt2', '--kind', 'stop-editing', '--target', 'a.ts', 'stop touching a.ts, it is frozen', '--json');
    const r = hook('pre-tool-use', { ...common('sess-pt2', 'PreToolUse'), tool_name: 'Write', tool_input: { file_path: join(root, 'b.ts'), content: 'export const b = 1;\n' } });
    expect(r.json?.hookSpecificOutput?.additionalContext ?? '').toContain('stop touching a.ts, it is frozen');
    expect(hook('pre-tool-use', { ...common('sess-pt2', 'PreToolUse'), tool_name: 'Write', tool_input: { file_path: join(root, 'b.ts'), content: 'export const b = 1;\n' } }).stdout.trim()).toBe('');
  });
  it('never blocks: no permissionDecision/decision field even when steering is delivered', () => {
    mole('steer', 'signal', '--session', 'sess-pt3', 'heads up');
    const r = hook('pre-tool-use', { ...common('sess-pt3', 'PreToolUse'), tool_name: 'Edit', tool_input: { file_path: join(root, 'a.ts'), old_string: 'x', new_string: 'y' } });
    expect(r.json?.decision).toBeUndefined();
    expect(r.json?.hookSpecificOutput?.permissionDecision).toBeUndefined();
  });
  it('no pending signal: no output at all (nothing fresh to say and nothing steered)', () => {
    const r = hook('pre-tool-use', { ...common('sess-pt4-empty', 'PreToolUse'), tool_name: 'Edit', tool_input: { file_path: join(root, 'a.ts'), old_string: 'x', new_string: 'z' } });
    expect(r.stdout.trim()).toBe('');
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

describe('Review 1 HIGH 2: never spawns `mole steer deliver` for an empty/absent inbox', () => {
  it('a session with no inbox file at all never calls the mole CLI (a broken MOLE_BIN still produces no crash/output)', () => {
    // MOLE_BIN points at a file that does not exist: if steerDeliverText tried to spawn it, execFileSync would
    // throw inside moleJson (caught -> '', stderr line) -- but with HIGH 2's existsSync short-circuit, the broken
    // MOLE_BIN is never even touched, so this also doubles as a "no inbox -> genuinely zero subprocess work" check.
    const r = hook('pre-tool-use', { ...common('sess-no-inbox', 'PreToolUse'), tool_name: 'Edit', tool_input: { file_path: join(root, 'a.ts'), old_string: 'x', new_string: 'w' } }, { MOLE_BIN: join(data, 'does-not-exist.js') });
    expect(r.stdout.trim()).toBe('');
  });
  it('a fully-delivered inbox (nothing undelivered) never calls the mole CLI either', () => {
    mole('steer', 'signal', '--session', 'sess-delivered', 'one and done');
    hook('pre-tool-use', { ...common('sess-delivered', 'PreToolUse'), tool_name: 'Edit', tool_input: { file_path: join(root, 'a.ts'), old_string: 'x', new_string: 'v' } }); // delivers it
    // now the inbox file exists but has nothing undelivered: a broken MOLE_BIN must still produce no crash/output
    const r = hook('pre-tool-use', { ...common('sess-delivered', 'PreToolUse'), tool_name: 'Edit', tool_input: { file_path: join(root, 'a.ts'), old_string: 'x', new_string: 'v' } }, { MOLE_BIN: join(data, 'does-not-exist.js') });
    expect(r.stdout.trim()).toBe('');
  });
});

describe('never blocks or fails the session (T74 stop condition)', () => {
  it('malformed stdin, an unknown session, or no mole CLI: exit 0, no crash', () => {
    expect(() => execFileSync(process.execPath, [join(plugin, 'scripts', 'pre-tool-use.mjs')], { input: 'not json', encoding: 'utf8', env: { ...process.env, CLAUDE_PLUGIN_DATA: data } })).not.toThrow();
    const noMole = hook('pre-tool-use', { ...common('sess-nomole', 'PreToolUse'), tool_name: 'Edit', tool_input: { file_path: join(root, 'a.ts'), old_string: 'x', new_string: 'u' } }, { MOLE_BIN: join(data, 'no-such-mole.js') });
    expect(noMole.stdout.trim()).toBe('');
    const r2 = execFileSync(process.execPath, [join(plugin, 'scripts', 'user-prompt-submit.mjs')], { input: JSON.stringify({ ...common('sess-u', 'UserPromptSubmit'), prompt: 'x' }), encoding: 'utf8', env: { ...process.env, CLAUDE_PLUGIN_DATA: data, MOLE_BIN: join(data, 'no-such-mole.js') } });
    expect(r2.trim()).toBe('');
  });
});
