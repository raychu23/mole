// T27 red tests: front matter `rules:` -> normalized rules with the record's file:line (done-when 1), and a rule with a
// syntax error fails loudly with file:line, never silently skipped (done-when 3).
// (written with a terminal heredoc: write_file is approval-gated for test files in this unattended run)
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkRules, loadRules, rulesCli } from '../src/index.js';

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const c of cleanups.splice(0)) c();
  vi.restoreAllMocks();
});

function repo(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'mole-rules-parse-'));
  cleanups.push(() => rmSync(root, { recursive: true, force: true }));
  for (const [f, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, f)), { recursive: true });
    writeFileSync(join(root, f), text);
  }
  return root;
}

// line 1 ---, 2 id, 3 title, 4 status, 5 rules:, 6 = first rule item
const record = (id: string, rules: string, status = 'accepted') =>
  `---\nid: '${id}'\ntitle: Decision ${id}\nstatus: ${status}\nrules:\n${rules}---\n\n## Decision\n\nBody.\n`;

describe('loadRules: rules from decision front matter', () => {
  it('normalizes import and call rules with names mole-<id>-<n> and the rule item line', () => {
    const root = repo({
      '.mole/decisions/0001-ui-no-db.md': record(
        '0001',
        [
          '  - forbid: import', // 6
          '    from: src/ui/', // 7
          '    to: src/db/', // 8
          '    why: the UI talks to the API, never the database', // 9
          '  - forbid: import', // 10
          '    from: src/cli.ts',
          '    to: [typescript, \'@mole/indexer\']',
          '    dynamic: false',
          '    types: true',
          '  - forbid: call', // 15
          '    callee: fetch',
          "    from: '**'",
          '    except: [src/api/]',
          '',
        ].join('\n'),
      ),
    });
    const r = loadRules(root);
    expect(r.errors).toEqual([]);
    expect(r.rules.map((x) => [x.name, x.kind, x.line])).toEqual([
      ['mole-0001-1', 'import', 6],
      ['mole-0001-2', 'import', 10],
      ['mole-0001-3', 'call', 15],
    ]);
    const [a, b, c] = r.rules;
    expect(a).toMatchObject({ decision: '0001', from: 'src/ui/', to: ['src/db/'], except: [], types: false, why: 'the UI talks to the API, never the database', file: '.mole/decisions/0001-ui-no-db.md' });
    expect(a!.dynamic).toBeUndefined();
    expect(b).toMatchObject({ from: 'src/cli.ts', to: ['typescript', '@mole/indexer'], dynamic: false, types: true });
    expect(c).toMatchObject({ kind: 'call', callee: ['fetch'], from: '**', except: ['src/api/'] });
  });

  it('records without rules contribute nothing; a superseded record\'s rules are skipped with a reason, not enforced', () => {
    const root = repo({
      '.mole/decisions/0002-plain.md': "---\nid: '0002'\ntitle: Plain\nstatus: accepted\n---\n",
      '.mole/decisions/0003-old.md': record('0003', '  - forbid: call\n    callee: eval\n    from: src/\n', 'superseded'),
    });
    const r = loadRules(root);
    expect(r.errors).toEqual([]);
    expect(r.rules).toEqual([]);
    expect(r.skipped).toEqual([expect.objectContaining({ decision: '0003', file: '.mole/decisions/0003-old.md', line: 5 })]);
    expect(r.skipped[0]!.reason).toMatch(/superseded/);
  });

  it('a proposed record\'s rules are enforced (cited with their status), so a builder-proposed rule is visible before approval', () => {
    const root = repo({ '.mole/decisions/0004-p.md': record('0004', '  - forbid: call\n    callee: eval\n    from: src/\n', 'proposed') });
    expect(loadRules(root).rules.map((x) => x.name)).toEqual(['mole-0004-1']);
  });
});

describe('rule syntax errors fail loudly with file:line (done-when 3)', () => {
  const cases: Array<[string, string, number, RegExp]> = [
    ['unknown kind', '  - forbid: imprt\n    from: src/\n    to: x\n', 6, /forbid.*imprt|imprt/],
    ['import without to', '  - forbid: import\n    from: src/\n', 6, /\bto\b/],
    ['call without callee', '  - forbid: call\n    from: src/\n', 6, /callee/],
    ['missing from', '  - forbid: call\n    callee: eval\n', 6, /\bfrom\b/],
    ['unknown key (typo)', '  - forbid: call\n    callee: eval\n    from: src/\n    exept: [src/a/]\n', 9, /exept/],
    ['bad glob', "  - forbid: call\n    callee: eval\n    from: 'src/{ui,core/'\n", 8, /glob|brace|\{/],
    ['dynamic not a boolean', '  - forbid: import\n    from: src/\n    to: x\n    dynamic: sometimes\n', 9, /dynamic/],
    ['rules not a list', '  forbid: import\n', 5, /list/],
    ['a rule item that is not a map', '  - just a string\n', 6, /map|forbid/],
  ];
  for (const [name, rules, line, msg] of cases)
    it(name, () => {
      const root = repo({ '.mole/decisions/0009-bad.md': record('0009', rules) });
      const r = loadRules(root);
      expect(r.rules).toEqual([]);
      expect(r.errors.length).toBeGreaterThan(0);
      expect(r.errors[0]).toMatchObject({ file: '.mole/decisions/0009-bad.md', line });
      expect(r.errors[0]!.message).toMatch(msg);
    });

  it('one bad rule does not hide the good ones next to it, and is still an error', () => {
    const root = repo({
      '.mole/decisions/0010-mixed.md': record('0010', '  - forbid: call\n    callee: eval\n    from: src/\n  - forbid: nope\n    from: src/\n'),
    });
    const r = loadRules(root);
    expect(r.rules.map((x) => x.name)).toEqual(['mole-0010-1']);
    expect(r.errors).toEqual([expect.objectContaining({ file: '.mole/decisions/0010-mixed.md', line: 9 })]);
  });

  it('a YAML error in a record with rules is an error at its line', () => {
    const root = repo({ '.mole/decisions/0011-yaml.md': "---\nid: '0011'\ntitle: Y\nstatus: accepted\nrules:\n  - forbid: call\n    callee: [eval\n---\n" });
    const r = loadRules(root);
    expect(r.errors.length).toBeGreaterThan(0);
    expect(r.errors[0]!.file).toBe('.mole/decisions/0011-yaml.md');
    expect(r.errors[0]!.line).toBeGreaterThanOrEqual(5);
  });

  it('checkRules carries the errors and `mole rules` exits 2 printing file:line', async () => {
    const root = repo({ '.mole/decisions/0012-bad.md': record('0012', '  - forbid: imprt\n    from: src/\n    to: x\n'), 'src/a.ts': 'export const a = 1;\n' });
    const res = await checkRules(root);
    expect(res.errors[0]).toMatchObject({ file: '.mole/decisions/0012-bad.md', line: 6 });
    const out: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => void out.push(a.join(' ')));
    vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => void out.push(a.join(' ')));
    expect(await rulesCli([], {}, root)).toBe(2);
    expect(out.join('\n')).toContain('.mole/decisions/0012-bad.md:6');
  });
});
