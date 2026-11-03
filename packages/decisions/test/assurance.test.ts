// T78 (D65): per-link assurance on door: one-way decisions. assuranceReport() never infers door-ness
// (see tasks/T78-one-way-door-assurance/4 log/prior-art.md) -- door comes only from the record's own
// front matter, same as graph.ts has always read it.
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { assuranceCli, assuranceReport } from '../src/assurance/report.js';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function repo(): string {
  const root = mkdtempSync(join(tmpdir(), 'mole-assurance-'));
  roots.push(root);
  return root;
}

function write(root: string, relFile: string, text: string): void {
  const abs = join(root, relFile);
  mkdirSync(join(abs, '..'), { recursive: true });
  writeFileSync(abs, text, 'utf8');
}

const FULL_ALCOA = 'attributable,legible,contemporaneous,original,accurate,complete,consistent,enduring,available';

describe('assuranceReport', () => {
  it('ignores two-way and door-less decisions entirely', () => {
    const root = repo();
    write(root, '.mole/decisions/two-way.md', '---\nid: two-way\ntitle: A two-way door\nstatus: accepted\ndoor: two-way\n---\n\n## Decision\n');
    write(root, '.mole/decisions/no-door.md', '---\nid: no-door\ntitle: No door field at all\nstatus: accepted\n---\n\n## Decision\n');
    const r = assuranceReport(root);
    expect(r.totalOneWayDoors).toBe(0);
    expect(r.folders).toEqual([]);
  });

  it('counts a one-way door with no assurance entries as one unassured slot', () => {
    const root = repo();
    write(root, '.mole/decisions/bare.md', '---\nid: bare\ntitle: Unassured one-way door\nstatus: accepted\ndoor: one-way\n---\n\n## Decision\n');
    const r = assuranceReport(root);
    expect(r.totalOneWayDoors).toBe(1);
    expect(r.totalLinks).toBe(1);
    expect(r.totalAssured).toBe(0);
    expect(r.assuredShare).toBe(0);
  });

  it('marks a link assured only when doubt, provenance, distinct author/approver, full ALCOA+ and a future reverify_by are all present', () => {
    const root = repo();
    write(
      root,
      '.mole/decisions/full.md',
      [
        '---',
        'id: full',
        'title: Fully assured one-way door',
        'status: accepted',
        'door: one-way',
        'assurance:',
        `  - {to: other, doubt: rebutting, provenance: person, author: alice, approver: bob, alcoa: '${FULL_ALCOA}', reverify_by: '2099-01-01'}`,
        '---',
        '',
        '## Decision',
        '',
      ].join('\n'),
    );
    const r = assuranceReport(root);
    expect(r.totalLinks).toBe(1);
    expect(r.totalAssured).toBe(1);
    expect(r.assuredShare).toBe(1);
    expect(r.folders[0]!.overdue).toEqual([]);
  });

  it('rejects same author and approver (author != approver check)', () => {
    const root = repo();
    write(
      root,
      '.mole/decisions/same-person.md',
      [
        '---',
        'id: same-person',
        'title: Author approved their own one-way door',
        'status: accepted',
        'door: one-way',
        'assurance:',
        `  - {to: other, doubt: rebutting, provenance: person, author: alice, approver: alice, alcoa: '${FULL_ALCOA}', reverify_by: '2099-01-01'}`,
        '---',
        '',
      ].join('\n'),
    );
    const r = assuranceReport(root);
    expect(r.totalAssured).toBe(0);
  });

  it('flags a past reverify_by as overdue and not assured', () => {
    const root = repo();
    write(
      root,
      '.mole/decisions/stale.md',
      [
        '---',
        'id: stale',
        'title: Stale one-way door',
        'status: accepted',
        'door: one-way',
        'assurance:',
        `  - {to: other, doubt: undermining, provenance: compiler, author: alice, approver: bob, alcoa: '${FULL_ALCOA}', reverify_by: '2000-01-01'}`,
        '---',
        '',
      ].join('\n'),
    );
    const r = assuranceReport(root);
    expect(r.totalAssured).toBe(0);
    expect(r.folders[0]!.overdue).toHaveLength(1);
    expect(r.folders[0]!.overdue[0]).toMatchObject({ decisionId: 'stale', to: 'other', reverifyBy: '2000-01-01' });
  });

  it('groups assured share per governed folder (scope anchors), and --folder filters to one', () => {
    const root = repo();
    write(
      root,
      '.mole/decisions/x.md',
      ['---', 'id: x', 'title: X', 'status: accepted', 'door: one-way', 'scope:', '  - packages/payments/', 'assurance:', `  - {to: y, doubt: rebutting, provenance: person, author: alice, approver: bob, alcoa: '${FULL_ALCOA}', reverify_by: '2099-01-01'}`, '---', ''].join('\n'),
    );
    write(root, '.mole/decisions/z.md', ['---', 'id: z', 'title: Z', 'status: accepted', 'door: one-way', 'scope:', '  - packages/billing/', '---', ''].join('\n'));
    const r = assuranceReport(root);
    expect(r.folders.map((f) => f.folder).sort()).toEqual(['packages/billing', 'packages/payments']);
    const filtered = assuranceReport(root, { folder: 'packages/payments' });
    expect(filtered.folders).toHaveLength(1);
    expect(filtered.folders[0]!.folder).toBe('packages/payments');
    expect(filtered.totalOneWayDoors).toBe(1);
  });

  it('falls back to the record file\'s own folder when a one-way door has no scope anchors', () => {
    const root = repo();
    write(root, '.mole/decisions/unscoped.md', '---\nid: unscoped\ntitle: Unscoped\nstatus: accepted\ndoor: one-way\n---\n\n## Decision\n');
    const r = assuranceReport(root);
    expect(r.folders.map((f) => f.folder)).toEqual(['.mole/decisions']);
  });

  it('CLI prints JSON with --json and a non-zero exit never happens on a clean report', () => {
    const root = repo();
    write(root, '.mole/decisions/bare.md', '---\nid: bare\ntitle: Bare\nstatus: accepted\ndoor: one-way\n---\n\n## Decision\n');
    const code = assuranceCli([], { json: true }, root);
    expect(code).toBe(0);
  });
});
