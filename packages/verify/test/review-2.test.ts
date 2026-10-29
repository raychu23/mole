// T22 review-2 fixes (written before the fix, new file: the red commit's tests stay untouched, R2).
// P1-A: a selected test the test file skips on purpose (it.skip, it.todo, describe.skip, skipIf/runIf that skip) is
//       reported "skipped by the test file", not an error, and the CLI exit is unaffected; a selected test that did not run
//       for another reason stays an error (the ghost case in review-1.test.ts).
// P2-A: a selected test with a non-literal title runs (its file without a name filter), never "NOT RUN".
// P2-D: an edit to a helper inside a test file selects that file's tests that call it.
// P2-B: a docs-only change says "no code change to test", exit 0.
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
const lines = (...xs: string[]): string => xs.join('\n') + '\n';

const M = lines(
  'export function add(a: number, b: number): number {',
  '  return a + b;',
  '}',
  '',
  'export function mul(a: number, b: number): number {',
  '  return a * b;',
  '}',
);
const FILES: Record<string, string> = {
  'package.json': '{ "name": "fixture-r2", "private": true, "type": "module" }\n',
  'README.md': '# fixture\n',
  'src/m.ts': M,
  'test/skip.test.ts': lines(
    "import { describe, expect, it } from 'vitest';",
    "import { mul } from '../src/m.js';",
    "it('mul live', () => {",
    '  expect(mul(2, 3)).toBe(6);',
    '});',
    "it.skip('mul skipped', () => {",
    '  expect(mul(2, 3)).toBe(6);',
    '});',
    "describe('mul group', () => {",
    '  const v = mul(1, 1);',
    "  it('mul group live', () => {",
    '    expect(v).toBe(1);',
    '  });',
    "  it.todo('mul todo');",
    '});',
    "describe.skip('mul skipped group', () => {",
    "  it('mul in skipped group', () => {",
    '    expect(mul(1, 2)).toBe(2);',
    '  });',
    '});',
    "it.skipIf(true)('mul skipIf true', () => {",
    '  expect(mul(1, 2)).toBe(2);',
    '});',
    "it.runIf(false)('mul runIf false', () => {",
    '  expect(mul(1, 2)).toBe(2);',
    '});',
  ),
  'test/dyn.test.ts': lines(
    "import { expect, it } from 'vitest';",
    "import { add } from '../src/m.js';",
    "const name = 'dyn title';",
    'it(name, () => {',
    '  expect(add(1, 2)).toBe(3);',
    '});',
    "it('concat ' + 'title', () => {",
    '  expect(add(2, 2)).toBe(4);',
    '});',
  ),
  'test/helper.test.ts': lines(
    "import { expect, it } from 'vitest';",
    'function twice(x: number): number {',
    '  return x * 2;',
    '}',
    "it('uses helper', () => {",
    '  expect(twice(2)).toBe(4);',
    '});',
    "it('no helper', () => {",
    '  expect(1).toBe(1);',
    '});',
  ),
};

let root = '';
beforeAll(() => {
  const base = join(REPO, '.mole/local/verify-fixtures');
  mkdirSync(base, { recursive: true });
  root = mkdtempSync(join(base, 'r2-'));
  git(root, 'init', '-q', '-b', 'main');
  for (const [f, t] of Object.entries(FILES)) write(root, f, t);
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'init');
});
afterAll(() => rmSync(root, { recursive: true, force: true }));
const edit = (file: string, from: string, to: string): void => {
  git(root, 'checkout', '-q', '--', '.');
  write(root, file, FILES[file]!.replace(from, to));
};
const cli = () => spawnSync(process.execPath, [CLI, 'check', '--worktree', '--run-tests', '--root', root], { encoding: 'utf8' });

describe('T22 review-2 P1-A: tests the test file skips on purpose are "skipped by the test file", not an error', () => {
  it('a harmless mul edit: skip / todo / describe.skip / skipIf / runIf tests are reported skipped, exit 0', async () => {
    edit('src/m.ts', '  return a * b;', '  return b * a;');
    const sel = await selectTests(root, { worktree: true });
    const names = sel.tests.map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(['mul live', 'mul skipped', 'mul group > mul todo', 'mul skipped group > mul in skipped group', 'mul skipIf true', 'mul runIf false']));
    const run = await runTests(root, sel);
    expect(run.error).toBeUndefined();
    expect(run.failed).toBe(0);
    expect(run.notRun.map((t) => t.name)).toEqual([]);
    expect(run.skippedByFile.map((t) => t.name)).toEqual(
      expect.arrayContaining(['mul skipped', 'mul group > mul todo', 'mul skipped group > mul in skipped group', 'mul skipIf true', 'mul runIf false']),
    );
    expect(run.skippedByFile.map((t) => t.name)).not.toContain('mul live');
    const text = formatVerify(sel, run);
    expect(text).not.toContain('NOT RUN');
    expect(text).toMatch(/skipped by the test file .*mul skipped/);
    const r = cli();
    expect(r.stdout).not.toContain('NOT RUN');
    expect(r.stdout).toContain('skipped by the test file');
    expect(r.status).toBe(0);
  }, 120_000);

  it('a selected test that did not run for another reason stays an error, beside skipped ones', async () => {
    edit('src/m.ts', '  return a * b;', '  return b * a;');
    const sel = await selectTests(root, { worktree: true });
    sel.tests.push({ ...sel.tests[0]!, name: 'ghost > never defined', titles: ['ghost', 'never defined'], line: 99 });
    const run = await runTests(root, sel);
    expect(run.notRun.map((t) => t.name)).toEqual(['ghost > never defined']);
    expect(run.skippedByFile.length).toBeGreaterThan(0);
  }, 120_000);
});

describe('T22 review-2 P2-A: non-literal titles run without a name filter', () => {
  it('a harmless add edit runs it(name) and it("concat " + "title"): pass, exit 0; a broken add fails them, exit 1', async () => {
    edit('src/m.ts', '  return a + b;', '  return b + a;');
    const sel = await selectTests(root, { worktree: true });
    expect(sel.tests.filter((t) => t.file === 'test/dyn.test.ts').length).toBe(2);
    const run = await runTests(root, sel);
    expect(run.notRun).toEqual([]);
    expect(formatVerify(sel, run)).not.toContain('NOT RUN');
    expect(cli().status).toBe(0);
    edit('src/m.ts', '  return a + b;', '  return a - b;');
    const sel2 = await selectTests(root, { worktree: true });
    const run2 = await runTests(root, sel2);
    expect(run2.outcomes.filter((o) => o.file === 'test/dyn.test.ts' && o.status === 'failed').map((o) => o.name)).toEqual(
      expect.arrayContaining(['dyn title', 'concat title']),
    );
    expect(cli().status).toBe(1);
  }, 120_000);
});

describe('T22 review-2 P2-D: helper inside a test file', () => {
  it('editing a helper selects the tests of that file that call it', async () => {
    edit('test/helper.test.ts', '  return x * 2;', '  return x + x;');
    const sel = await selectTests(root, { worktree: true });
    expect(sel.noTestReaches).toBe(false);
    expect(sel.tests.map((t) => `${t.file} ${t.name}`)).toContain('test/helper.test.ts uses helper');
  }, 120_000);
});

describe('T22 review-2 P2-B: docs-only change', () => {
  it('says "no code change to test", exit 0', async () => {
    edit('README.md', '# fixture', '# fixture docs');
    const sel = await selectTests(root, { worktree: true });
    expect(formatVerify(sel)).toContain('no code change to test');
    const r = cli();
    expect(r.stdout).toContain('no code change to test');
    expect(r.stdout).not.toContain('nearest guarding test');
    expect(r.status).toBe(0);
  }, 120_000);
});
