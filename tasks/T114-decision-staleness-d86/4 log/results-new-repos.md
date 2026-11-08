# Test 1 rerun on NEW TypeScript repos — results (D86 support-set method)

Protocol/freeze order (verifiable): mine both repos → build labeled dataset → freeze
split+key+sha256 of `methods.cjs` (`data/methods.cjs.sha256_frozen_before_eval`) → run eval
once → re-hash `methods.cjs` after (`data/methods.cjs.sha256_frozen_after_eval`) — both
hashes are `e9cec5a8...778623`, identical to the original 2026-11-01 frozen file
(`data/methods.cjs.sha256_frozen_before_test` in the original bench dir). **No tuning
happened between freeze and eval, and no tuning happened on this new data at all** — the
method under test was designed on date-fns in a prior task and is applied here unchanged.

## Losses first

- **Still far below the model-based SOTA**: compiler-signals F1 71.7% vs the paper's
  CARL-CCI (LLM-based) 93.4% on its own Java task — this is a zero-model rule, not a claim
  of matching a trained model.
- **Precision is still mediocre**: 65.0% (CI 59.5–70.2) — about 1 in 3 flags is still a false
  alarm, so "flags only when it matters" is a large improvement over "flags everything" (50%
  precision by construction) but not a solved problem.
- **Recall is not 100%**: 79.9% (CI 74.5–84.4) — the support-set signals (param type/return
  type/return shape/throw-set/identifier-removed) miss about 1 in 5 real comment-invalidating
  changes, mostly cases where behavior changed without any of those 5 syntactic signals moving
  (e.g., a changed constant, a reordered branch with the same types).
- **Per-type split is uneven**: `param` (n=324, the biggest slice) is the weakest type for
  compiler-signals (F1 68.7, barely above the Java OVERLAP bar of 68.0, and the type where
  precision is lowest at 62.3%); `summary` is the strongest (F1 80.8).
- **Not a replication of the paper's own OVERLAP number**: our `OVERLAP` reimplementation
  scores F1 43.3 overall here (down from 61.9/63.3 on summary/returns but only 31.3 on param),
  still well under the paper's published Java bar of 68.0 — same finding as the original xstate
  run, now confirmed on different repos: TS JSDoc prose does not reliably repeat identifiers
  from the deleted code the way the paper's Java comments do, so OVERLAP is not a fair stand-in
  for "the field's baseline" on this language. This is a reimplementation-on-TS gap, not a
  refutation of the paper.
- **Only 2 repos, both small/young-ish libraries** (es-toolkit: ~1900 commits since 2024;
  remeda: ~900 commits mined, full repo since 2018) — not a claim this generalizes to large,
  old, enterprise TS codebases.

## Headline result (test split = es-toolkit + remeda pooled, held out, run once, n=498,
balanced 1:1 per type — all 3 types had >=10 positives this time, unlike the original run)

```
method                    P      R      F1     95% CI (F1 point est.; P/R Wilson below)
flag-every-change (today) 50.0%  100.0%  66.7%  P:[45.6,54.4] R:[98.5,100.0]
OVERLAP (paper baseline)  64.8%   32.5%  43.3%  P:[56.1,72.6] R:[27.0,38.6]
Mole support-set signals  65.0%   79.9%  71.7%  P:[59.5,70.2] R:[74.5,84.4]
```

**This time the support-set method clearly beats flag-every-change on F1 (71.7 vs 66.7),
unlike the original xstate-only run where they tied (65.2 vs 66.7)** — the original tie was an
artifact of a small, unbalanced set where recall=100% forces F1=66.7 by construction; with
two more repos and a properly balanced-everywhere split (n=498 vs the original n=36 balanced),
the ceiling effect goes away and the precision gain (65.0% vs 50.0%) shows up in F1.

McNemar's test (paired per-example correctness, exact disagreement counts, continuity-corrected):
- support-set vs flag-every-change: b=142 (support-set right, flag-every-change wrong: the not-stale items it
  correctly leaves alone), c=50 (reverse: stale items it misses) → chi2=43.1, df=1, p<0.0001. **Statistically significant improvement.**
- support-set vs OVERLAP: b=145 (support-set right, OVERLAP wrong), c=90 (reverse) → chi2=12.4, p=0.0004. **Statistically significant.**

Against the field's published bar (OVERLAP 68.0, Java, Panthaplackel et al. AAAI 2021): the
support-set method's overall F1 (71.7) is above 68.0, but per-type it is only above on
`summary` (80.8) and `returns` (73.3); `param` (68.7) clears it by less than a point. Read
this as "comparable to the published bar on a harder, un-tuned-for-TS task", not "beats the
paper" — different language, different repos, and this reimplementation's own OVERLAP number
(43.3) does not hit 68.0 either, so the comparison is informative but not apples-to-apples.

## Per-type breakdown

```
type     n    flag-all F1   OVERLAP F1   support-set F1
summary  96   66.7          61.9         80.8
param    324  66.7          31.3         68.7
returns  78   66.7          63.3         73.3
```

## Timing (unchanged order of magnitude vs original run)

flag-every-change ~0.1us/check · OVERLAP ~95-1800us/check (LCS diff) · support-set
~33-45us/check (AST-level checks, no type-checker program) — per-check cost stays
negligible for all three on this data.

## Where this leaves D86 / the open question in "19 Can it stand up" fix 6

The original xstate-only result ("flags are precise today 7.1%... no method beats flag-every-
change on F1") does NOT generalize as the worst case — on two new, more densely-documented
repos with enough positives to balance every comment type, the support-set signals (D86's
design, applied here at the comment level) beat flag-every-change with a real, statistically
significant margin (F1 71.7 vs 66.7, p<0.0001) and comfortably beat the reimplemented OVERLAP
baseline (71.7 vs 43.3, p=0.0004). The headline from the original report ("no method beats
flag-every-change on F1, on balanced data") was correct for THAT data (n=36, recall forced to
100%) but was not the general case; it undersold the real precision gain support sets provide
once the dataset isn't degenerately small. Precision (65.0%) and recall (79.9%) still fall well
short of the paper's LLM-based numbers, so "ValidUntil for decisions" is a real, measured
improvement over flagging every change, not yet a precise/complete signal.

## Evidence paths

- raw mined pairs: `4 log/../data/es-toolkit.jsonl` (n=532), `data/remeda.jsonl` (n=58)
- labeled dataset: `data/new-repos.raw.jsonl` (n=2363 examples across 3 types, unbalanced)
- frozen split/key: `data/new-repos.examples.jsonl` (n=498, balanced), `data/new-repos.key.json`
  + `.sha256` (frozen before eval)
- method-freeze proof: `data/methods.cjs.sha256_frozen_before_eval` ==
  `data/methods.cjs.sha256_frozen_after_eval` == original bench's
  `.../test1-stale-comments/data/methods.cjs.sha256_frozen_before_test`
  (all three = `e9cec5a878b0c75ed71997e5bacf6ad9908beb35d1debb0e99aba8eef1778623`)
- raw eval output: `results/new-repos.results.json`, `results/new-repos.table.txt`
- mining stats: `data/es-toolkit.stats.json`, `data/remeda.stats.json`,
  `data/new-repos.raw.stats.json`

## Correction 11-08 (review deleg_8fe9bf23, reproduced by the reviewer)

```notes
natural base rate     the frozen eval set is BALANCED 1:1 (n=498); the natural pool (n=2,363) has ~10.5% stale comments
                      at that base rate:   flag-every-change P 10.5 / F1 19.1 · OVERLAP P 16.9 / F1 22.3 · support-set P 18.7 / F1 30.3
                      → the ranking holds (support-set best, larger relative margin), but the headline P 65.0 / F1 71.7 is a
                        property of the balanced set (~2.3x the deployment-rate F1); quote both
McNemar cells         b/c were swapped in the first version; fixed above (statistic unchanged: symmetric in |b-c|)
D86 context           D101 (11-04) already marked D86 step 1 DONE via B2; this rerun is the comment-level proxy test D86's own
                      text names ("beat flag-all F1 on test 1 rerun"), not a live .mole/decisions support-set check
```
