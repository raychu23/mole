// T92/D102 (ux-research 11-04 item #2): the CLI's own top-level usage string must list every subcommand the
// dispatcher (packages/daemon/src/cli.ts) actually recognizes -- the brief's own finding was that `mole --help`
// was stale against the README (10+ working subcommands missing: `rules`, `decision`, `decisions`, `runs`, `run`,
// `tried`, `agents`, `claims`, `collisions`, `steer`, ...). This test DERIVES the expected command list from
// cli.ts's own dispatch source (regex over `cmd === '...'` and `[...].includes(cmd)`), so a future command added
// to the dispatcher without a usage-string update fails here instead of silently going stale again.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const pkg = join(dirname(fileURLToPath(import.meta.url)), '..');
const cliSrc = readFileSync(join(pkg, 'src/cli.ts'), 'utf8');
const cliDist = join(pkg, 'dist/cli.js');

/** Every subcommand literal the dispatcher checks `cmd` against: `cmd === 'x'` and `[...].includes(cmd)`
 * (also `['a','b'].includes(cmd)`). Excludes the generic 'help' fallback (not a real subcommand). */
function dispatchedCommands(src: string): string[] {
  const out = new Set<string>();
  for (const m of src.matchAll(/cmd === '([\w-]+)'/g)) out.add(m[1]!);
  for (const m of src.matchAll(/\[([^\]]+)\]\.includes\(cmd\)/g)) {
    for (const lit of m[1]!.matchAll(/'([\w-]+)'/g)) out.add(lit[1]!);
  }
  out.delete('help');
  return [...out].sort();
}

describe("T92/D102: mole --help lists every dispatched subcommand (derived from cli.ts's own dispatcher)", () => {
  const commands = dispatchedCommands(cliSrc);

  it('the dispatcher source actually has a non-trivial command list (sanity: the regex extraction works)', () => {
    expect(commands.length).toBeGreaterThan(20);
    expect(commands).toContain('rules');
    expect(commands).toContain('decisions');
    expect(commands).toContain('daemon');
  });

  it('every dispatched command appears (as a whole word) in the usage string cli.ts itself prints', () => {
    const anchor = cliSrc.indexOf('usage: mole <command>');
    expect(anchor, 'cli.ts must have a top-level `usage: mole <command> ...` string').toBeGreaterThanOrEqual(0);
    const end = cliSrc.indexOf(');', anchor);
    const usage = cliSrc.slice(anchor, end);
    const missing = commands.filter((c) => !new RegExp(`(?:^|[^\\w-])${c}(?:[^\\w-]|$)`).test(usage));
    expect(missing, `missing from the usage string: ${missing.join(', ')}`).toEqual([]);
  });

  it('running the built CLI with no args prints the SAME usage string (end-to-end, not just source text)', () => {
    const r = spawnSync(process.execPath, [cliDist], { encoding: 'utf8', timeout: 15_000 });
    const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
    for (const c of commands) expect(out, `usage output missing ${c}`).toMatch(new RegExp(`(?:^|[^\\w-])${c}(?:[^\\w-]|$)`));
  });
});
