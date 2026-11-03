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

**Review fixes (this pass, HIGH 1 / HIGH 2 / MEDIUM 3):**
- **HIGH 1 (approval was positional, not content-bound):** a captured argument's id is positional
  (`::pro:N`/`::con:N`/`::option:N`), so inserting a new bullet above an approved one shifted every id
  after it -- the shifted id silently inherited 'approved' on NEW text, while the approved text moved to a
  different id that looked never-reviewed. Fixed: `captured-store.ts` now merges by CONTENT first (sha256
  of `role::text`, `contentHash` on every row), falling back to id only for an honest edit-in-place (which
  reverts to `draft` with `previouslyApproved`/`previouslyApprovedBy`/`previouslyApprovedAt` noted). Tested:
  insertion, edit-in-place, reorder, delete -- all four reviewer reproducers in `argument-capture.test.ts`.
- **HIGH 2 (chosen option attacking its own claim on real records):** `derive-adr.ts`'s `sameName()`
  stripped double/curly quotes but not single quotes, so a chosen option phrased with nested single quotes
  (real m29-madr 0009/0015/0016: `"Include in section 'More Information'"`-style) never matched its own
  Considered Options bullet and was NOT excluded -- it showed up as a considered-option attacking its own
  claim. Fixed `sameName()` to normalize every quote kind (straight/curly single+double, backtick); T54's
  own tests (`argdown-derive-adr.test.ts`) re-run green plus a new regression test. Also added an
  independent, defensive guard in `capture/arguments.ts` (belt-and-suspenders: strips a claim-attack from
  any considered-option row whose normalized text equals the chosen option, even if `sameName`'s own
  exclusion ever regresses), tested against both real records (0015, 0016). Re-ran the 5-record real
  capture: 98 -> 95 captured arguments (3 fewer self-attacking rows), all 95 spans re-verified
  character-for-character (`4 log/span-hand-check.md`).
- **MEDIUM 3 (no locking, lost updates under concurrency):** `captured-store.ts`'s read-modify-write
  (merge-and-save, approve, reject) had no locking -- concurrent CLI calls on the same decision could
  clobber each other's write. Fixed with the SAME `proper-lockfile` pattern as `priorities.ts`'s
  `setPriorities` (mkdir-based mutex, mtime refresh while held, atomic temp-file+rename write);
  `approveCapturedArgument`/`rejectCapturedArgument`/`saveCapturedArguments` are now async. Stress-tested:
  12 concurrent `mole arguments approve` CLI processes x 10 rounds on the same decision, 0 lost updates
  (`captured-arguments-lock.test.ts`, real child processes via vite-node, same convention as
  `priorities-lock-worker.ts`).

**Review 2 fixes (NEW HIGH D-attack, COMPOUNDING):**
- **NEW HIGH (D-attack -- a row's TARGET wasn't part of its content identity):** `contentHashOf` hashed
  only `role::text`, so a `con` with IDENTICAL wording, moved from Option A's Pros-and-Cons subsection to
  Option B's, hashed the same as before the move -- `mergeByContent` read it as "nothing changed" and
  silently carried alice's old approval (and Option A's defeat) onto Option B, with nobody ever reviewing
  "this con attacks B". Fixed: `contentHashOf` now hashes role + normalized text + the SORTED NAMES
  (never positional `::option:N` ids, which shift independently of what they point to) of everything the
  row attacks/supports, via a new `targetNameOf` resolving each id against the SAME capture batch (never
  mixing an existing-batch id with a fresh-batch one). A moved-but-textually-unchanged row now reverts to
  `draft` with `previouslyApproved` noted, exactly like an edit-in-place -- tested with the reviewer's own
  D-attack reproducer (two rejected options, a con moved between their subsections: labels do NOT change
  until a human re-approves the moved con) plus a no-op-move regression (same option, re-captured, keeps
  its approval). Added `approvedHash` (the contentHash stamped AT approval time) so the invariant
  `approvedHash === contentHash` for every approved row is independently checkable, never just inferred.
- **COMPOUNDING (two rows sharing one id after merge):** `mergeByContent`'s pass-1/pass-2 resolved rows all
  keep the FRESH row's own positional id (by design -- ids are allowed to shift); the never-claimed
  leftover EXISTING rows (case 4, deleted-from-source, kept append-only) used to carry their OWN old id
  forward unconditionally. Because ids are positional, a reshaped document can reissue a low id that an
  unrelated leftover row still holds -- two rows then shared one id in the same decision file, and
  `setRow`'s `findIndex` would silently patch whichever came first. Fixed: the backfill step now
  disambiguates a colliding leftover id (`<id>::staleN`) before pushing it, and `mergeByContent` asserts
  the final merged set has zero duplicate ids (never trust the disambiguation silently worked);
  `approveCapturedArgument`/`rejectCapturedArgument` now also refuse an AMBIGUOUS id loudly rather than
  mutating whichever row `findIndex` happens to see first. Tested: a direct reshape reproducer (shrinking a
  3-option document back to 2 reissues `::option:1`/`::con:1`, confirmed 7 rows / 5 distinct ids pre-fix)
  plus a 30-seed property test (deterministic PRNG, no external dependency) running random
  insert/move/edit/delete sequences across 2-3 options and asserting, after every re-capture: no duplicate
  ids, every approved row's `approvedHash` equals its current `contentHash`, and `evaluate()`'s labels
  equal those recomputed from exactly the approved-and-hash-matching rows (the same set
  `captured-loader.ts` turns into graph nodes).

## Files
- `packages/decisions/src/capture/arguments.ts` -- deterministic extraction + `TextQuoteSpan`; review HIGH
  2 added a defensive chosen-option guard and the `contentHash`/`previouslyApproved*` fields; review 2
  added `approvedHash`.
- `packages/decisions/src/capture/captured-store.ts` -- append-only store, approve/reject (T46 pattern);
  review HIGH 1 content-bound merge (`mergeByContent`) + review MEDIUM 3 proper-lockfile locking + atomic
  writes (same pattern as `priorities.ts`'s `setPriorities`); approve/reject/save are now async. Review 2:
  `contentHashOf`/`targetNameOf` bind a row's identity to its attack/support TARGET NAMES, not positional
  ids; `mergeByContent`'s backfill disambiguates a colliding leftover id and asserts the merged set is
  duplicate-free; `setRow` refuses an ambiguous id; `approveCapturedArgument` stamps `approvedHash`.
- `packages/decisions/src/argdown/captured-loader.ts` -- approved-only rows -> graph nodes/edges.
- `packages/decisions/src/capture/arguments-cli.ts` -- `mole arguments capture|approve|reject|list`; now
  awaits the async store calls.
- `packages/decisions/src/graph.ts` -- one new `loadCapturedArguments(b)` call after `loadArgdown`.
- `packages/decisions/src/argdown/derive-adr.ts` -- review HIGH 2: `sameName()` now normalizes every quote
  kind; exported `optionNameOf` and new `findChosenOptionName()` for arguments.ts's defensive guard.
- `packages/decisions/src/index.ts`, `packages/daemon/src/cli.ts` -- exports + one lazy-import CLI line.
- `packages/decisions/test/argument-capture.test.ts` -- extraction/draft-isolation tests (original 9) plus
  review-fix tests: HIGH 1's insert/edit-in-place/reorder/delete reproducers, HIGH 2's real-record (0015,
  0016) + sameName tests, and review 2's D-attack move reproducer + no-op-move regression, a direct
  duplicate-id reshape reproducer, and a 30-seed property test (random insert/move/edit/delete sequences).
- `packages/decisions/test/argdown-derive-adr.test.ts` -- +1 regression test for the quote-normalization fix.
- `packages/decisions/test/captured-arguments-lock.test.ts` + `captured-arguments-lock-worker.ts` -- review
  MEDIUM 3's 12-concurrent-processes-x-10-rounds stress test (real child processes, vite-node, same
  convention as `priorities-lock-worker.ts`).
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
- **Fixed (review HIGH 2, this pass)**: `derive-adr.ts`'s `sameName()` used to strip double quotes but not
  single quotes, so on 3 of the 5 real records (0009, 0015, 0016) the Decision Outcome's `"...'X'..."`
  phrasing didn't match the Considered-Options bullet's `"X"` phrasing, and the record's own chosen option
  was NOT excluded from "attacks the claim" -- it showed up as a considered-option argument like any
  rejected one. Flagged in the previous pass as out of this task's original boundary; the review made it
  in-boundary. Fixed `sameName()` to normalize every quote kind (straight/curly single+double, backtick) --
  T54's own tests (`argdown-derive-adr.test.ts`) re-run green, plus a new regression test there. Also added
  an independent, defensive guard in `capture/arguments.ts` itself (belt-and-suspenders against a future
  regression in `sameName`'s own exclusion), verified against both real records (0015, 0016) directly.
- A real bug WAS found and fixed within this task's own new code: `## Pros and Cons of the Options`
  sections in real MADR records (0009, 0016) contain ` ```markdown ` illustration fences whose CONTENTS
  look like headings/bullets; the first version of `extractProsCons` used those fake headings to end its
  scan early (0009 found 7 arguments instead of 29; 0016 found 3 instead of 9). Fixed by tracking fence
  state and skipping heading/bullet matching while inside a fence; re-verified against the real files
  (span-hand-check.md) and re-ran the full test suite (still green).
- Stop condition ("a draft argument changes a verdict") was never observed; the dedicated test suite
  proves the mechanism (draft = no graph node = invisible to evaluate()) rather than just asserting the
  outcome once.
