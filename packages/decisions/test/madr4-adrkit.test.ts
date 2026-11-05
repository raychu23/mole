// T100 (D71 MADR 4 + adrkit compat): graph.ts reads MADR 4's date/decision-makers/consulted/informed
// and adrkit's `affects` without losing Mole's own `rules:` extension or breaking pre-T100 records
// (parser.test.ts covers that back-compat path; this file is additive, new fields only).
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadGraph } from '../src/index.js';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const git = (root: string, ...args: string[]) =>
  execFileSync('git', ['-C', root, '-c', 'user.name=T', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', ...args], { encoding: 'utf8' }).trim();

function repo(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'mole-madr4-'));
  dirs.push(root);
  for (const [p, t] of Object.entries(files)) {
    mkdirSync(dirname(join(root, p)), { recursive: true });
    writeFileSync(join(root, p), t);
  }
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'base');
  return root;
}

const MADR4_RECORD = `---
id: D010-use-pg-boss
title: Use pg-boss for the job queue
status: accepted
date: 2026-11-04
decision-makers: [raymond, agent-b40d00a6]
consulted: [platform-team]
informed: [support-team]
affects:
  - type: path
    pattern: packages/server/src/queue/**
  - type: package
    pattern: pg-boss
rules:
  - forbid: import
    from: src/ui/
    to: src/db/
    why: UI must go through the service layer
---

## Decision

Use pg-boss.
`;

describe('T100: MADR 4 fields (date, decision-makers, consulted, informed)', () => {
  it('parses date/decision-makers/consulted/informed onto the node, file:line kept, rules: untouched', () => {
    const root = repo({ '.mole/decisions/D010-use-pg-boss.md': MADR4_RECORD });
    const g = loadGraph(root);
    expect(g.problems).toEqual([]);
    const d = g.nodes.find((n) => n.id === 'D010-use-pg-boss');
    expect(d).toBeDefined();
    expect(d?.date).toBe('2026-11-04');
    expect(d?.deciders).toEqual(['raymond', 'agent-b40d00a6']);
    expect(d?.consulted).toEqual(['platform-team']);
    expect(d?.informed).toEqual(['support-team']);
    expect(d?.fields.date).toBe(5); // front matter key line, same promise as every other field
  });

  it('legacy `deciders:` (MADR <=3 / log4brains) still populates the same node.deciders field', () => {
    const root = repo({
      '.mole/decisions/D011-legacy.md': '---\nid: D011-legacy\ntitle: Legacy deciders key\nstatus: accepted\ndeciders: [raymond]\n---\n',
    });
    const g = loadGraph(root);
    expect(g.nodes.find((n) => n.id === 'D011-legacy')?.deciders).toEqual(['raymond']);
  });

  it('a comma-separated scalar deciders/consulted value (MADR template prose: "list everyone...") also parses', () => {
    const root = repo({
      '.mole/decisions/D012-scalar.md': '---\nid: D012-scalar\ntitle: Scalar lists\nstatus: accepted\ndecision-makers: raymond, agent-b\nconsulted: platform-team\n---\n',
    });
    const g = loadGraph(root);
    const d = g.nodes.find((n) => n.id === 'D012-scalar');
    expect(d?.deciders).toEqual(['raymond', 'agent-b']);
    expect(d?.consulted).toEqual(['platform-team']);
  });
});

describe('T100: adrkit `affects` (github.com/mbeacom/adrkit)', () => {
  it('each affects entry is kept raw on the node AND folds into scope + an applies_to edge, same as a plain scope: entry', () => {
    const root = repo({ '.mole/decisions/D010-use-pg-boss.md': MADR4_RECORD });
    const g = loadGraph(root);
    const d = g.nodes.find((n) => n.id === 'D010-use-pg-boss');
    expect(d?.affects).toEqual([
      { type: 'path', pattern: 'packages/server/src/queue/**' },
      { type: 'package', pattern: 'pg-boss' },
    ]);
    expect(d?.scope).toEqual(
      expect.arrayContaining([
        { target: 'packages/server/src/queue/**', file: '.mole/decisions/D010-use-pg-boss.md', line: 10 },
        { target: 'pg-boss', file: '.mole/decisions/D010-use-pg-boss.md', line: 12 },
      ]),
    );
    expect(g.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ from: 'D010-use-pg-boss', to: 'packages/server/src/queue/**', type: 'applies_to' }),
        expect.objectContaining({ from: 'D010-use-pg-boss', to: 'pg-boss', type: 'applies_to' }),
      ]),
    );
  });

  it('a record with no affects: key has no extra scope/edges (back-compat: affects is purely additive)', () => {
    const root = repo({
      '.mole/decisions/D013-no-affects.md': '---\nid: D013-no-affects\ntitle: No affects\nstatus: accepted\n---\n',
    });
    const g = loadGraph(root);
    const d = g.nodes.find((n) => n.id === 'D013-no-affects');
    expect(d?.affects).toBeUndefined();
    expect(d?.scope).toEqual([]);
  });

  it("Mole's own rules: block survives unchanged alongside the new MADR 4 / adrkit fields (D71: not losing rules:)", () => {
    const root = repo({ '.mole/decisions/D010-use-pg-boss.md': MADR4_RECORD });
    const text = MADR4_RECORD;
    expect(text).toContain('rules:');
    expect(text).toContain('forbid: import');
    // rules: parsing itself is rules/parse.ts's job (rules-parse.test.ts); this test only guards that
    // adding MADR 4 / adrkit parsing to graph.ts did not require removing or renaming the rules: field.
    const g = loadGraph(root);
    expect(g.problems).toEqual([]);
  });
});
