// T24 done-when 3: the Stop hook names each unsupported (or contradicted) claim of the session's last answer, one line each.
// Fixture repo + a fixture Claude Code transcript in MOLE_CLAUDE_DIR; the hook script runs directly (never installed).
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const plugin = join(dirname(fileURLToPath(import.meta.url)), '..');
const cli = join(plugin, '../../packages/daemon/dist/cli.js');
let base = '';
let root = '';
let claude = '';

function session(id: string, final: string): void {
  const b = { sessionId: id, cwd: root, version: '2.1.0' };
  const t = (s: number) => new Date(Date.now() - 600_000 + s * 1000).toISOString();
  const lines = [
    { ...b, type: 'user', timestamp: t(1), message: { role: 'user', content: 'run the tests' } },
    { ...b, type: 'assistant', timestamp: t(2), message: { role: 'assistant', content: [{ type: 'tool_use', id: `toolu_${id}_1`, name: 'Bash', input: { command: 'npm test' } }] } },
    { ...b, type: 'user', timestamp: t(3), message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: `toolu_${id}_1`, content: '      Tests  2 passed (2)' }] } },
    { ...b, type: 'assistant', timestamp: t(4), message: { role: 'assistant', content: [{ type: 'text', text: final }] } },
  ];
  writeFileSync(join(claude, '-fixture', `${id}.jsonl`), lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
}

function stop(id: string): { stdout: string; json?: Record<string, any> } {
  const stdout = execFileSync(process.execPath, [join(plugin, 'scripts', 'stop.mjs')], {
    input: JSON.stringify({ session_id: id, transcript_path: join(claude, '-fixture', `${id}.jsonl`), cwd: root, hook_event_name: 'Stop', stop_hook_active: false }),
    encoding: 'utf8',
    env: { ...process.env, MOLE_BIN: cli, MOLE_CLAUDE_DIR: claude, MOLE_HERMES_DB: join(base, 'none.db'), MOLE_CODEX_DIR: join(base, 'none'), CLAUDE_PLUGIN_DATA: join(base, 'data') },
    timeout: 60_000,
  });
  return { stdout, json: stdout.trim() ? JSON.parse(stdout) : undefined };
}

beforeAll(() => {
  base = mkdtempSync(join(tmpdir(), 'mole-claims-hook-'));
  root = join(base, 'repo');
  claude = join(base, 'claude');
  mkdirSync(join(claude, '-fixture'), { recursive: true });
  mkdirSync(root);
  execFileSync('git', ['init', '-q', '-b', 'main', root]);
  writeFileSync(join(root, 'a.txt'), 'a\n');
  execFileSync('git', ['-C', root, '-c', 'user.name=F', '-c', 'user.email=f@example.com', 'add', '.']);
  execFileSync('git', ['-C', root, '-c', 'user.name=F', '-c', 'user.email=f@example.com', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'a']);
  session('sess-claims-1', 'The tests pass (2/2). I pushed the branch to origin.');
  session('sess-claims-2', 'The tests pass (2/2).');
});
afterAll(() => rmSync(base, { recursive: true, force: true }));

describe('Stop hook: unsupported claims, one line each', () => {
  it('names the unsupported claim and not the supported one', () => {
    const msg: string = stop('sess-claims-1').json?.systemMessage ?? '';
    expect(msg).toContain('unsupported');
    expect(msg).toContain('I pushed the branch to origin');
    expect(msg).not.toMatch(/unsupported[^\n]*tests pass/);
  });
  it('says nothing when every claim is supported and nothing changed', () => {
    expect(stop('sess-claims-2').stdout.trim()).toBe('');
  });
});
