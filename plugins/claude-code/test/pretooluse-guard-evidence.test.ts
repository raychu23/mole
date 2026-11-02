// T50 done-when 2 (core-audit agent-surfaces.md rank 1; M-C v2's B3 case, context/product-plan/systems/
// metrics-proof/prelim-11-01/mc-agent-ab/v2/{results.md,mole_output.txt}): PreToolUse's real capture for an Edit
// on packages/daemon/src/server.ts named only the governing decisions' id/title/status/owner -- never the
// guard test (daemon.test.ts#"idle shutdown (T9)") decision 0009 already cites in its own `evidence:` front
// matter, or which exact scope anchor (Daemon.startWatching) it governs. v2/results.md's own "why B3-tidy
// failed" section says the note WAS on-topic but still title-only; this fixture reproduces 0009's real shape
// (same scope anchor + evidence: test field) so the hook's own text can be asserted against directly, not just
// described. RED before lib.mjs's T50 readDecisionRecords()/decisionsBlock() changes (no `evidence:` parsing,
// no `covers:`/`guard test:` line); GREEN after.
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

describe('PreToolUse: B3 case (real 0009-shaped decision) names the guard test + the decision rule, pre-edit', () => {
  it('an Edit on the governed file gets the guard test name AND the Decision text, not just id/title/owner', () => {
    const root = mkdtempSync(join(tmpdir(), 'mole-b3-'));
    const data = mkdtempSync(join(tmpdir(), 'mole-b3-data-'));
    dirs.push(root, data);
    mkdirSync(join(root, '.mole/decisions'), { recursive: true });
    mkdirSync(join(root, 'packages/daemon/src'), { recursive: true });
    // same shape as the real .mole/decisions/0009-editing-counts-as-use.md: scope anchors a symbol (not just the
    // file), evidence cites a guard test + an incident.
    writeFileSync(
      join(root, '.mole/decisions/0009.md'),
      [
        '---',
        "id: '0009'",
        'title: Editing counts as use',
        'status: accepted',
        'scope:',
        '  - packages/daemon/src/server.ts#Daemon.startWatching',
        'evidence:',
        '  - test: packages/daemon/test/daemon.test.ts#idle shutdown (T9)',
        '  - incident: 2026-10-27-map-stopped-while-typing',
        'approver: raymond',
        '---',
        '',
        '## Decision',
        '',
        'A file change seen by the watcher resets the idle clock, like a request does.',
        'An exception to 0007: a person typing in one file for an hour must not lose the map.',
        '',
      ].join('\n'),
    );
    writeFileSync(join(root, 'packages/daemon/src/server.ts'), 'export class Daemon {\n  startWatching() {}\n}\n');
    g(root, 'init', '-q', '-b', 'main');
    g(root, 'add', '-A');
    g(root, 'commit', '-q', '-m', 'base');
    const sid = `b3-${Date.now()}`;
    const { json } = hook(
      'pre-tool-use',
      { session_id: sid, cwd: root, tool_name: 'Edit', tool_input: { file_path: join(root, 'packages/daemon/src/server.ts'), old_string: 'x', new_string: 'y' } },
      { CLAUDE_PLUGIN_DATA: data },
    );
    const ctx: string = json?.hookSpecificOutput?.additionalContext ?? '';
    expect(ctx).toContain('0009');
    // done-when 2: the guard test, by name -- not in the real B3 capture before T50
    expect(ctx).toContain('idle shutdown (T9)');
    expect(ctx).toContain('packages/daemon/test/daemon.test.ts');
    // the decision rule (T43's rationale block), still present
    expect(ctx).toMatch(/Decision:/);
    expect(ctx).toContain('resets the idle clock');
    // the exact anchor this decision governs -- more specific than the file-level title-only text v2 captured
    expect(ctx).toContain('Daemon.startWatching');
    expect(ctx.length).toBeLessThanOrEqual(9_500);
  }, 30_000);
});
