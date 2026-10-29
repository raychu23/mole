// T15 done-when 3: MCP tool mole_check returns the same JSON as `mole check ... --json` (T12 CheckResult + T14 questions)
// for the same change, in each change mode (working tree, sha, diff file + base). Called over stdio like mole_map.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { afterEach, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const bin = join(here, '../dist/cli.js');
const cli = join(here, '../../daemon/dist/cli.js');
const cleanups: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  for (const c of cleanups.splice(0).reverse()) await c();
});

const git = (root: string, ...args: string[]) => execFileSync('git', ['-C', root, '-c', 'user.name=Fixture', '-c', 'user.email=f@example.com', '-c', 'commit.gpgsign=false', ...args], { encoding: 'utf8' });

/** a repo whose src/a.ts line 2 was last written by a fix commit (with a comment reason and a guarding test) */
function fixtureRepo(): string {
  const root = mkdtempSync(join(tmpdir(), 'mole-mcp-check-'));
  cleanups.push(() => rmSync(root, { recursive: true, force: true }));
  git(root, 'init', '-q', '-b', 'main');
  mkdirSync(join(root, 'src'));
  mkdirSync(join(root, 'test'));
  writeFileSync(join(root, 'src/a.ts'), 'export function a(x: number) {\n  return x * 2;\n}\n');
  git(root, 'add', '.');
  git(root, 'commit', '-q', '-m', 'add a');
  writeFileSync(join(root, 'src/a.ts'), 'export function a(x: number) {\n  // negative input must give 0: the caller sums these\n  if (x < 0) return 0;\n  return x * 2;\n}\n');
  writeFileSync(join(root, 'test/a.test.ts'), "import { a } from '../src/a';\nit('negative input gives 0', () => {\n  expect(a(-1)).toBe(0);\n});\n");
  git(root, 'add', '.');
  git(root, 'commit', '-q', '-m', 'fix: negative input returned a negative double');
  return root;
}

const strip = (j: Record<string, unknown>) => {
  const { ms: _ms, ...rest } = j;
  return rest;
};

it('mole_check (worktree, sha, diff+base) deep-equals the CLI --json; bad input is an error result; no daemon is started', async () => {
  const root = fixtureRepo();
  const stateDir = join(root, '.state');
  const env = { ...process.env, MOLE_ROOT: root, MOLE_STATE_DIR: stateDir } as Record<string, string>;
  const client = new Client({ name: 'test', version: '0' });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: ['--no-warnings', bin], env }));
  cleanups.push(() => client.close());
  expect((await client.listTools()).tools.map((t) => t.name)).toEqual(expect.arrayContaining(['mole_check', 'mole_map'])); // key ruling 1 (T15 4 log/key-ruling-1.md)

  const viaMcp = async (args: Record<string, unknown>) => {
    const res = await client.callTool({ name: 'mole_check', arguments: args });
    expect(res.isError).toBeFalsy();
    return JSON.parse((res.content as Array<{ text: string }>)[0]?.text ?? '') as Record<string, unknown>;
  };
  const viaCli = (...args: string[]) => JSON.parse(execFileSync(process.execPath, ['--no-warnings', cli, 'check', ...args, '--json', '--root', root], { encoding: 'utf8' })) as Record<string, unknown>;

  // 1. working tree: the session re-edits the fix's line
  writeFileSync(join(root, 'src/a.ts'), 'export function a(x: number) {\n  // negative input must give 0: the caller sums these\n  if (x <= 0) return 0;\n  return x * 2;\n}\n');
  const wt = await viaMcp({ worktree: true });
  expect(strip(wt)).toEqual(strip(viaCli('--worktree')));
  const hunks = wt.hunks as Array<{ pastFixes: Array<{ subject: string }> }>;
  expect(hunks.flatMap((h) => h.pastFixes.map((f) => f.subject))).toContain('fix: negative input returned a negative double');
  expect((wt.questions as unknown[]).length).toBeGreaterThan(0);
  // explicit root works the same as the server's root
  expect(strip(await viaMcp({ worktree: true, root }))).toEqual(strip(wt));

  // 2. a commit
  git(root, 'commit', '-q', '-am', 'tweak a');
  const sha = git(root, 'rev-parse', 'HEAD').trim();
  expect(strip(await viaMcp({ sha }))).toEqual(strip(viaCli(sha)));

  // 3. a diff file + base
  const base = git(root, 'rev-parse', 'HEAD~1').trim();
  const diffFile = join(root, 'change.diff');
  writeFileSync(diffFile, git(root, 'diff', base, sha));
  const viaDiff = await viaMcp({ diff: diffFile, base });
  expect(strip(viaDiff)).toEqual(strip(viaCli('--diff', diffFile, '--base', base)));
  expect((viaDiff.hunks as unknown[]).length).toBeGreaterThan(0);

  // bad input: no change, or two at once
  for (const args of [{}, { worktree: true, sha }]) {
    const bad = await client.callTool({ name: 'mole_check', arguments: args });
    expect(bad.isError).toBe(true);
    expect((bad.content as Array<{ text: string }>)[0]?.text).toMatch(/exactly one of/);
  }
  // mole_check needs git history only: it never starts the indexing daemon
  expect(existsSync(stateDir)).toBe(false);
}, 60000);
