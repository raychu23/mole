// T40 connection requirement: the team PR check (T32) surfaces design-review/meeting decision drafts on the
// SAME check-run it already builds, reusing that mechanism instead of a second PR comment or bot (D24 non-goal).
// This only checks the wiring; @mole/reviews' own tests cover draft linking against the frozen M34 key.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));

describe('T40 connection: pr-check surfaces review/meeting drafts on the one check-run (T32 mechanism)', () => {
  it('imports @mole/reviews and calls reviewDraftsSummary into the same checkRun payload', () => {
    const src = readFileSync(join(here, '..', 'src', 'check', 'pr-check.ts'), 'utf8');
    expect(src).toContain("from '@mole/reviews'");
    expect(src).toContain('reviewDraftsSummary(root)');
    expect(src).toContain('reviewDrafts');
  });
});
