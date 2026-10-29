// T27 review 1 fixes (tasks/T27-decisions-as-rules/4 log/review-1.md): P1 the emitted config runs under the real
// depcruise CLI; P2 dead/absolute/backslash rule paths, duplicate ids, triple-slash references, superseded records
// syntax-checked, static + dynamic import of one module. (terminal heredoc: write_file is approval-gated for tests)
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkRules, DEPCRUISE_FILE, loadRules, rulesCli } from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');
const DEPCRUISE = join(repoRoot, 'node_modules/dependency-cruiser/bin/dependency-cruiser.mjs');
const SLOW = 60_000;

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const c of cleanups.splice(0)) c();
  vi.restoreAllMocks();
});

function repo(files: Record<string, string>): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'mole-rules-fix-')));
  cleanups.push(() => rmSync(root, { recursive: true, force: true }));
  for (const [f, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, f)), { recursive: true });
    writeFileSync(join(root, f), text);
  }
  return root;
}

const record = (id: string, rules: string[], status = 'accepted') =>
  ['---', `id: ${id}`, `title: record ${id}`, `status: ${status}`, 'rules:', ...rules, '---', ''].join('\n');
const SRC = {
  'src/db/query.ts': 'export const q = 1;\n',
  'src/ui/view.ts': "import { q } from '../db/query.js';\nexport const v = q;\n",
  'src/ui/ok.ts': 'export const ok = 1;\n',
};
const UI_DB = ['  - forbid: import', '    from: src/ui/', '    to: src/db/'];
const quiet = () => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
};

describe('P1: the --emit config runs under the depcruise CLI', () => {
  for (const entry of ['src', '.']) {
    it(`depcruise -c ${DEPCRUISE_FILE} ${entry} validates the config and reports the planted violation`, { timeout: SLOW }, async () => {
      const root = repo({ '.mole/decisions/D1.md': record('D1', UI_DB), ...SRC });
      quiet();
      expect(await rulesCli([], { emit: true }, root)).toBe(0);
      const run = spawnSync(process.execPath, [DEPCRUISE, '-c', DEPCRUISE_FILE, '--output-type', 'json', entry], { cwd: root, encoding: 'utf8' });
      expect(run.stderr).not.toMatch(/not valid/);
      const out = JSON.parse(run.stdout) as { summary: { violations: Array<{ from: string; to: string; rule: { name: string } }> } };
      expect(out.summary.violations).toEqual([expect.objectContaining({ from: 'src/ui/view.ts', to: 'src/db/query.ts', rule: expect.objectContaining({ name: 'mole-D1-1' }) })]);
      const err = spawnSync(process.execPath, [DEPCRUISE, '-c', DEPCRUISE_FILE, '--output-type', 'err', entry], { cwd: root, encoding: 'utf8' });
      expect(err.stdout).toMatch(/error mole-D1-1: src\/ui\/view\.ts → src\/db\/query\.ts/);
      expect(err.status).toBe(1); // depcruise exits with the error count
    });
  }

  it('a glob from (packages/*/src/) still cruises: its start folder is not pruned', { timeout: SLOW }, async () => {
    const root = repo({
      '.mole/decisions/D1.md': record('D1', ['  - forbid: import', "    from: 'packages/*/src/'", '    to: lodash']),
      'packages/a/src/x.ts': "import _ from 'lodash';\nexport const y = _;\n",
    });
    const r = await checkRules(root);
    expect(r.violations.map((v) => `${v.file}:${v.line}`)).toEqual(['packages/a/src/x.ts:1']);
  });
});

describe('P2-2: dead and malformed rule paths', () => {
  it('a from or to that matches no file warns with the record file:line; exit code unchanged', { timeout: SLOW }, async () => {
    const root = repo({
      '.mole/decisions/D1.md': record('D1', ['  - forbid: import', '    from: src/iu/', '    to: src/db/', '  - forbid: import', '    from: src/ui/', '    to: src/bd/']),
      ...SRC,
    });
    const r = await checkRules(root);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([
      expect.objectContaining({ file: '.mole/decisions/D1.md', line: 6, message: expect.stringMatching(/src\/iu\//) }),
      expect.objectContaining({ file: '.mole/decisions/D1.md', line: 9, message: expect.stringMatching(/src\/bd\//) }),
    ]);
    quiet();
    expect(await rulesCli([], {}, root)).toBe(0);
    expect((console.log as unknown as { mock: { calls: string[][] } }).mock.calls.flat().join('\n')).toMatch(/warning \.mole\/decisions\/D1\.md:6/);
  });

  for (const [what, line, from, to] of [
    ['absolute from', 7, '/src/ui/', 'src/db/'],
    ['backslash from', 7, "'src\\ui\\'", 'src/db/'],
    ['backslash to', 8, 'src/ui/', "'src\\db\\'"],
    ['.. in from', 7, '../src/ui/', 'src/db/'],
  ] as const)
    it(`${what} is a syntax error at file:line, exit 2`, { timeout: SLOW }, async () => {
      const root = repo({ '.mole/decisions/D1.md': record('D1', ['  - forbid: import', `    from: ${from}`, `    to: ${to}`]), ...SRC });
      const r = loadRules(root);
      expect(r.errors).toEqual([expect.objectContaining({ file: '.mole/decisions/D1.md', line })]);
      quiet();
      expect(await rulesCli([], {}, root)).toBe(2);
    });
});

describe('P2-3: duplicate record ids', () => {
  it('each violation cites the record its rule was written in', { timeout: SLOW }, async () => {
    const root = repo({
      '.mole/decisions/E5a.md': record('E5', UI_DB).replace('title: record E5', 'title: first'),
      '.mole/decisions/E5b.md': record('E5', ['  - forbid: call', '    from: src/', '    callee: nothingCalled']).replace('title: record E5', 'title: second'),
      ...SRC,
    });
    const r = await checkRules(root);
    expect(new Set(r.rules.map((x) => x.name)).size).toBe(2);
    expect(r.violations).toHaveLength(1);
    expect(r.violations[0]).toMatchObject({ file: 'src/ui/view.ts', line: 1, kind: 'import', decision: { title: 'first', file: '.mole/decisions/E5a.md', line: 6 } });
    expect(r.warnings.some((w) => w.file === '.mole/decisions/E5b.md' && /duplicate id E5/.test(w.message))).toBe(true);
  });
});

describe('P2-4: dependency-cruiser violations with no AST import site', () => {
  it('a /// <reference path> to a forbidden module is reported (line 1), not dropped', { timeout: SLOW }, async () => {
    const root = repo({ '.mole/decisions/D1.md': record('D1', UI_DB), ...SRC, 'src/ui/tsl.ts': '/// <reference path="../db/query.ts" />\nexport const t = 1;\n' });
    const r = await checkRules(root);
    expect(r.violations.map((v) => `${v.file}:${v.line}:${v.rule}`).sort()).toEqual(['src/ui/tsl.ts:1:mole-D1-1', 'src/ui/view.ts:1:mole-D1-1']);
  });
});

describe('P2-6: rules on superseded / deprecated / rejected records', () => {
  it('are syntax-checked (error at file:line) but still not enforced', { timeout: SLOW }, async () => {
    const root = repo({ '.mole/decisions/E4.md': record('E4', ['  - forbid: imprt', '    from: src/ui/', '    to: src/db/'], 'superseded'), ...SRC });
    const r = await checkRules(root);
    expect(r.errors).toEqual([expect.objectContaining({ file: '.mole/decisions/E4.md', line: 6, message: expect.stringMatching(/imprt/) })]);
    expect(r.skipped.map((s) => s.decision)).toEqual(['E4']);
    expect(r.rules).toEqual([]);
    expect(r.violations).toEqual([]);
  });
});

describe('P2-1: static and dynamic import of the same module in one file', () => {
  it('both sites are judged by each rule\'s dynamic: filter', { timeout: SLOW }, async () => {
    const both = "export const lazy = () => import('../db/query.js');\nimport { q } from '../db/query.js';\nexport const v = q;\n";
    const rules = [...UI_DB, ...UI_DB, '    dynamic: false', ...UI_DB, '    dynamic: true'];
    const root = repo({ '.mole/decisions/F1.md': record('F1', rules), 'src/db/query.ts': 'export const q = 1;\n', 'src/ui/both.ts': both });
    const r = await checkRules(root);
    expect(r.violations.map((v) => `${v.line}:${v.rule}`).sort()).toEqual(['1:mole-F1-1', '1:mole-F1-3', '2:mole-F1-1', '2:mole-F1-2']);
  });
});
