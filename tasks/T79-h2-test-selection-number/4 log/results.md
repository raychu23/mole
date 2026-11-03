# T79 results: H2 test-selection number, old vs new

```notes
bug (D52)     packages/verify/bench/m14.ts's old `allMean` was fullSuiteTests/reach.tests averaged over the 10
              frozen rows, then packages/bench/h2h.ts's H2 prose called that number "% of the suite" for the
              run-all baseline. Since reach.tests <= fullSuiteTests for every row, that ratio is always >=100%
              whenever reach < suite (a structural artifact, not a baseline result) -- reproduced exactly:
              sum(fullSuiteTests/reach.tests over the 10 frozen rows)/10 = 13.475 = "1347.5%", matching D52 and
              the frozen tasks/T22-hand-back-test-selection/4 log/runs.jsonl verbatim.
root cause    a definition mismatch, not a typo: the bench had one "share" formula (selected/reach, a Mole-vs-
              `vitest related` comparison) and reused it for run-all, whose own selection (the full suite) has
              no sensible ratio against "reach" that means "% of the suite". The standard RTS literature
              (Rothermel & Harrold 1996; Ekstazi ISSTA 2015; STARTS ASE 2017 -- 4 log/prior-art.md) always
              expresses selection size as selected/FULL SUITE, under which run-all is 100% by construction.
fix           packages/verify/bench: extracted m14-summary.ts (new, pure, unit-tested) computing BOTH numbers
              under their own names: "selection size % of the full suite" (standard RTS metric) and "share of
              reach" (Mole's own secondary comparison, explicitly labelled "not a suite share"). m14.ts now
              calls it; packages/bench/h2h.ts's H2 row now reads suite/reach totals straight from the frozen,
              read-only m14-key.json (R2: never edited) instead of re-using the reach-relative ratio for
              run-all. Bench-only change; packages/verify/src (the product: selectTests/runTests/testmap) is
              untouched -- the selector itself was never wrong, only the scoreboard's arithmetic/prose.
```

## Numbers: old vs new (both from the same frozen, committed inputs)

```notes
metric                         old (buggy)                      new (corrected)                 source
run-all selection size         1347.5% "of the suite"           100.0% of the suite (trivial)    definitional
run-none selection size        0.0% (already correct)           0.0% of the suite (trivial)      definitional
Mole selection size (aggregate) not reported                     1.2% of the suite (163/14,065)   m14-key.json fullSuiteTests
                                                                                                    sum + frozen runs.jsonl aggregate ran (163)
Mole share of reach (mean)     18.5% (correct under its own,     18.5% (unchanged; now explicitly  m14-key.json / frozen runs.jsonl
                                non-standard, reach-relative      labelled "not a suite share")    (unchanged input, relabelled only)
                                definition -- kept, relabelled)
reach baseline's own share      not reported                     86.4% of the suite in aggregate   m14-key.json (12159/14065) --
of the suite                                                     (12,159/14,065)                   shows `vitest related` is a weak
                                                                                                      filter on Excalidraw (near-whole-suite)
caught (regression-level recall) 10/10                           10/10 (unchanged)                 frozen runs.jsonl
```

## Why the new numbers are right, and what they mean

```notes
1  run-all's true selection-size is 100% of the suite by definition (it runs every test) -- there is nothing to
   measure here; the old 1347.5% was comparing the full suite against a SUBSET of itself (reach) and mislabelling
   the result as "% of the suite", which no number drawn from reach/suite ratios can structurally be once
   reach < suite (true for every one of the 10 frozen rows, by between 1.02x and 60.3x).
2  Mole's real contribution, stated in the standard RTS vocabulary the task asked for: selection size 1.2% of
   the full suite in aggregate (163 of 14,065 tests across the 10 regressions), while catching the same 10/10
   regressions run-all catches. That is the number comparable to Ekstazi's "e%" (5-38% selected, Table 4) and
   STARTS's 35.2% average selection -- Mole's 1.2% aggregate is far smaller than either, on this 10-regression
   sample (not a claim that Mole beats Ekstazi/STARTS in general; different corpora, no apples-to-apples run).
3  the reach baseline's own "% of the suite" (86.4% aggregate) is new and useful on its own: it shows
   `vitest related` barely filters anything on Excalidraw (module graph pulls in most of the 2,632-test suite
   for 4 of 5 Excalidraw rows), so Mole's 18.5%-of-reach number is a real, non-trivial selection on top of an
   already-weak baseline, not just restating the baseline.
```

## Safety / inclusiveness (recall of tests that fail) -- what is and isn't reproducible here

```notes
regression-level recall  10/10 (unchanged, frozen): Mole's selection included AND ran >=1 ground-truth-failing
    test for every one of the 10 frozen regressions. This is the metric already tracked as "caught".
test-level inclusiveness  NOT RUN here (honestly): true RTS inclusiveness (Rothermel & Harrold 4.1) is
    PER-REGRESSION recall of ALL ground-truth-failing tests, not just >=1. The per-regression `caughtBy` counts
    that would give this live in .mole/local/bench/m14-details.json, which is gitignored (never committed) --
    recomputing it needs a live run of packages/verify/bench/m14.ts against the Mole worktree checkout and the
    Excalidraw copy at the paths in packages/verify/bench/README.md (~/.hermes/cache/scratch/mole-builder-5/...),
    neither of which exists in this sandboxed worktree (no network to clone Excalidraw, no pre-made checkout).
    Stop condition honored: no number from that live run is reported here.
reach baseline's own ceiling  IS reproducible from the committed m14-key.json alone: per-row
    failingInReach/failing.length. Mean over the 10 frozen rows = 88.7% -- i.e. the `vitest related` reach set
    itself misses 11.3% of ground-truth-failing tests on average, and misses 4 of 5 on row m11 specifically
    (failingInReach 1, failing.length 5) -- `vitest related` alone would be UNSAFE for that regression; any
    selector built strictly on top of reach inherits that gap. Mole still caught m11 (one of the 3 reach tests
    is the one reachable failing test), but this is a real, previously-unreported limit of the reach baseline.
end-to-end time  NOT RUN: the frozen m14-key.json records test COUNTS (fullSuiteTests, reach.tests), not wall
    time, for the full-suite runs; per-regression select/run timings for a live Mole run are in the same
    gitignored, non-committed details file as above. No time-saved number is reported; the selection-size %
    reduction (163/14,065) stands in as the literature's own proxy when selected/skipped tests have roughly
    uniform cost (Ekstazi ISSTA 2015 §1 explicitly warns this proxy can diverge from measured end-to-end time).
```

## Verification

```notes
red       4 log/red.txt: packages/bench/test/h2-suite-share.test.ts failed against the (then-unfixed) committed
          scoreboard.json, exactly reproducing D52's "1347.5% of the suite" claim as a test failure.
green     same test + packages/verify/test/m14-summary.test.ts pass after the fix; full `npx vitest run
          packages/bench packages/verify` = 27/27 passed; `npx tsc -b` clean; `node packages/daemon/dist/cli.js
          rules --root .` = 0 violations.
reproduction  every corrected number above is derived purely from arithmetic over two committed, read-only
          inputs: packages/verify/bench/keys/m14-key.json (fullSuiteTests, reach.tests, failing, failingInReach
          per frozen row) and the frozen tasks/T22-hand-back-test-selection/4 log/runs.jsonl's last M14 line
          (aggregate ran=163, aggregate reach=12159) -- no live bench run, no network, no scratch checkout.
          packages/bench/h2h.ts and packages/verify/bench/m14.ts were re-run (node packages/bench/dist/h2h.js)
          to regenerate tasks/T41-head-to-head-benchmarks/4 log/scoreboard.{json,md} from those same frozen
          inputs; that script does not invoke the live multi-repo m14.js bench, so nothing beyond committed
          data is required to reproduce the new H2 row.
```
