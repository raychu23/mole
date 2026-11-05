// T106: `mole rules` on a Go repo, via a real `index.scip` (scip-go 0.2.9; see
// packages/scip/test/fixtures/go/HOW-PRODUCED.md), proving the SCIP path works for Go the same way
// rules-check-scip.test.ts proved it for Python -- same RuleSpec front matter, same Violation shape.
import { cpSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { checkRules, formatRules, rulesCli } from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const goFixture = join(here, '../../scip/test/fixtures/go');

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const c of cleanups.splice(0)) c();
});

function goRepo(records: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'mole-rules-scip-go-'));
  cleanups.push(() => rmSync(root, { recursive: true, force: true }));
  cpSync(goFixture, root, { recursive: true });
  for (const [f, text] of Object.entries(records)) {
    mkdirSync(dirname(join(root, f)), { recursive: true });
    writeFileSync(join(root, f), text);
  }
  return root;
}

const RECORDS: Record<string, string> = {
  '.mole/decisions/D001-main-no-leaf.md': [
    '---',
    'id: D001',
    'title: main.go never imports pkg/leaf directly',
    'status: accepted',
    'rules:',
    '  - forbid: import',
    '    from: case_plain.go',
    '    to: pkg/leaf/',
    '    why: one example import rule on the Go SCIP path',
    '---',
    '',
  ].join('\n'),
  '.mole/decisions/D002-no-direct-helper.md': [
    '---',
    'id: D002',
    'title: Nothing outside pkg/leaf calls Helper() directly',
    'status: accepted',
    'rules:',
    '  - forbid: call',
    '    callee: Helper',
    "    from: '**'",
    '    except: [pkg/leaf/]',
    '    why: one example call rule on the Go SCIP path',
    '---',
    '',
  ].join('\n'),
};

describe('checkRules on a Go repo (SCIP path)', () => {
  it('catches the planted import violation, citing its decision', async () => {
    const root = goRepo(RECORDS);
    const r = await checkRules(root);
    expect(r.errors).toEqual([]);
    const imp = r.violations.find((v) => v.kind === 'import');
    expect(imp).toMatchObject({ file: 'case_plain.go', line: 3, rule: 'mole-D001-1', target: 'pkg/leaf/leaf.go' });
    expect(imp?.decision).toMatchObject({ id: 'D001' });
  });

  it('catches the planted call violation, citing its decision', async () => {
    const root = goRepo(RECORDS);
    const r = await checkRules(root);
    const calls = r.violations.filter((v) => v.kind === 'call' && v.rule === 'mole-D002-1');
    // every case_*.go file that calls leaf.Helper()/Helper() directly (outside pkg/leaf itself)
    expect(calls.map((c) => c.file).sort()).toEqual(['case_alias.go', 'case_dot.go', 'case_plain.go']);
  });

  it('formatRules prints the Go SCIP-path violations the same way as the Python path', async () => {
    const root = goRepo(RECORDS);
    const text = formatRules(await checkRules(root));
    expect(text).toContain('case_plain.go:3');
    expect(text).toContain('D001');
    expect(text).toContain('D002');
  });

  it('`mole rules` exits 1 on the Go SCIP path, 0 once the violations are fixed', async () => {
    const dirty = goRepo(RECORDS);
    const out: string[] = [];
    const origLog = console.log;
    console.log = (...a: unknown[]) => void out.push(a.join(' '));
    try {
      expect(await rulesCli([], {}, dirty)).toBe(1);
    } finally {
      console.log = origLog;
    }
    const clean = goRepo({
      '.mole/decisions/D003-nothing.md': '---\nid: D003\ntitle: X\nstatus: accepted\nrules:\n  - forbid: import\n    from: nope/\n    to: also-nope/\n---\n',
    });
    expect(await rulesCli([], {}, clean)).toBe(0);
  });
});
