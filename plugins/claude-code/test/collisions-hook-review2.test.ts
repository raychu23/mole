// T21 review-2 red tests (reviewer-T21-r2 P1-1, P1-2; mole-builder-3, 2026-10-29).
// P1-1: Stop says "<other> relies on it" only when the other run depends on what this session edited: the same function, or
//       a call chain that ENDS at the edited function (other's code calls it). Editing a caller of the other's code is not that.
// P1-2: the collisions call has its own time budget (MOLE_COLLISIONS_TIMEOUT_MS), so a slow call can't eat the hook's
//       Claude Code timeout (SessionStart 30 s, Stop 60 s).
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const plugin = join(dirname(fileURLToPath(import.meta.url)), '..');
const cli = join(plugin, '../../packages/daemon/dist/cli.js');
const A_TS = 'export function top(): number {\n  return mid() + 1;\n}\n\nexport function mid(): number {\n  return 2;\n}\n';
const TOP = 'export function top(): number {\n  return mid() + 1;\n}';
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
function stop(sid: string, env: Record<string, string> = {}): { stdout: string; ms: number } {
  const t0 = Date.now();
  const stdout = execFileSync(process.execPath, [join(plugin, 'scripts', 'stop.mjs')], {
    input: JSON.stringify({ session_id: sid, transcript_path: join(claudeDir, 'proj', `${sid}.jsonl`), cwd: root, permission_mode: 'default', hook_event_name: 'Stop' }),
    encoding: 'utf8',
    env: { ...process.env, MOLE_BIN: cli, CLAUDE_PLUGIN_ROOT: plugin, CLAUDE_PLUGIN_DATA: data, MOLE_CLAUDE_DIR: claudeDir, MOLE_HERMES_DB: join(base, 'none.db'), MOLE_CODEX_DIR: join(base, 'none'), ...env },
    timeout: 90_000,
  });
  return { stdout, ms: Date.now() - t0 };
}
const msg = (stdout: string): string => (stdout.trim() ? String(JSON.parse(stdout).systemMessage ?? '') : '');

beforeAll(() => {
  base = mkdtempSync(join(tmpdir(), 'mole-t21-r2-'));
  root = join(base, 'repo');
  claudeDir = join(base, 'claude');
  data = join(base, 'data');
  mkdirSync(join(root, 'src'), { recursive: true });
  mkdirSync(join(claudeDir, 'proj'), { recursive: true });
  mkdirSync(data);
  g('init', '-q', '-b', 'main');
  writeFileSync(join(root, 'src/a.ts'), A_TS);
  g('add', '.');
  g('commit', '-q', '-m', 'fixture');
  // pair 1 (an hour ago): s-caller-ed edits top (top calls mid); s-mid-reader reads mid → s-mid-reader does not rely on top
  session('s-caller-ed', [[60, 'Edit', { file_path: join(root, 'src/a.ts'), old_string: TOP, new_string: TOP }]]);
  session('s-mid-reader', [[58, 'Read', { file_path: join(root, 'src/a.ts'), offset: 5, limit: 3 }]]);
  // pair 2 (now): s-callee-ed edits mid; s-top-reader reads top (top calls mid) → s-top-reader relies on mid
  session('s-callee-ed', [[10, 'Edit', { file_path: join(root, 'src/a.ts'), old_string: MID, new_string: MID }]]);
  session('s-top-reader', [[8, 'Read', { file_path: join(root, 'src/a.ts'), offset: 1, limit: 3 }]]);
  // a stand-in CLI that hangs on `collisions` (P1-2)
  writeFileSync(join(base, 'slow-mole.mjs'), "if (process.argv.includes('collisions')) setTimeout(() => console.log('{\"pairs\":[]}'), 20000);\nelse console.log('{}');\n");
}, 60_000);
afterAll(() => rmSync(base, { recursive: true, force: true }));

describe('Stop hook collisions: direction + time budget (T21 review 2)', () => {
  it('P1-1: editing a caller of what the other run read is not "the other run relies on it"', () => {
    expect(msg(stop('s-caller-ed').stdout)).not.toContain('relies on it');
  }, 120_000);
  it('P1-1: editing a function the other run\'s code calls is reported', () => {
    const m = msg(stop('s-callee-ed').stdout);
    expect(m).toContain('you changed src/a.ts#mid');
    expect(m).toContain('s-top-reader');
  }, 120_000);
  it('P1-2: a collisions call slower than MOLE_COLLISIONS_TIMEOUT_MS is cut; the hook ends quietly', () => {
    const r = stop('s-callee-ed', { MOLE_BIN: join(base, 'slow-mole.mjs'), MOLE_COLLISIONS_TIMEOUT_MS: '1000' });
    expect(r.stdout.trim()).toBe('');
    expect(r.ms).toBeLessThan(8000);
  }, 120_000);
});
