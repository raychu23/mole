// T15 done-when 4: the Claude Code plugin's hook scripts, run directly on a fixture repo + fixture hook stdin JSON
// (never installed into a real ~/.claude). SessionStart -> your notes for the files in play as additionalContext;
// Stop -> mole check on the session's diff (questions first) as a systemMessage; silent when there is nothing to say.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const plugin = join(dirname(fileURLToPath(import.meta.url)), '..');
const cli = join(plugin, '../../packages/daemon/dist/cli.js');
let root = '';
let data = '';
const g = (...args: string[]) => execFileSync('git', ['-C', root, '-c', 'user.name=Fixture', '-c', 'user.email=f@example.com', '-c', 'commit.gpgsign=false', ...args], { encoding: 'utf8' });
const mole = (...args: string[]) => execFileSync(process.execPath, ['--no-warnings', cli, ...args, '--root', root], { encoding: 'utf8' });

function hook(script: 'session-start' | 'stop', input: Record<string, unknown>, env: Record<string, string> = {}): { stdout: string; json?: Record<string, any> } {
  const stdout = execFileSync(process.execPath, [join(plugin, 'scripts', `${script}.mjs`)], {
    input: JSON.stringify(input),
    encoding: 'utf8',
    env: { ...process.env, MOLE_BIN: cli, CLAUDE_PLUGIN_ROOT: plugin, CLAUDE_PLUGIN_DATA: data, ...env },
    timeout: 60_000,
  });
  return { stdout, json: stdout.trim() ? JSON.parse(stdout) : undefined };
}
const common = (sid: string, event: string, cwd = root) => ({ session_id: sid, transcript_path: join(data, `${sid}.jsonl`), cwd, permission_mode: 'default', hook_event_name: event });

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'mole-cc-hooks-'));
  data = mkdtempSync(join(tmpdir(), 'mole-cc-data-'));
  g('init', '-q', '-b', 'main');
  mkdirSync(join(root, 'src'));
  mkdirSync(join(root, 'test'));
  // 1. c.ts + a note on it: not in play (older than the last 3 commits, not edited)
  writeFileSync(join(root, 'src/c.ts'), 'export function c() {\n  return 3;\n}\n');
  g('add', '.');
  g('commit', '-q', '-m', 'add c');
  mole('note', 'add', 'src/c.ts#c', 'NOTE-C old helper nobody touches');
  g('add', '.');
  g('commit', '-q', '-m', 'note on c');
  // 2-3. a.ts, then a fix on its line 2-3 with a reason comment and a guarding test
  writeFileSync(join(root, 'src/a.ts'), 'export function a(x: number) {\n  return x * 2;\n}\n');
  g('add', '.');
  g('commit', '-q', '-m', 'add a');
  writeFileSync(join(root, 'src/a.ts'), 'export function a(x: number) {\n  // negative input must give 0: the caller sums these\n  if (x < 0) return 0;\n  return x * 2;\n}\n');
  writeFileSync(join(root, 'test/a.test.ts'), "import { a } from '../src/a';\nit('negative input gives 0', () => {\n  expect(a(-1)).toBe(0);\n});\n");
  g('add', '.');
  g('commit', '-q', '-m', 'fix: negative input returned a negative double');
  // 4. b.ts + notes on a and b
  writeFileSync(join(root, 'src/b.ts'), 'export function b() {\n  return 1;\n}\n');
  mole('note', 'add', 'src/a.ts#a', 'NOTE-A callers sum these, keep 0 for negatives');
  mole('note', 'add', 'src/b.ts#b', 'NOTE-B returns one on purpose');
  g('add', '.');
  g('commit', '-q', '-m', 'add b + notes');
  // 5. b's body changes after its note: the note goes stale
  writeFileSync(join(root, 'src/b.ts'), 'export function b() {\n  return 2;\n}\n');
  g('commit', '-q', '-am', 'b returns two');
}, 120_000);
afterAll(() => {
  rmSync(root, { recursive: true, force: true });
  rmSync(data, { recursive: true, force: true });
});

describe('plugin layout', () => {
  it('plugin.json + hooks/hooks.json: SessionStart and Stop run node scripts under ${CLAUDE_PLUGIN_ROOT} that exist', () => {
    const manifest = JSON.parse(readFileSync(join(plugin, '.claude-plugin/plugin.json'), 'utf8'));
    expect(manifest.name).toBe('mole');
    const hooks = JSON.parse(readFileSync(join(plugin, 'hooks/hooks.json'), 'utf8')).hooks;
    for (const [event, script] of [['SessionStart', 'session-start.mjs'], ['Stop', 'stop.mjs']] as const) {
      const cmd: string = hooks[event][0].hooks[0].command;
      expect(hooks[event][0].hooks[0].type).toBe('command');
      expect(cmd).toContain('${CLAUDE_PLUGIN_ROOT}');
      expect(cmd).toContain(`scripts/${script}`);
      expect(existsSync(join(plugin, 'scripts', script))).toBe(true);
    }
  });
});

describe('hook scripts on a fixture session', () => {
  it('SessionStart: notes for the files in play (fresh and stale), not for files out of play, as hookSpecificOutput.additionalContext', () => {
    const { json } = hook('session-start', { ...common('sess-1', 'SessionStart'), source: 'startup' });
    expect(json?.hookSpecificOutput?.hookEventName).toBe('SessionStart');
    const ctx: string = json?.hookSpecificOutput?.additionalContext ?? '';
    expect(ctx).toContain('NOTE-A callers sum these');
    expect(ctx).toContain('src/a.ts#a');
    expect(ctx).toContain('NOTE-B returns one on purpose');
    expect(ctx).toMatch(/stale[^\n]*src\/b\.ts#b|src\/b\.ts#b[^\n]*stale/);
    expect(ctx).not.toContain('NOTE-C');
    expect(ctx.length).toBeLessThanOrEqual(10_000);
  });

  it('Stop: the session re-edits the fix lines -> mole check printed as systemMessage, questions first, with fix reason + test + source', () => {
    writeFileSync(join(root, 'src/a.ts'), 'export function a(x: number) {\n  // negative input must give 0: the caller sums these\n  if (x <= 0) return 0;\n  return x * 2;\n}\n');
    const { json } = hook('stop', { ...common('sess-1', 'Stop'), stop_hook_active: false, last_assistant_message: 'done' });
    const msg: string = json?.systemMessage ?? '';
    const fixSha = g('log', '-1', '--format=%h', '--grep=^fix:').trim();
    expect(msg).toContain(fixSha);
    expect(msg).toContain('fix: negative input returned a negative double');
    expect(msg).toContain('negative input must give 0');
    expect(msg).toContain('test/a.test.ts');
    expect(msg).toContain('negative input gives 0');
    expect(msg).toMatch(/src\/a\.ts:\d+/);
    expect(msg).toMatch(/questions \(\d\)/);
    expect(msg.indexOf('questions (')).toBeLessThan(msg.indexOf('fix: negative input returned'));
    expect(json?.decision).toBeUndefined(); // informs, never blocks Claude from stopping
  });

  it("Stop: the session's diff includes what it committed (base = HEAD at SessionStart)", () => {
    g('commit', '-q', '-am', 'session commit: <= 0');
    const { json } = hook('stop', { ...common('sess-1', 'Stop'), stop_hook_active: false });
    expect(json?.systemMessage ?? '').toContain('fix: negative input returned a negative double');
  });

  it('silent (no output, exit 0) when the session changed nothing, outside git, or when no mole CLI is found', () => {
    hook('session-start', { ...common('sess-2', 'SessionStart'), source: 'startup' });
    expect(hook('stop', { ...common('sess-2', 'Stop'), stop_hook_active: false }).stdout.trim()).toBe('');
    const plain = mkdtempSync(join(tmpdir(), 'mole-cc-plain-'));
    try {
      expect(hook('stop', { ...common('sess-3', 'Stop', plain), stop_hook_active: false }).stdout.trim()).toBe('');
      expect(hook('session-start', { ...common('sess-3', 'SessionStart', plain), source: 'startup' }).stdout.trim()).toBe('');
    } finally {
      rmSync(plain, { recursive: true, force: true });
    }
    writeFileSync(join(root, 'src/a.ts'), 'export function a(x: number) {\n  if (x <= 1) return 0;\n  return x * 2;\n}\n');
    expect(hook('stop', { ...common('sess-1', 'Stop'), stop_hook_active: false }, { MOLE_BIN: join(data, 'no-such-mole.js') }).stdout.trim()).toBe('');
    g('checkout', '-q', '--', 'src/a.ts');
  });
});
