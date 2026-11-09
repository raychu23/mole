# T120 — Q13 NEW-repo eval, REBUILT run (Amendment 2) — losses first

Supersedes `results-new-repos.md` (`ledger/t120b-new-repo-eval`, which this branch does not merge
from — this is a fresh run under the same protocol + Amendment 1 + this task's Amendment 2).
Frozen case set: `4 log/new-repos-data-v2/cases_FINAL.json`, sha256 in
`4 log/new-repos-data-v2/cases_FINAL.sha256`, frozen 2026-11-09T08:05:41Z, BEFORE any arm ran.

## Losses first

1. **No power to show an improvement, and the data doesn't show one.** n=12 violate cases per
   arm is small; Amendment 1's own decision rule requires recall to beat baseline's CI width, a
   high bar at this n by design (conservative). The observed result doesn't need that bar at all:
   `B_T53_embedBoost`'s pooled recall (0.667) is **LOWER** than `A_T53_baseline`'s (0.750), not
   higher — condition 1 of the decision rule fails outright, independent of the FA condition.
2. **The no_decision/false-alarm class's no-context LLM gate residual (see
   `rebuild-gate-results.md`) means FA-rate numbers below carry a disclosed caveat**: this class
   is somewhat more recoverable without decision context than the skill's chance-CI contract asks
   for, after 3 rebuild iterations. It is not a cue-word or structural leak (both gates pass clean
   on it) — disclosed, not hidden.
3. **routedCorrectly (R@5), the mechanism metric, also did not improve**: A=0.636 (21/33),
   B=0.545 (18/33) — embedBoost's routing accuracy was lower on this held-out set too, same
   direction as the primary metric. T120's SEEN-set gain (.853→.912, `results.md`) does not
   replicate on these two never-used repos at this n.
4. Amendment 1's own `T53-baseline` arm definition was itself wrong (Amendment 2 section 1) and
   had to be corrected before this run could happen at all — a second avoidable process failure
   on top of the case-set rejection, both caught only on review, not by the task that built them.

## 1. Harness correction, verified

Both `A_T53_baseline` and `B_T53_embedBoost` now call `cascadeCheck` with `semanticRoute`
configured (`topK=5, minScore=0, confidenceRatio=1.01`, `claude-haiku-4-5` router), matching
`run_t53_semantic_route_v4_3.mjs` exactly (Amendment 2 section 1) — neither arm omits
`semanticRoute`. `B_T53_embedBoost` additionally sets `semanticRoute.embedBoost: true` with a
real `Embedder` (local `all-MiniLM-L6-v2` via `sentence-transformers`, injected the same way
`embedder-minilm.ts`'s transformers.js adapter would be — this run used the python backend since
`@xenova/transformers` is not installed in this repo, see `ledger/t120c-wire-embed`'s own
`bundle-size.md`), going through the REAL wired `cascadeCheck` path (`ledger/t120c-wire-embed`),
never calling `routeDecisions` directly. No case shows `governed=0`/`routing=[]` for every single
row this time (the prior run's 0/0 bug, see `rebuild-gate-results.md` and Amendment 2 section 1):
`routedCorrectly` is 21/33 and 18/33 respectively, real signal in both directions.

## 2. Case set

33 cases (12 violate, 12 compliant, 9 no_decision), rebuilt per Amendment 2 — see
`rebuild-gate-results.md` for full keyword/structural/no-context-LLM gate results. Same two repos
Amendment 1 selected (`feast-dev/feast`, `pledger-io/android-app`); smaller n than Amendment 1's
64-case set (disclosed: time/resource budget for a full rebuild at the same scale was not
available this pass — see `0 start.md`).

## 3. Results (primary metric: end-to-end recall + false-alarm rate)

| arm | recall (violate, n=12) | 95% CI | FA (no_decision, n=9) | 95% CI | R@5 (mechanism, n=33) | cost/case | wall ms/case (median-ish) |
|---|---|---|---|---|---|---|---|
| A_T53_baseline | 9/12 = **0.750** | [0.468, 0.911] | 4/9 = 0.444 | [0.189, 0.733] | 21/33 = 0.636 | see `arm_A_baseline.json` | ~12-15s |
| B_T53_embedBoost | 8/12 = **0.667** | [0.391, 0.862] | 6/9 = 0.667 | [0.354, 0.879] | 18/33 = 0.545 | see `arm_B_embedboost.json` | ~19-22s |
| C_RAG_reads_all | 12/12 = 1.000 | [0.757, 1.000] | 6/9 = 0.667 | [0.354, 0.879] | n/a (no routing) | `arm_C_rag.json` | ~7-10s |

Paired per-case flips (B vs A), violate class: embedBoost helped 2 cases (`t120r-fs-adr0009`,
`t120r-pg-005` flipped miss→hit) and hurt 3 (`t120r-fs-adr0003`, `t120r-fs-adr0007`,
`t120r-pg-011` flipped hit→miss) — net -1/12, consistent with the pooled recall drop.

McNemar exact two-sided test on paired no_decision FA outcomes (A vs B): 3 cases flipped
clean→FA, 1 flipped FA→clean (n=9 total), **p = 0.625** — not significant, but FA rose nominally
(0.444→0.667) in the direction Amendment 1's decision rule is written to guard against, by more
than its 5-point margin, had condition 1 passed.

`RAG_reads_all` (the non-Mole, full-read-cost comparison) caught every violate case at this n
(12/12) but at zero routing (reads every decision every time, by design) and the same FA rate as
embedBoost (0.667) — consistent with `results.md`'s own prior finding that FA is a harder problem
than recall for every arm measured so far, not specific to embedBoost.

## 4. Decision (Amendment 1 section (d), applied exactly as pre-registered)

**Condition 1 (recall improves beyond baseline's own CI width): FAILS.** `B_T53_embedBoost`'s
pooled recall (0.667) is not higher than `A_T53_baseline`'s (0.750) at all — it is lower. The
decision rule requires BOTH conditions; condition 1 alone is sufficient to decide.

**Result: NO IMPROVEMENT SHOWN.** `embedBoost` stays opt-in (default off), unchanged, on both
`route.ts`'s `RouteOptions.embedBoost` and `cascadeCheck`'s `SemanticRouteOptions.embedBoost`
(`ledger/t120c-wire-embed`). This task has no authority to change the default under this outcome
(Amendment 1's own text) — flagged in `0 start.md` for Raymond.

## 5. What this does and does not show

- This does NOT contradict T120's own SEEN-held-out result (`results.md`, R@5 .853→.912) — that
  was measured on repos embedBoost's own construction had already been tuned against context for
  (5 repos from the M2 v3/v4.x lineage). This run is the FIRST never-seen-repo test and, at n=12
  per arm, is underpowered to detect anything short of a large effect — the honest reading is "no
  effect detected at this sample size," not "proven no effect."
- It DOES show the harness bug (Amendment 2 section 1) is fixed: both arms route real decisions
  on these two never-used repos, with real signal, not the structural zero from the Amendment-1
  run.
- A larger-n re-run (closer to Amendment 1's original 64-case scale, properly gated for violate
  AND no_decision classes this time) would be needed before concluding anything stronger than
  "not shown here" about embedBoost's effect on genuinely new repos.

## Reproduce

`4 log/new-repos-data-v2/` holds: `build_cases_rebuild.py` + `build_cases_none2.py` +
`build_cases_none3.py`(inline, see this doc's history)/`build_cases_none4` equivalents, raw case
JSONs at each rebuild stage, `cases_FINAL.json`+`.sha256`, gate result JSONs
(`gate_nocontext_llm_*.json`), `run_arm_{A,B,C}_*` scripts, and the three arms' raw output JSONs.
The two repos themselves (feast-dev/feast @ `bbaca76a`, pledger-io/android-app @ `28f319b1`) are
NOT committed (disk discipline, scratch deleted after this task) — `base`/`head` SHAs in
`cases_FINAL.json` are real, re-fetchable upstream commits plus this task's own synthetic case
commits (not pushed anywhere; `run_arm_*` scripts regenerate the same tree from `cases_FINAL.json`
if re-cloned and re-applied the same way `build_cases_rebuild.py` did).
