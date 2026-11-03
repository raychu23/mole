## Summary

D52's 18.5%/1347.5% inconsistency was a definition bug, not a flaky measurement: the bench's share formula
(selected/reach) was reused for the run-all baseline, whose own "selected" IS the full suite, so the ratio is
structurally >=100% and was mislabelled "% of the suite". Fixed in the bench only (packages/verify/bench,
packages/bench) — the selector itself (packages/verify/src) was never wrong. Added a standard RTS "selection
size % of the full suite" metric (Rothermel & Harrold / Ekstazi / STARTS), computed from the frozen,
committed m14-key.json: Mole runs 1.2% of the full suite in aggregate while catching the same 10/10 regressions
run-all catches. Red test first (packages/bench/test/h2-suite-share.test.ts, failed against the committed
scoreboard's "1347.5% of the suite"), then the fix, then a regenerated scoreboard — everything reproducible
from committed inputs alone, no live multi-repo bench run. Test-level inclusiveness and end-to-end time are
NOT RUN (the per-regression raw data lives only in a gitignored details file / isn't recorded at all).

## Notes

```notes
why reach-relative ratios can exceed 100%   reach.tests <= fullSuiteTests always (reach is a module-graph
    SUBSET of the suite); fullSuiteTests/reach.tests is therefore always >= 1, trivially, whenever reach <
    suite -- true for all 10 frozen rows (1.02x-60.3x). This is not a finding about run-all's quality; it is a
    property of the denominator choice. INFERENCE: I treat this as definitively the bug D52 flagged, because
    the exact arithmetic (13.475 mean) reproduces "1347.5%" bit-for-bit from the frozen key.

why I didn't touch the product   packages/verify/src/{index,testmap,graph}.ts (selectTests, runTests, the test
    map) were never part of the broken formula -- the bug lived entirely in the bench's post-hoc summary math
    (m14.ts) and the scoreboard's prose (h2h.ts). No product commit was needed or made.

m11's reach gap   failingInReach=1 of failing.length=5 for row m11 (20% reach inclusiveness) is a real,
    reproducible finding from the frozen key, not something I measured live. INFERENCE: I read this as meaning
    `vitest related` alone would be unsafe for that specific regression (it structurally can't select 4 of the
    5 fault-revealing tests), and that Mole's own selector reaching beyond pure "reach" (via past-fix lineage /
    reverse call-graph BFS, per packages/verify's design) is what let it still catch m11. I did not verify this
    mechanism live (would need the m14-details.json that isn't committed) -- INFERENCE, not confirmed by a run.

limits / NOT RUN   test-level inclusiveness (per-regression recall of ALL failing tests, not just >=1) and
    end-to-end wall-clock time both need live per-regression detail (ran/caught arrays, select/run ms) that
    only exists in .mole/local/bench/m14-details.json, which is gitignored and was never committed; and a fresh
    live run needs the Mole/Excalidraw scratch checkouts under ~/.hermes/cache/scratch/mole-builder-5/, which
    don't exist in this worktree (no network to clone Excalidraw). Both are reported as NOT RUN in results.md,
    not estimated or fabricated.
```
