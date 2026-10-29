// T27 red tests: rules compiled to a real dependency-cruiser config + Mole's call scan; each violation cites its decision
// (id, title, status/flag, why, record file:line); `mole rules` exit codes; Mole's own rules hold on Mole today.
// (written with a terminal heredoc: write_file is approval-gated for test files in this unattended run)
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cruise } from 'dependency-cruiser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CALL_RULES_FILE, checkRules, DEPCRUISE_FILE, depcruiseRuleSet, formatRules, loadRules, rulesCli } from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');
const SLOW = 60_000; // dependency-cruiser + the TS parser on a machine shared with other builders

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const c of cleanups.splice(0)) c();
  vi.restoreAllMocks();
});

function repo(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'mole-rules-check-'));
  cleanups.push(() => rmSync(root, { recursive: true, force: true }));
  for (const [f, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, f)), { recursive: true });
    writeFileSync(join(root, f), text);
  }
  return root;
}

const RECORDS: Record<string, string> = {
  '.mole/decisions/D001-ui-no-db.md': [
    '---', // 1
    'id: D001',
    'title: The UI never imports the database layer',
    'status: accepted',
    'rules:', // 5
    '  - forbid: import', // 6
    '    from: src/ui/',
    '    to: src/db/',
    '    why: the UI goes through the API so the db can move',
    '  - forbid: call', // 10
    '    callee: fetch',
    "    from: '**'",
    '    except: [src/api/]',
    '    why: one place owns network access',
    '---',
    '',
  ].join('\n'),
  '.mole/decisions/D002-cli-lazy.md': "---\nid: D002\ntitle: The CLI loads lodash lazily\nstatus: accepted\nrules:\n  - forbid: import\n    from: src/cli.ts\n    to: lodash\n    dynamic: false\n---\n",
  '.mole/decisions/D003-core-bottom.md': "---\nid: D003\ntitle: Core never reaches up into the UI\nstatus: accepted\nrules:\n  - forbid: import\n    from: src/core/\n    to: src/ui/\n    types: true\n---\n",
  '.mole/decisions/D004-old.md': "---\nid: D004\ntitle: Nothing imports the db\nstatus: superseded\nrules:\n  - forbid: import\n    from: src/\n    to: src/db/\n---\n",
};

const SOURCES: Record<string, string> = {
  'src/db/query.ts': 'export const q = 1;\nexport type Row = { id: number };\n',
  'src/ui/view.ts': "// the view\nimport { q } from '../db/query.js';\nexport const go = () => window.fetch('/x');\nexport const v = q;\nexport type V = number;\n",
  'src/ui/types.ts': "import type { Row } from '../db/query.js';\nexport type R = Row;\n",
  'src/ui/lazy.ts': "export const load = () => import('../db/query.js');\n",
  'src/ui/comment.ts': "// fetch('/nope') is only mentioned here\nexport const s = \"fetch('/x')\";\n",
  'src/api/client.ts': 'export const get = (u: string) => fetch(u);\n',
  'src/cli.ts': "import fp from 'lodash/fp';\nexport const l = () => import('lodash');\nexport const f = fp;\n",
  'src/core/a.ts': "import type { V } from '../ui/view.js';\nexport type A = V;\n",
};

const key = (v: { file: string; line: number; decision: { id: string } }) => `${v.file}:${v.line}:${v.decision.id}`;

describe('checkRules on a fixture repo', () => {
  it('catches exactly the planted import and call violations, each citing its decision', { timeout: SLOW }, async () => {
    const root = repo({ ...RECORDS, ...SOURCES });
    const r = await checkRules(root);
    expect(r.errors).toEqual([]);
    expect(r.violations.map(key).sort()).toEqual(
      ['src/cli.ts:1:D002', 'src/core/a.ts:1:D003', 'src/ui/lazy.ts:1:D001', 'src/ui/view.ts:2:D001', 'src/ui/view.ts:3:D001'].sort(),
    );
    const imp = r.violations.find((v) => v.file === 'src/ui/view.ts' && v.line === 2)!;
    expect(imp).toMatchObject({ kind: 'import', rule: 'mole-D001-1', target: '../db/query.js' });
    expect(imp.decision).toMatchObject({
      id: 'D001',
      title: 'The UI never imports the database layer',
      status: 'accepted',
      why: 'the UI goes through the API so the db can move',
      file: '.mole/decisions/D001-ui-no-db.md',
      line: 6,
    });
    expect(['green', 'yellow', 'red', 'grey']).toContain(imp.decision.flag);
    const call = r.violations.find((v) => v.file === 'src/ui/view.ts' && v.line === 3)!;
    expect(call).toMatchObject({ kind: 'call', rule: 'mole-D001-2', target: 'window.fetch' });
    expect(call.decision).toMatchObject({ id: 'D001', line: 10, why: 'one place owns network access' });
    expect(r.skipped.map((s) => s.decision)).toEqual(['D004']);
    expect(r.ms).toBeGreaterThanOrEqual(0);
  });

  it('formatRules prints file:line, the decision, its why and the rule\'s record file:line', { timeout: SLOW }, async () => {
    const root = repo({ ...RECORDS, ...SOURCES });
    const text = formatRules(await checkRules(root));
    for (const s of [
      'src/ui/view.ts:2',
      'D001',
      'The UI never imports the database layer',
      'the UI goes through the API so the db can move',
      '.mole/decisions/D001-ui-no-db.md:6',
      '.mole/decisions/D001-ui-no-db.md:10',
      'src/core/a.ts:1',
      'D003',
    ])
      expect(text).toContain(s);
  });

  it('a clean repo has no violations; `mole rules` exits 0 clean, 1 with violations, and --json prints the result', { timeout: SLOW }, async () => {
    const clean = repo({ ...RECORDS, 'src/ui/view.ts': 'export const v = 1;\n', 'src/db/query.ts': 'export const q = 1;\n' });
    const out: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => void out.push(a.join(' ')));
    vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => void out.push(a.join(' ')));
    expect(await rulesCli([], {}, clean)).toBe(0);
    const dirty = repo({ ...RECORDS, ...SOURCES });
    expect(await rulesCli([], {}, dirty)).toBe(1);
    out.length = 0;
    expect(await rulesCli([], { json: true }, dirty)).toBe(1);
    const j = JSON.parse(out.join('\n')) as { violations: Array<{ file: string; line: number; decision: { id: string } }> };
    expect(j.violations.map(key)).toContain('src/ui/view.ts:2:D001');
  });
});

describe('compiled dependency-cruiser config (done-when 1)', () => {
  it('each import rule becomes a forbidden rule named mole-<id>-<n> whose comment cites the decision', () => {
    const root = repo({ ...RECORDS });
    const { forbidden } = depcruiseRuleSet(loadRules(root).rules);
    const names = forbidden.map((f) => f.name);
    expect(names).toEqual(expect.arrayContaining(['mole-D001-1', 'mole-D002-1', 'mole-D003-1']));
    expect(names).not.toContain('mole-D001-2'); // a call rule is Mole's own scan, not a dependency-cruiser rule
    expect(names).not.toContain('mole-D004-1'); // superseded
    const d1 = forbidden.find((f) => f.name === 'mole-D001-1')!;
    expect(d1.severity).toBe('error');
    expect(String(d1.comment)).toContain('D001');
    expect(String(d1.comment)).toContain('The UI never imports the database layer');
    expect(String(d1.comment)).toContain('.mole/decisions/D001-ui-no-db.md:6');
  });

  it('module names match bare, sub-path and installed forms; scope prefixes and path globs work', () => {
    const root = repo({
      '.mole/decisions/E001-x.md':
        "---\nid: E001\ntitle: X\nstatus: accepted\nrules:\n  - forbid: import\n    from: 'src/{ui,core}/'\n    to: [lodash, '@mole/']\n    except: [src/ui/legacy/]\n---\n",
    });
    const f = depcruiseRuleSet(loadRules(root).rules).forbidden[0]! as { from: { path: string; pathNot?: string }; to: { path: string } };
    const to = new RegExp(f.to.path);
    for (const s of ['lodash', 'lodash/fp', 'node_modules/lodash/fp.js', '@mole/core', 'node_modules/@mole/core/dist/src/index.js']) expect(to.test(s), s).toBe(true);
    for (const s of ['lodash-es', 'src/lodash.ts', '@molex/core']) expect(to.test(s), s).toBe(false);
    const from = new RegExp(f.from.path);
    expect(from.test('src/ui/a.ts')).toBe(true);
    expect(from.test('src/core/b.ts')).toBe(true);
    expect(from.test('src/db/c.ts')).toBe(false);
    expect(new RegExp(f.from.pathNot!).test('src/ui/legacy/old.ts')).toBe(true);
  });

  it('`mole rules --emit` writes the dependency-cruiser config and the call rules; dependency-cruiser itself finds the violation with it', { timeout: SLOW }, async () => {
    const root = repo({ ...RECORDS, ...SOURCES });
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    expect(await rulesCli([], { emit: true }, root)).toBe(0);
    expect(existsSync(join(root, DEPCRUISE_FILE))).toBe(true);
    const cfg = createRequire(import.meta.url)(join(root, DEPCRUISE_FILE)) as { forbidden: Array<{ name: string }> };
    expect(cfg.forbidden.map((f) => f.name)).toContain('mole-D001-1');
    const calls = JSON.parse(readFileSync(join(root, CALL_RULES_FILE), 'utf8')) as Array<{ name: string; callee: string[] }>;
    expect(calls.map((c) => c.name)).toContain('mole-D001-2');
    const res = await cruise(['src'], { baseDir: realpathSync(root), validate: true, ruleSet: { forbidden: cfg.forbidden } as never, tsPreCompilationDeps: true });
    const out = res.output as { summary: { violations: Array<{ from: string; to: string; rule: { name: string } }> } };
    expect(out.summary.violations).toContainEqual(expect.objectContaining({ from: 'src/ui/view.ts', to: 'src/db/query.ts', rule: expect.objectContaining({ name: 'mole-D001-1' }) }));
  });
});

describe('Mole dogfood', () => {
  it('Mole\'s own records carry rules (0013 lazy CLI, 0014 read-only agent states, 0017 core layering) and they hold today', { timeout: SLOW }, async () => {
    const r = await checkRules(repoRoot);
    expect(r.errors).toEqual([]);
    const names = r.rules.map((x) => x.name);
    for (const n of ['mole-0013-1', 'mole-0014-1', 'mole-0017-1']) expect(names).toContain(n);
    expect(r.violations).toEqual([]);
  });

  it('the daemon CLI registers `mole rules` with one lazy import line (shared registry: toContain)', () => {
    const cli = readFileSync(join(repoRoot, 'packages/daemon/src/cli.ts'), 'utf8');
    expect(cli).toContain("if (cmd === 'rules') return (await import('@mole/decisions')).rulesCli(pos, flags, root);");
  });
});
