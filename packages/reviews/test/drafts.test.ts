// T40 key: 10 review/meeting note fixtures with a frozen expected anchor (or null) per fixture.
// R2: never edit after the first (red-tests) commit; a wrong expectation is a blocker, not a silent fix.
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { draftsFromNotes } from '../src/drafts.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(here, '..', 'bench', 'fixtures', 'notes');
const key = JSON.parse(readFileSync(join(here, '..', 'bench', 'fixtures', 'key.json'), 'utf8')) as {
  cases: Array<{ fixture: string; expectedAnchor: string | null }>;
};
// the repo root the fixtures' flagged symbols actually live in: this monorepo checkout itself
const repoRoot = join(here, '..', '..', '..');

describe('draftsFromNotes (M34 part 1: drafts link to the right functions, D38 never invents)', () => {
  it('lists every fixture file (fixture completeness guard)', () => {
    const onDisk = readdirSync(fixturesDir).filter((f) => f.endsWith('.md')).sort();
    expect(onDisk).toEqual(key.cases.map((c) => c.fixture).sort());
    expect(key.cases.length).toBeGreaterThanOrEqual(10);
  });

  it('links >= 90% of fixtures with an expected anchor to the right symbol, and invents 0', () => {
    let correct = 0;
    let withExpectation = 0;
    let invented = 0;
    for (const c of key.cases) {
      const text = readFileSync(join(fixturesDir, c.fixture), 'utf8');
      const drafts = draftsFromNotes(repoRoot, text);
      const flagged = drafts.filter((d) => d.flagged);
      expect(flagged.length).toBeGreaterThanOrEqual(1); // every fixture has exactly one DECIDED/AGREED/DECISION line
      const d = flagged[0]!;
      if (c.expectedAnchor === null) {
        // D38: never invent a decision/anchor when nothing in the note resolves to real code
        if (d.anchor !== null) invented++;
      } else {
        withExpectation++;
        if (d.anchor === c.expectedAnchor) correct++;
      }
    }
    expect(invented).toBe(0);
    expect(correct / withExpectation).toBeGreaterThanOrEqual(0.9);
  });

  it('never produces a draft for an unflagged (non-DECIDED/AGREED/DECISION) line', () => {
    const text = readFileSync(join(fixturesDir, '01-pr-check.md'), 'utf8');
    const drafts = draftsFromNotes(repoRoot, text);
    const unflaggedCount = text.split('\n').filter((l) => /^- /.test(l) && !/^- (DECIDED|AGREED|DECISION)/i.test(l)).length;
    expect(unflaggedCount).toBeGreaterThan(0); // the fixture does contain unflagged lines
    expect(drafts.filter((d) => d.flagged)).toHaveLength(1); // only the one DECIDED: line
  });
});
