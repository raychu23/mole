// T43 review fix P2: packages/decisions/src/rationale.ts (TS, used by the MCP tool and `mole decisions`)
// and plugins/claude-code/scripts/lib.mjs (dependency-free JS, used by the Claude Code plugin hooks) each
// carry their OWN copy of MADR/Nygard section extraction and budgeted formatting, on purpose (the hook
// scripts stay dependency-free, see lib.mjs's file header) -- but that means they can silently drift (the
// reviewer's example: lib.mjs was missing the `^links\b` context heading rationale.ts had, and rationale.ts
// carried a one-off `^entity references\b` hack lib.mjs never had). This test runs BOTH implementations on
// a shared fixture set -- all 15 Backstage ADRs, plus MADR/Nygard/no-heading/spec-style samples -- and
// fails on any difference, so drift is caught here instead of in a benchmark months later.
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { formatSections, sectionsOf } from '../src/rationale.js';
import { formatSectionsText, sectionsOfText } from '../../../plugins/claude-code/scripts/lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(here, 'fixtures/parity');

function fixtureFiles(): Array<{ name: string; text: string }> {
  const out: Array<{ name: string; text: string }> = [];
  for (const sub of ['backstage', 'samples']) {
    const dir = join(fixturesDir, sub);
    for (const f of readdirSync(dir).filter((n) => n.endsWith('.md')).sort()) {
      out.push({ name: `${sub}/${f}`, text: readFileSync(join(dir, f), 'utf8') });
    }
  }
  return out;
}

describe('TS rationale.ts vs JS lib.mjs: parity on a shared fixture set (P2 review fix)', () => {
  const fixtures = fixtureFiles();

  it('has the expected fixture count (15 Backstage ADRs + 5 MADR/Nygard/spec/no-heading samples)', () => {
    expect(fixtures.filter((f) => f.name.startsWith('backstage/')).length).toBe(15);
    expect(fixtures.filter((f) => f.name.startsWith('samples/')).length).toBeGreaterThanOrEqual(5);
  });

  for (const { name, text } of fixtureFiles()) {
    it(`sectionsOf/sectionsOfText agree on ${name}`, () => {
      const ts = sectionsOf(text);
      const js = sectionsOfText(text) as typeof ts;
      expect(js).toEqual(ts);
    });

    it(`formatSections/formatSectionsText agree on ${name}`, () => {
      const sections = sectionsOf(text);
      const tsOut = formatSections(sections);
      const jsOut = formatSectionsText(sectionsOfText(text), 4000); // rationale.ts's RATIONALE_BUDGET
      expect(jsOut).toBe(tsOut);
    });
  }
});
