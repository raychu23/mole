# T114 — decision staleness D86 support sets: test 1 rerun on new repos

goal: D86 says decision staleness should flag only when a decision's support set changes in a
way that matters, not on every change. Rerun the existing "test 1" comment-staleness bench
(the closest already-built proxy for support-set checking: `methodCompilerSignals` flags on
param-type/return-type/return-shape/throw-set/identifier-removed changes, the comment-level
analogue of a support set) on TWO NEW TypeScript repos never used in the original run
(es-toolkit, remeda), frozen and run once, no tuning. Report precision/F1 vs flag-every-change
and vs OVERLAP's published bar (68.0), losses first.

done-when: mined + labeled dataset from 2 new repos, split/key frozen before eval (sha256
proof), eval run once with the byte-identical frozen method, results written with losses
first, evidence paths recorded.

status: DONE (this task). See `4 log/results-new-repos.md` for the full write-up,
`4 log/prior-art.md` for sources.

headline (see full file for caveats): on a properly powered, balanced set (n=498, all 3
comment types had enough positives this time), the support-set method (D86's design)
significantly beats flag-every-change on F1 (71.7% vs 66.7%, McNemar chi2=43.1, p<0.0001) and
beats this reimplementation's OVERLAP baseline (43.3%, chi2=12.4 vs support-set, p=0.0004).
The original xstate-only run's "no method beats flag-every-change" finding was an artifact of
a small (n=36), degenerate (recall forced to 100%) balanced set, not the general case.
Precision (65.0%) and recall (79.9%) are still well short of the paper's LLM-based numbers
(CARL-CCI F1 93.4) — a real, measured improvement over flag-every-change, not a solved
problem.

next: not run — (1) a 3rd/4th repo to check whether es-toolkit/remeda's style (lodash/ramda-
like pure functions, heavy param/return docs) is why density + signal quality were both higher
than date-fns/xstate; (2) extending the support-set signals from comment-level syntactic
checks to actual Mole decision records (this task reused the comment-bench proxy, not a live
`.mole/decisions` support-set re-check against a real decision corpus); (3) OVERLAP on the
full doc comment rather than the aligned segment (flagged as a next step in the original
report too, still not done).
