// T95: `mole rules` on a Python repo, via a real `index.scip` (scip-python 0.6.8; see
// packages/scip/test/fixtures/python/HOW-PRODUCED.md) instead of the TypeScript path. Same RuleSpec
// front matter, same Violation shape; checkRules() auto-selects the SCIP path because root/index.scip exists.
import { cpSync, mkdtempSync, mkdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { checkRules, formatRules, rulesCli } from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const pyFixture = join(here, '../../scip/test/fixtures/python');

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const c of cleanups.splice(0)) c();
});

function pythonRepo(records: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'mole-rules-scip-'));
  cleanups.push(() => rmSync(root, { recursive: true, force: true }));
  cpSync(pyFixture, root, { recursive: true });
  // These tests are about rule *detection* on the SCIP path, not about the staleness check (T95 follow-up,
  // tested separately in rules-scip-stale.test.ts) -- cpSync does not preserve mtimes, so without this the
  // fixture's index.scip could race its own just-copied source files and fail the staleness check at random.
  const future = new Date(Date.now() + 24 * 60 * 60 * 1000);
  utimesSync(join(root, 'index.scip'), future, future);
  for (const [f, text] of Object.entries(records)) {
    mkdirSync(dirname(join(root, f)), { recursive: true });
    writeFileSync(join(root, f), text);
  }
  return root;
}

const RECORDS: Record<string, string> = {
  '.mole/decisions/D001-ui-no-db.md': [
    '---',
    'id: D001',
    'title: The UI never imports the database layer',
    'status: accepted',
    'rules:',
    '  - forbid: import',
    '    from: src/ui/',
    '    to: src/db/',
    '    why: the UI goes through the API so the db can move',
    '---',
    '',
  ].join('\n'),
  '.mole/decisions/D002-no-direct-q.md': [
    '---',
    'id: D002',
    'title: Nothing outside db calls q() directly',
    'status: accepted',
    'rules:',
    '  - forbid: call',
    '    callee: q',
    "    from: '**'",
    '    except: [src/db/]',
    '    why: one example call rule on the SCIP path',
    '---',
    '',
  ].join('\n'),
};

describe('checkRules on a Python repo (SCIP path)', () => {
  it('catches the planted import violation, citing its decision', async () => {
    const root = pythonRepo(RECORDS);
    const r = await checkRules(root);
    expect(r.errors).toEqual([]);
    const imp = r.violations.find((v) => v.kind === 'import');
    expect(imp).toMatchObject({ file: 'src/ui/view.py', line: 2, rule: 'mole-D001-1', target: 'src/db/query.py' });
    expect(imp?.decision).toMatchObject({ id: 'D001', title: 'The UI never imports the database layer', why: 'the UI goes through the API so the db can move' });
  });

  it('catches the planted call violation, citing its decision', async () => {
    const root = pythonRepo(RECORDS);
    const r = await checkRules(root);
    const call = r.violations.find((v) => v.kind === 'call');
    expect(call).toMatchObject({ file: 'src/ui/view.py', line: 8, rule: 'mole-D002-1', target: 'src.db.query.q' });
    expect(call?.decision).toMatchObject({ id: 'D002' });
  });

  it('formatRules prints the SCIP-path violations the same way as the TS path', async () => {
    const root = pythonRepo(RECORDS);
    const text = formatRules(await checkRules(root));
    expect(text).toContain('src/ui/view.py:2');
    expect(text).toContain('D001');
    expect(text).toContain('src/ui/view.py:8');
    expect(text).toContain('D002');
  });

  it('`mole rules` exits 1 on the SCIP path, 0 once the violations are fixed', async () => {
    const dirty = pythonRepo(RECORDS);
    const out: string[] = [];
    const origLog = console.log;
    console.log = (...a: unknown[]) => void out.push(a.join(' '));
    try {
      expect(await rulesCli([], {}, dirty)).toBe(1);
    } finally {
      console.log = origLog;
    }
    const clean = pythonRepo({
      '.mole/decisions/D003-nothing.md': '---\nid: D003\ntitle: X\nstatus: accepted\nrules:\n  - forbid: import\n    from: src/nope/\n    to: src/also-nope/\n---\n',
    });
    expect(await rulesCli([], {}, clean)).toBe(0);
  });
});
