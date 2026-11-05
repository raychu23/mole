import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyRecordTransaction, decisionCli, recoverTransactions, suggestDuplicates } from '../src/index.js';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function repo(): string {
  const root = mkdtempSync(join(tmpdir(), 'mole-capture-'));
  roots.push(root);
  mkdirSync(join(root, '.mole', 'decisions'), { recursive: true });
  return root;
}

describe('mole decision new', () => {
  it('creates an explicit-id proposed record without changing an existing record', () => {
    const root = repo();
    const code = decisionCli(['new'], { id: 'D-42', title: 'Keep records local' }, root);
    expect(code).toBe(0);
    expect(readFileSync(join(root, '.mole/decisions/D-42.md'), 'utf8')).toBe(
      "---\nid: 'D-42'\ntitle: \"Keep records local\"\nstatus: proposed\n---\n\n## Context and Problem Statement\n\n## Considered Options\n\n## Decision Outcome\n\n",
    );
  });
});

describe('mole decision supersede', () => {
  it('marks the explicit predecessor superseded and writes reciprocal links to both records', () => {
    const root = repo();
    expect(decisionCli(['new'], { id: 'D-old', title: 'Old choice', status: 'accepted' }, root)).toBe(0);
    expect(decisionCli(['new'], { id: 'D-new', title: 'New choice', status: 'accepted' }, root)).toBe(0);

    expect(decisionCli(['supersede'], { old: 'D-old', new: 'D-new' }, root)).toBe(0);

    expect(readFileSync(join(root, '.mole/decisions/D-old.md'), 'utf8')).toContain('status: superseded\nsuperseded_by: [D-new]');
    expect(readFileSync(join(root, '.mole/decisions/D-new.md'), 'utf8')).toContain('supersedes: [D-old]');
  });
});

describe('mole decision link', () => {
  it('writes a supported relation and its reciprocal to the named records', () => {
    const root = repo();
    expect(decisionCli(['new'], { id: 'D-one', title: 'One', status: 'accepted' }, root)).toBe(0);
    expect(decisionCli(['new'], { id: 'D-two', title: 'Two', status: 'accepted' }, root)).toBe(0);

    expect(decisionCli(['link'], { from: 'D-one', to: 'D-two', relation: 'amends' }, root)).toBe(0);

    expect(readFileSync(join(root, '.mole/decisions/D-one.md'), 'utf8')).toContain('amends: [D-two]');
    expect(readFileSync(join(root, '.mole/decisions/D-two.md'), 'utf8')).toContain('amended_by: [D-one]');
  });
});

describe('capture transaction recovery', () => {
  it('restores both records after a failure between two replacements', () => {
    const root = repo();
    expect(decisionCli(['new'], { id: 'D-a', title: 'A', status: 'accepted' }, root)).toBe(0);
    expect(decisionCli(['new'], { id: 'D-b', title: 'B', status: 'accepted' }, root)).toBe(0);
    const a = join(root, '.mole/decisions/D-a.md');
    const b = join(root, '.mole/decisions/D-b.md');
    const beforeA = readFileSync(a, 'utf8');
    const beforeB = readFileSync(b, 'utf8');

    expect(() => applyRecordTransaction(root, [{ target: a, text: `${beforeA}changed-a\n` }, { target: b, text: `${beforeB}changed-b\n` }], { failAfter: 1 })).toThrow(/recover/);
    expect(readFileSync(a, 'utf8')).toContain('changed-a');
    expect(readFileSync(b, 'utf8')).toBe(beforeB);

    expect(recoverTransactions(root)).toBe(1);
    expect(readFileSync(a, 'utf8')).toBe(beforeA);
    expect(readFileSync(b, 'utf8')).toBe(beforeB);
  });
});

describe('mole decision is reachable from the mole CLI', () => {
  it('the daemon CLI registers `mole decision` with one line (shared-file rule: toContain, never an exact set)', () => {
    const src = readFileSync(new URL('../../daemon/src/cli.ts', import.meta.url), 'utf8');
    expect(src).toContain("cmd === 'decision'");
    expect(src).toContain('decisionCli(pos, flags, root)');
  });
});

describe('duplicate suggestions', () => {
  it('reports exact normalized imports and near duplicates without merging either record', () => {
    const incoming = { id: 'incoming', title: 'Use local decision records', body: 'Keep human reasoning beside design documents and code.' };
    const suggestions = suggestDuplicates(incoming, [
      { id: 'exact', title: 'use LOCAL decision records', body: 'Keep human reasoning beside design documents and code.' },
      { id: 'near', title: 'Use local decision records', body: 'Keep human reasoning beside the design documents and code.' },
      { id: 'other', title: 'Run database migrations', body: 'Migrate the production database during a maintenance window.' },
    ]);

    expect(suggestions).toEqual([
      expect.objectContaining({ id: 'exact', kind: 'exact', score: 1 }),
      expect.objectContaining({ id: 'near', kind: 'near', score: expect.any(Number) }),
    ]);
    expect(suggestions.find((s) => s.id === 'near')!.score).toBeGreaterThanOrEqual(0.9);
    expect(suggestions.map((s) => s.id)).not.toContain('other');
  });

  it('reads candidates without writing and rejects a malformed source record', () => {
    const root = repo();
    expect(decisionCli(['new'], { id: 'D-existing', title: 'Keep records local', body: 'A local source of truth.' }, root)).toBe(0);
    const before = readFileSync(join(root, '.mole/decisions/D-existing.md'), 'utf8');

    const logs: string[] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((m: unknown) => void logs.push(String(m)));
    try {
      expect(decisionCli(['suggest'], { id: 'D-incoming', title: 'Keep records local', body: 'A local source of truth.' }, root)).toBe(0);
    } finally {
      spy.mockRestore();
    }
    expect(JSON.parse(logs.join('\n'))).toEqual({ id: 'D-incoming', suggestions: [{ id: 'D-existing', kind: 'exact', score: 1 }] });
    expect(readFileSync(join(root, '.mole/decisions/D-existing.md'), 'utf8')).toBe(before);
    expect(readdirSync(join(root, '.mole/decisions'))).toEqual(['D-existing.md']);

    // a record with no front matter is reported, never silently skipped
    writeFileSync(join(root, '.mole/decisions/broken.md'), 'just prose, no front matter\n');
    const errs = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      expect(decisionCli(['suggest'], { id: 'D-incoming', title: 'Keep records local' }, root)).toBe(2);
      expect(String(errs.mock.calls[0]?.[0])).toMatch(/broken\.md/);
    } finally {
      errs.mockRestore();
    }
  });
});
