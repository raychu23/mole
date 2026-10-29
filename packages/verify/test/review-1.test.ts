// T22 review-1 fixes (written before the fix, new file: the red commit's tests stay untouched, R2).
// P1-1: a selected test whose title contains ' > ' must really run (a failing one gives exit 1), and a selected test the
// runner did not run is an error, never a silent skip. P2-3: the nearest guarding test prefers a test file that imports
// the edited file. Fixture = the reviewer's (~/.hermes/cache/scratch/reviewer-T22-r1/fx) under <repo>/.mole/local/.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatVerify, runTests, selectTests } from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(here, '../../..');
const CLI = resolve(REPO, 'packages/daemon/dist/cli.js');
const ENV = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
const git = (root: string, ...args: string[]): string => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', env: ENV }).trim();
const write = (root: string, file: string, text: string): void => {
  mkdirSync(dirname(join(root, file)), { recursive: true });
  writeFileSync(join(root, file), text);
};

const M = ['export function add(a: number, b: number): number {', '  return a + b;', '}', '', 'export function lonely(s: string): string {', '  return s.toUpperCase();', '}', ''].join('\n');
const FILES: Record<string, string> = {
  'package.json': '{ "name": "fixture-gt", "private": true, "type": "module" }\n',
  'src/m.ts': M,
  // 'a.test.ts' sorts first and shares no import with src/m.ts: the old fallback named it
  'test/a.test.ts': ["import { expect, it } from 'vitest';", '', "it('unrelated', () => {", '  expect(1).toBe(1);', '});', ''].join('\n'),
  'test/m.test.ts': [
    "import { describe, expect, it } from 'vitest';",
    "import { add } from '../src/m.js';",
    "it('ranks a > b', () => {",
    '  expect(add(1, 2)).toBe(3);',
    '});',
    "describe('outer > inner', () => {",
    "  it('adds > again', () => {",
    '    expect(add(2, 2)).toBe(4);',
    '  });',
    '});',
    '',
  ].join('\n'),
};

let root = '';
beforeAll(() => {
  const base = join(REPO, '.mole/local/verify-fixtures');
  mkdirSync(base, { recursive: true });
  root = mkdtempSync(join(base, 'gt-'));
  git(root, 'init', '-q', '-b', 'main');
  for (const [f, t] of Object.entries(FILES)) write(root, f, t);
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'init');
});
afterAll(() => rmSync(root, { recursive: true, force: true }));
const edit = (from: string, to: string): void => {
  git(root, 'checkout', '-q', '--', '.');
  write(root, 'src/m.ts', M.replace(from, to));
};

describe('T22 review-1 P1-1: titles containing " > " are run, not skipped', () => {
  it('a broken add() fails the selected tests "ranks a > b" and "outer > inner > adds > again"; the CLI exits 1', async () => {
    edit('  return a + b;', '  return a - b;');
    const sel = await selectTests(root, { worktree: true });
    expect(sel.tests.map((t) => t.name)).toEqual(expect.arrayContaining(['ranks a > b', 'outer > inner > adds > again']));
    const run = await runTests(root, sel);
    expect(run.error).toBeUndefined();
    const failed = run.outcomes.filter((o) => o.status === 'failed').map((o) => o.name);
    expect(failed).toEqual(expect.arrayContaining(['ranks a > b', 'outer > inner > adds > again']));
    expect(formatVerify(sel, run)).not.toMatch(/- (skip|not run)/);
    const r = spawnSync(process.execPath, [CLI, 'check', '--worktree', '--run-tests', '--root', root], { encoding: 'utf8' });
    expect(r.stdout).toContain('✗ FAIL');
    expect(r.stdout).toContain('ranks a > b');
    expect(r.status).toBe(1);
  }, 120_000);

  it('a selected test the runner did not run is an error line and fails the run', async () => {
    edit('  return a + b;', '  return b + a;');
    const sel = await selectTests(root, { worktree: true });
    const ghost = { ...sel.tests[0]!, name: 'ghost > never defined', titles: ['ghost', 'never defined'], line: 99 };
    sel.tests.push(ghost);
    const run = await runTests(root, sel);
    expect(run.notRun.map((t) => t.name)).toEqual(['ghost > never defined']);
    const text = formatVerify(sel, run);
    expect(text).toMatch(/NOT RUN .*ghost > never defined/);
    expect(text).toMatch(/1 selected not run/);
  }, 120_000);
});

describe('T22 review-1 P2-3: nearest guarding test by import', () => {
  it('an edit no test calls names the test file that imports the edited file, not the first file in the repo', async () => {
    edit('toUpperCase', 'toLowerCase');
    const sel = await selectTests(root, { worktree: true });
    expect(sel.noTestReaches).toBe(true);
    expect(sel.nearest?.file).toBe('test/m.test.ts');
    expect(sel.nearest?.why).toMatch(/imports src\/m\.ts/);
  }, 120_000);
});
