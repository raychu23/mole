// T21 done-when 2, hook half (waited for T15; mole-builder-3, 2026-10-29). Spec: tasks/T21-parallel-agent-collisions/2 insights.md
// 'hook follow-up'. SessionStart: other parallel runs touching code near this session's (mole collisions --run <session>);
// Stop: only what THIS session edited that another parallel run relies on. Silent when there are no pairs.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const plugin = join(dirname(fileURLToPath(import.meta.url)), '..');
const cli = join(plugin, '../../packages/daemon/dist/cli.js');
const A_TS = 'export function top(): number {\n  return mid() + 1;\n}\n\nexport function mid(): number {\n  return 2;\n}\n';
const E_TS = "export function gamma(): string {\n  return 'gamma';\n}\n";
const MID = 'export function mid(): number {\n  return 2;\n}';
let base = '';
let root = '';
let claudeDir = '';
let data = '';
const NOW = Date.now();
const ago = (min: number): string => new Date(NOW - min * 60_000).toISOString();
const g = (...args: string[]) => execFileSync('git', ['-C', root, '-c', 'user.name=Fixture', '-c', 'user.email=f@example.com', '-c', 'commit.gpgsign=false', ...args], { encoding: 'utf8' });
function session(id: string, steps: Array<[number, 'Edit' | 'Read', Record<string, unknown>]>): void {
  const lines: string[] = [];
  steps.forEach(([m, tool, input], i) => {
    const tid = `toolu_${id}_${i}`;
    lines.push(JSON.stringify({ type: 'assistant', sessionId: id, cwd: root, timestamp: ago(m), message: { role: 'assistant', content: [{ type: 'tool_use', id: tid, name: tool, input }] } }));
    lines.push(JSON.stringify({ type: 'user', sessionId: id, cwd: root, timestamp: ago(m - 0.05), message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: tid, content: 'ok' }] } }));
  });
  writeFileSync(join(claudeDir, 'proj', `${id}.jsonl`), lines.join('\n') + '\n');
}
function hook(script: 'session-start' | 'stop', sid: string, event: string): { stdout: string; json?: Record<string, any> } {
  const stdout = execFileSync(process.execPath, [join(plugin, 'scripts', `${script}.mjs`)], {
    input: JSON.stringify({ session_id: sid, transcript_path: join(claudeDir, 'proj', `${sid}.jsonl`), cwd: root, permission_mode: 'default', hook_event_name: event, source: 'resume' }),
    encoding: 'utf8',
    env: { ...process.env, MOLE_BIN: cli, CLAUDE_PLUGIN_ROOT: plugin, CLAUDE_PLUGIN_DATA: data, MOLE_CLAUDE_DIR: claudeDir, MOLE_HERMES_DB: join(base, 'none.db'), MOLE_CODEX_DIR: join(base, 'none') },
    timeout: 90_000,
  });
  return { stdout, json: stdout.trim() ? JSON.parse(stdout) : undefined };
}

beforeAll(() => {
  base = mkdtempSync(join(tmpdir(), 'mole-t21-hook-'));
  root = join(base, 'repo');
  claudeDir = join(base, 'claude');
  data = join(base, 'data');
  mkdirSync(join(root, 'src'), { recursive: true });
  mkdirSync(join(claudeDir, 'proj'), { recursive: true });
  mkdirSync(data);
  g('init', '-q', '-b', 'main');
  writeFileSync(join(root, 'src/a.ts'), A_TS);
  writeFileSync(join(root, 'src/e.ts'), E_TS);
  g('add', '.');
  g('commit', '-q', '-m', 'fixture');
  // s-me edits mid; s-other reads mid (lines 5-7) while s-me works; s-solo edits only e.ts, alone
  session('s-me', [[10, 'Edit', { file_path: join(root, 'src/a.ts'), old_string: MID, new_string: MID }]]);
  session('s-other', [[8, 'Read', { file_path: join(root, 'src/a.ts'), offset: 5, limit: 3 }]]);
  session('s-solo', [[300, 'Edit', { file_path: join(root, 'src/e.ts'), old_string: E_TS.trim(), new_string: E_TS.trim() }]]);
}, 60_000);
afterAll(() => rmSync(base, { recursive: true, force: true }));

describe('Claude Code hooks: parallel-agent collisions (T21 done-when 2)', () => {
  it('SessionStart names the other parallel run and the function they share', () => {
    const r = hook('session-start', 's-other', 'SessionStart');
    const text = String(r.json?.hookSpecificOutput?.additionalContext ?? '');
    expect(text).toContain('parallel run');
    expect(text).toContain('s-me');
    expect(text).toContain('src/a.ts#mid');
  }, 120_000);
  it('Stop tells the session what it changed that another parallel run relies on', () => {
    const r = hook('stop', 's-me', 'Stop');
    const text = String(r.json?.systemMessage ?? '');
    expect(text).toContain('you changed src/a.ts#mid');
    expect(text).toContain('s-other');
  }, 120_000);
  it('Stop says nothing about collisions when this session only read the shared code', () => {
    const r = hook('stop', 's-other', 'Stop');
    expect(String(r.json?.systemMessage ?? '')).not.toContain('you changed');
  }, 120_000);
  it('silent when the session collides with nothing (done-when 4)', () => {
    expect(hook('session-start', 's-solo', 'SessionStart').stdout.trim()).toBe('');
    expect(hook('stop', 's-solo', 'Stop').stdout.trim()).toBe('');
  }, 120_000);
});
