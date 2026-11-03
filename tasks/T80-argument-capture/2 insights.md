## Summary
Contestable AI-drafted arguments: new `captureAdrArguments()` extracts claim/considered-option/reason
(reusing T54's `deriveAdrArgumentFramework`) plus NEW pro/con arguments from MADR's `## Pros and Cons of
the Options` section, each with a W3C-TextQuoteSelector-style span (file+line/char+exact quote) and
`provenance: {source:'compiler'}` (deterministic, no model). Stored `draft` in append-only JSON
(`.mole/arguments/captured/<id>.json`, same shape as T46's compile store). `mole arguments approve/reject`
is the only path to `approved`; a new graph loader turns ONLY approved rows into `argument` graph nodes --
drafts never exist as nodes, so they are structurally invisible to `argumentFramework()`/`evaluate()`.
Tested end to end (library + real CLI on a scratch repo); 5 real MADR records captured, 98 arguments,
every span hand-checked. Found and fixed a real extraction bug (example code fences in the real corpus
faked out the section-end scan). All existing tests + `mole rules` (0013/0014/0017) stay green.

## Files
- `packages/decisions/src/capture/arguments.ts` -- deterministic extraction + `TextQuoteSpan`.
- `packages/decisions/src/capture/captured-store.ts` -- append-only store, approve/reject (T46 pattern).
- `packages/decisions/src/argdown/captured-loader.ts` -- approved-only rows -> graph nodes/edges.
- `packages/decisions/src/capture/arguments-cli.ts` -- `mole arguments capture|approve|reject|list`.
- `packages/decisions/src/graph.ts` -- one new `loadCapturedArguments(b)` call after `loadArgdown`.
- `packages/decisions/src/argdown/derive-adr.ts` -- exported `sameName` (no new logic, reuse).
- `packages/decisions/src/index.ts`, `packages/daemon/src/cli.ts` -- exports + one lazy-import CLI line.
- `packages/decisions/test/argument-capture.test.ts` -- 9 new tests (extraction, span exactness, draft
  isolation, approve-flips-verdict, reject, unknown-id error, merge-keeps-approval, listing).
- `tasks/T80-argument-capture/4 log/{prior-art.md, red.txt, span-hand-check.md, real-run-5-madr-records.json, ledger.md}`.

## Notes (limits labelled INFERENCE where applicable)

- **Pro/con attack direction is a deliberate, documented choice, not a derived fact**: a `con` (Bad,
  because...) attacks the OPTION its subsection names, never the claim directly, mirroring T54's own
  rejected-Consequences-attacking-everything lesson (prior-art.md's design-choice section explains why).
  This is a design decision with cited reasoning, not INFERENCE.
- **INFERENCE**: the chosen option's own Pros-and-Cons bullets get captured (span/provenance/draft, same
  as any other) but with an empty `attacks`/`supports` list, because `deriveAdrArgumentFramework` never
  turns the chosen option into a graph node at all (pre-existing T54 scope). I inferred this is the right
  behavior (never fabricate a target) rather than inventing a "chosen option" node myself, which would be
  new scope beyond what the contract asked for.
- **Observed limitation, not a T80 bug**: `derive-adr.ts`'s `sameName()` (pre-existing, unchanged) strips
  double quotes but not single quotes, so on 2 of the 5 real records (0015, 0016) the Decision Outcome's
  `"...'X'..."` phrasing doesn't match the Considered-Options bullet's `"X"` phrasing, and the record's own
  chosen option is NOT excluded from "attacks the claim" -- it shows up as a considered-option argument
  like any rejected one. This is visible in the captured JSON (not silently hidden) and reviewable before
  approval; fixing `sameName()` itself is out of this task's boundary (it belongs to T54's own module and
  touches existing passing tests there) -- flagged here for a future task, not silently patched.
- A real bug WAS found and fixed within this task's own new code: `## Pros and Cons of the Options`
  sections in real MADR records (0009, 0016) contain ` ```markdown ` illustration fences whose CONTENTS
  look like headings/bullets; the first version of `extractProsCons` used those fake headings to end its
  scan early (0009 found 7 arguments instead of 29; 0016 found 3 instead of 9). Fixed by tracking fence
  state and skipping heading/bullet matching while inside a fence; re-verified against the real files
  (span-hand-check.md) and re-ran the full test suite (still green).
- Stop condition ("a draft argument changes a verdict") was never observed; the dedicated test suite
  proves the mechanism (draft = no graph node = invisible to evaluate()) rather than just asserting the
  outcome once.
