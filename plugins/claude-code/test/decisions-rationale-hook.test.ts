// T43 red test (done-when 1): the Claude Code plugin's PreToolUse hook (T37's governing-decisions block,
// plugins/claude-code/scripts/lib.mjs decisionsBlock) carries a decision's full Decision/Consequences text
// as additionalContext, not just its id/title/status/owner line -- the same budget discipline as the rest
// of the block (never mid-Decision, sections named).
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const plugin = join(dirname(fileURLToPath(import.meta.url)), '..');
const cli = join(plugin, '../../packages/daemon/dist/cli.js');

function hook(script: string, input: Record<string, unknown>, env: Record<string, string> = {}): { json?: Record<string, any> } {
  const stdout = execFileSync(process.execPath, [join(plugin, 'scripts', `${script}.mjs`)], {
    input: JSON.stringify(input),
    encoding: 'utf8',
    env: { ...process.env, MOLE_BIN: cli, CLAUDE_PLUGIN_ROOT: plugin, CLAUDE_PLUGIN_DATA: env.CLAUDE_PLUGIN_DATA, ...env },
    timeout: 30_000,
  });
  return { json: stdout.trim() ? JSON.parse(stdout) : undefined };
}

const g = (root: string, ...args: string[]) =>
  execFileSync('git', ['-C', root, '-c', 'user.name=Fixture', '-c', 'user.email=f@example.com', '-c', 'commit.gpgsign=false', ...args], { encoding: 'utf8' });

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('PreToolUse: the governing-decisions block carries full rationale, not just the one-liner', () => {
  it('a decision with a long Decision + Consequences body reaches additionalContext intact, named by section', () => {
    const root = mkdtempSync(join(tmpdir(), 'mole-rationale-hook-'));
    const data = mkdtempSync(join(tmpdir(), 'mole-rationale-data-'));
    dirs.push(root, data);
    mkdirSync(join(root, '.mole/decisions'), { recursive: true });
    mkdirSync(join(root, 'src'), { recursive: true });
    const rationale = 'Idle shutdown keeps memory low on laptops with many repos open; killing it eagerly would force a slow cold re-index on the very next call. '.repeat(4);
    writeFileSync(
      join(root, '.mole/decisions/0007.md'),
      `---\nid: '0007'\ntitle: Stop the daemon after 30 idle minutes\nstatus: accepted\napprover: raymond\nscope:\n  - src/cli.ts\n---\n\n## Decision\n\n${rationale}\n\n## Consequences\n\nA call right after idle shutdown pays one cold-start index.\n`,
    );
    writeFileSync(join(root, 'src/cli.ts'), 'export function main() {}\n');
    g(root, 'init', '-q', '-b', 'main');
    g(root, 'add', '-A');
    g(root, 'commit', '-q', '-m', 'base');
    const sid = `rationale-${Date.now()}`;
    hook('session-start', { session_id: sid, cwd: root, source: 'startup' }, { CLAUDE_PLUGIN_DATA: data });
    const { json } = hook(
      'pre-tool-use',
      { session_id: sid, cwd: root, tool_name: 'Edit', tool_input: { file_path: join(root, 'src/cli.ts') } },
      { CLAUDE_PLUGIN_DATA: data },
    );
    const ctx: string = json?.hookSpecificOutput?.additionalContext ?? '';
    expect(ctx).toContain('0007');
    expect(ctx).toContain('keeps memory low on laptops'); // the real rationale, not only the title
    expect(ctx).toMatch(/Decision:/);
    expect(ctx).toMatch(/Consequences:/);
    expect(ctx.length).toBeLessThanOrEqual(9_500); // MAX_CHARS: Claude Code's additionalContext cap
  }, 30_000);
});
