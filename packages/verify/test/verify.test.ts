// T22 red tests (written before the implementation, loop rule R1/R2): done-when 1 (select by fix lineage + call-graph
// reachability, run with vitest, pass/fail beside the past-fix lines), 3 (no test reaches the change -> says so, suggests the
// nearest guarding test, exit 0) and the CLI flag `mole check --run-tests` (existing `mole check` unchanged without it).
// The fixture repo lives under <repo>/.mole/local/ (gitignored) so its test files resolve vitest from this repo's node_modules.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatVerify, modelCalls, NO_TEST_REACHES, runTests, selectTests } from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(here, '../../..');
const CLI = resolve(REPO, 'packages/daemon/dist/cli.js');
const ENV = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
const git = (root: string, ...args: string[]): string => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', env: ENV }).trim();
const cleanups: Array<() => void> = [];
afterAll(() => cleanups.forEach((f) => f()));

function write(root: string, file: string, text: string): void {
  mkdirSync(dirname(join(root, file)), { recursive: true });
  writeFileSync(join(root, file), text);
}

const ADD_FIXED = '  return Math.round((a + b) * 1e9) / 1e9;';
const FILES: Record<string, string> = {
  'package.json': '{ "name": "fixture", "private": true, "type": "module" }\n',
  'src/math.ts': ['export function add(a: number, b: number): number {', '  return a + b;', '}', '', 'export function mul(a: number, b: number): number {', '  return a * b;', '}', ''].join('\n'),
  'src/calc.ts': ["import { add } from './math.js';", '', 'export function total(xs: number[]): number {', '  return xs.reduce((s, x) => add(s, x), 0);', '}', ''].join('\n'),
  'src/orphan.ts': ['export function lonely(s: string): string {', '  return s.toUpperCase();', '}', ''].join('\n'),
  'test/math.test.ts': [
    "import { describe, expect, it } from 'vitest';",
    "import { add, mul } from '../src/math.js';",
    '',
    "describe('math', () => {",
    "  it('adds', () => {",
    '    expect(add(2, 3)).toBe(5);',
    '  });',
    "  it('muls', () => {",
    '    expect(mul(2, 3)).toBe(6);',
    '  });',
    '});',
    '',
  ].join('\n'),
  'test/calc.test.ts': [
    "import { expect, it } from 'vitest';",
    "import { total } from '../src/calc.js';",
    '',
    "it('totals', () => {",
    '  expect(total([1, 2, 3])).toBe(6);',
    '});',
    "it('empty total', () => {",
    '  expect(total([])).toBe(0);',
    '});',
    '',
  ].join('\n'),
  'test/hooks.test.ts': [
    "import { beforeEach, describe, expect, it } from 'vitest';",
    "import { mul } from '../src/math.js';",
    '',
    "describe('with setup', () => {",
    '  let v = 0;',
    '  beforeEach(() => {',
    '    v = mul(2, 2);',
    '  });',
    "  it('one', () => {",
    '    expect(v).toBe(4);',
    '  });',
    "  it('two', () => {",
    '    expect(v).toBeGreaterThan(0);',
    '  });',
    '});',
    "it('unrelated', () => {",
    '  expect(1).toBe(1);',
    '});',
    '',
  ].join('\n'),
};
// the fix commit's own test reaches add() only through a computed dynamic import: no static call edge, lineage must find it
const GUARD = [
  "import { expect, it } from 'vitest';",
  '',
  "it('adds floats without drift', async () => {",
  "  const m = (await import('../src/' + 'math.js')) as { add(a: number, b: number): number };",
  '  expect(m.add(0.1, 0.2)).toBe(0.3);',
  '});',
  '',
].join('\n');

let root = '';
let fixSha = '';
beforeAll(() => {
  const base = join(REPO, '.mole/local/verify-fixtures');
  mkdirSync(base, { recursive: true });
  root = mkdtempSync(join(base, 'fx-'));
  cleanups.push(() => rmSync(root, { recursive: true, force: true }));
  git(root, 'init', '-q', '-b', 'main');
  for (const [f, t] of Object.entries(FILES)) write(root, f, t);
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'init');
  write(root, 'src/math.ts', FILES['src/math.ts']!.replace('  return a + b;', ADD_FIXED));
  write(root, 'test/guard.test.ts', GUARD);
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'fix: add rounds float sums');
  fixSha = git(root, 'rev-parse', 'HEAD');
});

function setWorktree(edit: Record<string, string>): void {
  git(root, 'checkout', '-q', '--', '.');
  for (const [f, t] of Object.entries(edit)) write(root, f, t);
}
const mathWith = (from: string, to: string): Record<string, string> => ({
  'src/math.ts': FILES['src/math.ts']!.replace('  return a + b;', ADD_FIXED).replace(from, to),
});

describe('T22 selection: past-fix lineage + call-graph reachability (done-when 1)', () => {
  it('an edit to add() selects its direct test and the guarding test of the fix that wrote the line, not the unrelated ones', async () => {
    setWorktree(mathWith(ADD_FIXED, '  return Math.round((a - b) * 1e9) / 1e9;'));
    const sel = await selectTests(root, { worktree: true });
    const names = sel.tests.map((t) => t.name);
    expect(sel.edited.map((e) => e.id)).toContain('function:src/math.ts#add');
    expect(names).toContain('math > adds');
    expect(names).toContain('adds floats without drift');
    expect(names).not.toContain('math > muls');
    expect(names).not.toContain('unrelated');
    const guard = sel.tests.find((t) => t.name === 'adds floats without drift')!;
    expect(guard.via).toContain('fix');
    expect(guard.file).toBe('test/guard.test.ts');
    expect(fixSha.startsWith(guard.fix ?? 'none')).toBe(true);
    const direct = sel.tests.find((t) => t.name === 'math > adds')!;
    expect(direct.via).toContain('graph');
    expect(direct.file).toBe('test/math.test.ts');
    expect(direct.line).toBe(5);
    expect(sel.noTestReaches).toBe(false);
    expect(modelCalls.count).toBe(0);
  }, 60_000);

  it('a call inside beforeEach selects every test of that describe block, and nothing outside it', async () => {
    setWorktree(mathWith('  return a * b;', '  return b * a;'));
    const sel = await selectTests(root, { worktree: true });
    const names = sel.tests.map((t) => t.name);
    expect(sel.edited.map((e) => e.id)).toContain('function:src/math.ts#mul');
    expect(names).toEqual(expect.arrayContaining(['math > muls', 'with setup > one', 'with setup > two']));
    expect(names).not.toContain('math > adds');
    expect(names).not.toContain('unrelated');
  }, 60_000);

  it('runs only the selected tests with vitest and reports pass/fail beside the past-fix lines', async () => {
    setWorktree(mathWith(ADD_FIXED, '  return Math.round((a - b) * 1e9) / 1e9;'));
    const sel = await selectTests(root, { worktree: true });
    const run = await runTests(root, sel);
    expect(run.runner).toBe('vitest');
    const ran = run.outcomes.filter((o) => o.status !== 'skipped');
    expect(ran.map((o) => o.name)).toEqual(expect.arrayContaining(['math > adds', 'adds floats without drift']));
    expect(ran.map((o) => o.name)).not.toContain('math > muls');
    expect(ran.length).toBeLessThan(8); // the fixture has 8 tests; the selection must not be "run all"
    expect(run.failed).toBeGreaterThanOrEqual(2);
    const text = formatVerify(sel, run);
    expect(text).toContain(fixSha.slice(0, 7));
    expect(text).toContain('adds floats without drift');
    expect(text).toMatch(/fail/i);
  }, 120_000);
});

describe('T22 failure case: no test reaches the change (done-when 3)', () => {
  it('says so, suggests the nearest guarding test and the CLI exits 0', async () => {
    setWorktree({ 'src/orphan.ts': FILES['src/orphan.ts']!.replace('toUpperCase', 'toLowerCase') });
    const sel = await selectTests(root, { worktree: true });
    expect(sel.tests).toEqual([]);
    expect(sel.noTestReaches).toBe(true);
    expect(sel.nearest?.file).toMatch(/^test\/.+\.test\.ts$/);
    expect(formatVerify(sel)).toContain(NO_TEST_REACHES);
    const r = spawnSync(process.execPath, [CLI, 'check', '--worktree', '--run-tests', '--root', root], { encoding: 'utf8' });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain(NO_TEST_REACHES);
    expect(r.stdout).toContain(sel.nearest!.file);
  }, 120_000);
});

describe('T22 CLI: mole check --run-tests', () => {
  it('runs the selection and exits 1 on a failing selected test; plain `mole check` is unchanged (no test run)', () => {
    setWorktree(mathWith(ADD_FIXED, '  return Math.round((a - b) * 1e9) / 1e9;'));
    const r = spawnSync(process.execPath, [CLI, 'check', '--worktree', '--run-tests', '--root', root], { encoding: 'utf8' });
    expect(r.stdout).toContain('mole check --run-tests');
    expect(r.stdout).toContain('math > adds');
    expect(r.stdout).toContain(fixSha.slice(0, 7));
    expect(r.status).toBe(1);
    const j = spawnSync(process.execPath, [CLI, 'check', '--worktree', '--run-tests', '--json', '--root', root], { encoding: 'utf8' });
    const parsed = JSON.parse(j.stdout) as { selection: { tests: Array<{ name: string }> }; run: { failed: number } };
    expect(parsed.selection.tests.map((t) => t.name)).toContain('math > adds');
    expect(parsed.run.failed).toBeGreaterThanOrEqual(1);
    const plain = spawnSync(process.execPath, [CLI, 'check', '--worktree', '--root', root], { encoding: 'utf8' });
    expect(plain.status).toBe(0);
    expect(plain.stdout).not.toContain('mole check --run-tests');
    expect(plain.stdout).toContain(fixSha.slice(0, 7));
  }, 180_000);
});
