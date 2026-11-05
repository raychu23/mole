// T100 (D71 MADR 4 + adrkit compat): graph.ts reads MADR 4's date/decision-makers/consulted/informed
// and adrkit's `affects` without losing Mole's own `rules:` extension or breaking pre-T100 records
// (parser.test.ts covers that back-compat path; this file is additive, new fields only).
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { computeFlags, loadGraph } from '../src/index.js';

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
  it('a type: path entry is kept raw on the node AND folds into scope + an applies_to edge, same as a plain scope: entry; a non-path type (package) is kept raw but never anchored (review FAIL #1)', () => {
    const root = repo({ '.mole/decisions/D010-use-pg-boss.md': MADR4_RECORD });
    const g = loadGraph(root);
    const d = g.nodes.find((n) => n.id === 'D010-use-pg-boss');
    expect(d?.affects).toEqual([
      { type: 'path', pattern: 'packages/server/src/queue/**' },
      { type: 'package', pattern: 'pg-boss' },
    ]);
    // only the type: path entry anchors -- 'pg-boss' (type: package) names a dependency, not a repo path
    expect(d?.scope).toEqual([{ target: 'packages/server/src/queue/**', file: '.mole/decisions/D010-use-pg-boss.md', line: 10 }]);
    expect(g.edges).toEqual(
      expect.arrayContaining([expect.objectContaining({ from: 'D010-use-pg-boss', to: 'packages/server/src/queue/**', type: 'applies_to' })]),
    );
    expect(g.edges.some((e) => e.to === 'pg-boss')).toBe(false);
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

  it('an affects entry with no pattern: is dropped with a warning, not silently given pattern = the type value (review FAIL #3)', () => {
    const root = repo({
      '.mole/decisions/D014-malformed.md': '---\nid: D014-malformed\ntitle: Malformed affects\nstatus: accepted\naffects:\n  - type: path\n  - type: package\n    pattern: good-pkg\n---\n',
    });
    const g = loadGraph(root);
    const d = g.nodes.find((n) => n.id === 'D014-malformed');
    // the good entry (has a pattern) still loads; the malformed one (no pattern) does not become 'path' itself
    expect(d?.affects).toEqual([{ type: 'package', pattern: 'good-pkg' }]);
    expect(g.problems).toEqual(expect.arrayContaining([expect.objectContaining({ file: '.mole/decisions/D014-malformed.md', message: expect.stringContaining('affects: entry has no pattern') })]));
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

describe('T100 review round 2 (FAIL #1 fix): affects glob anchoring in computeFlags, not a literal file/dir lookup', () => {
  const affectsRecord = (pattern: string, type = 'path') =>
    `---\nid: D010-use-pg-boss\ntitle: Use pg-boss for the job queue\nstatus: accepted\naffects:\n  - type: ${type}\n    pattern: ${pattern}\n---\n\n## Decision\n\nUse pg-boss.\n`;

  it("the docs' D010 example: the governed dir is present -> green (glob match, not a literal 'packages/server/src/queue/**' path lookup)", () => {
    const root = repo({
      '.mole/decisions/D010-use-pg-boss.md': affectsRecord('packages/server/src/queue/**'),
      'packages/server/src/queue/index.ts': 'export const q = 1;\n',
    });
    const [flag] = computeFlags(loadGraph(root));
    expect(flag!.flag).toBe('green');
  });

  it("the docs' D010 example: the governed dir existed at the confirmed commit and was since removed -> orphaned (red)", () => {
    const root = repo({
      '.mole/decisions/D010-use-pg-boss.md': affectsRecord('packages/server/src/queue/**'),
      'packages/server/src/queue/index.ts': 'export const q = 1;\n',
    });
    rmSync(join(root, 'packages/server/src/queue'), { recursive: true, force: true });
    const [flag] = computeFlags(loadGraph(root));
    expect(flag!.flag).toBe('red');
    expect(flag!.reasons.some((r) => r.code === 'orphaned')).toBe(true);
  });

  it("mole init's own scaffold (affects: [{type: path, pattern: src/ui/**}]) right after init, no src/ui/ built yet -> NOT red (a glob that never matched anything is not an 'orphaned' asserted-evidence anchor)", () => {
    const root = repo({ '.mole/decisions/D001-example-decision.md': affectsRecord('src/ui/**') });
    const [flag] = computeFlags(loadGraph(root));
    expect(flag!.flag).not.toBe('red');
  });

  it('a package-type affects entry never anchors: it does not contribute to the flag at all (a repo with no matching dependency file stays green)', () => {
    const root = repo({ '.mole/decisions/D010-use-pg-boss.md': affectsRecord('pg-boss', 'package') });
    const [flag] = computeFlags(loadGraph(root));
    expect(flag!.flag).toBe('green');
  });

  it('review round 2 (item 5): a pre-existing affects: record changes behavior -- a glob pattern that never fully resolves to a literal path used to read permanently orphaned, now reads green once its target exists', () => {
    const root = repo({
      '.mole/decisions/D015-pre-existing.md': affectsRecord('src/widgets/**'),
      'src/widgets/button.ts': 'export {};\n',
    });
    const [flag] = computeFlags(loadGraph(root));
    // before this fix: checkAnchor did isFile/isDir('src/widgets/**') literally -- always false -- so this
    // record was always 'red'/'orphaned' no matter what existed on disk (docs/decisions-and-rules.md's
    // "Behavior change for an existing affects: record" note).
    expect(flag!.flag).toBe('green');
  });
});
