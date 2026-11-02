// T43 review fix P1 red test: lib.mjs decisionsBlock() had no aggregate rationale budget of its own --
// with ~8+ decisions in play, the per-decision RATIONALE_BUDGET_PER_DECISION (1,200 chars each) blew past
// the outer clip() (MAX_CHARS 9,500) and clip() cut mid-Decision text, mid-sentence, inside a rationale
// block (not at a block boundary). This test uses 20 decisions (the reviewer's repro size) so several
// whole rationale blocks must be dropped before clip() ever has anything to cut.
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { clip, decisionsBlock, MAX_CHARS } from '../scripts/lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
void here;

// a realistic T43 per-decision rationale: "Decision: ...\n\nContext/Rationale: ..." shape, long enough that
// RATIONALE_BUDGET_PER_DECISION (1,200) actually engages, each ending in its own unique marker so a test can
// tell whether a given block survived WHOLE or was dropped entirely -- never check for a half-cut fragment.
function rationaleFor(id: string): string {
  const body = `This decision governs module ${id} and the reasoning behind it repeats enough filler text to exercise the per-decision rationale budget realistically. `.repeat(6);
  return `Decision: ${body}END-OF-RATIONALE-${id}`;
}

function makeDecisions(n: number) {
  return Array.from({ length: n }, (_, i) => {
    const id = String(i + 1).padStart(4, '0');
    return {
      id,
      flag: 'green' as const,
      status: 'accepted',
      title: `Decision number ${id} about some module`,
      approver: 'raymond',
      file: `.mole/decisions/${id}.md`,
      files: new Set<string>(),
      rationale: rationaleFor(id),
    };
  });
}

describe('decisionsBlock: an aggregate rationale budget, so clip() never cuts mid-Decision (P1 regression)', () => {
  it('with 20 decisions, drops whole lower-ranked rationale blocks (keeping their one-line summary + a pointer) rather than letting clip() cut mid-block', () => {
    const decisions = makeDecisions(20);
    const out = decisionsBlock(decisions);

    // the whole block, BEFORE the outer clip(), must already be at or under MAX_CHARS -- i.e. decisionsBlock
    // itself must have capped the aggregate rationale text, not relied on clip() to do it.
    expect(out.length).toBeLessThanOrEqual(MAX_CHARS);

    // every rationale block that DID make it into the output is whole: its unique end-marker is present
    // whenever its "Decision: This decision governs module <id>" opening text is present. A block that was
    // cut mid-way (clip() style) would show the opening without the matching end-marker.
    for (const d of decisions) {
      const opened = out.includes(`Decision: This decision governs module ${d.id}`);
      const closed = out.includes(`END-OF-RATIONALE-${d.id}`);
      expect(opened).toBe(closed);
    }

    // at least one rationale block was actually dropped (20 decisions x ~1,200 chars each can't all fit),
    // and the output says so with a pointer to the full-text tool, not silence.
    const keptCount = decisions.filter((d) => out.includes(`END-OF-RATIONALE-${d.id}`)).length;
    expect(keptCount).toBeLessThan(decisions.length);
    expect(keptCount).toBeGreaterThan(0); // and at least one survives whole -- not an all-or-nothing budget
    expect(out).toMatch(/more rationale block.*omitted/);
    expect(out).toMatch(/mole decisions --json|mole_decisions/);

    // clip() at the hook's own outer cap is then a true no-op on this output (done-when: never mid-Decision).
    expect(clip(out)).toBe(out);
  });
});
