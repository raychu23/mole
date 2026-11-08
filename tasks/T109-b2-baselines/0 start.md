# T109-b2-baselines

## goal
Add B2's missing baselines on the v3 held-out 89 (descriptive addition to the already-frozen, already-run
v3 set; labels unchanged): (a) linter-only arm, (b) "reviewer + team guidelines" arm (CodeRabbit-style),
(c) two-sided-judge Mole variant on T53's routed 1-3 decisions. Same scoring code as v3 (Wilson CIs,
McNemar vs T53). Write results-v3-baselines.md next to results.md. Source: queue/brief.md Q2, D92,
`19 Can it stand up.md` fix 3.

## done-when
- `arm_linter_heldout_v3.json`, `arm_guidelines_heldout_v3.json`, `arm_judge_heldout_v3.json` exist in
  `context/.../m2-conflict/v3/baselines/`, one row per held-out case (89) or an explicit abstain.
- `score_baselines_v3.py` computes recall/precision/false-alarm (Wilson 95% CI), cost, latency per arm and
  McNemar exact vs T53 for each new arm, reusing v3's verified Wilson formula.
- `results-v3-baselines.md` written next to `results.md`, losses first, citing file + line for every number.

## status (2026-11-08) -- DONE, review fix applied
Review deleg_ebac273d task 1 FAILED the first version (F1 HIGH: the grep-over-ADR-prose linter alone was a
strawman for "why not a linter?"; F2: the judge section needed its framing retitled). Fix: added a 4th arm,
Mole's OWN T46 compile-at-capture + zero-LLM cascade (`packages/decisions/src/compile`, `src/cascade`, not
reimplemented) -- one real hermes call per unique held-out ADR (31) drafts `match:` content-anchor patterns
offline/amortized, then those patterns are checked with ZERO model calls per case (same `c.re.test(line)`
logic cascade.ts/pr-check.ts use at check time). Result: recall 20.7-21.4%, precision 85.7%, false-alarm
1.7-3.4%, 100% decision coverage, one-time compile cost $0.7125/31 ADRs ($0.023 mean) then $0/check --
meaningfully better than the naive grep substitute (3.5-5.9% recall, 51% decision coverage) but STILL
significantly worse than T53 (McNemar p=0.0003-0.0005). The naive grep arm is kept, relabeled "naive
zero-model grep substitute" everywhere (not "linter-only"), as a human-reaches-for-grep floor, not Mole's
own answer. The judge section is retitled "not tested as published: a single-call stand-in did not show the
effect" (F2). Reviewer+guidelines (CodeRabbit-style) recall 100% / precision 65.9% / FA 25% -- worse than
v3's existing RAG arm on the SAME decisions+diffs, and significantly worse than T53 (p=0.0063). Full
numbers + losses: `context/.../m2-conflict/v3/results-v3-baselines.md` (copy in this task's `4 log/`).

## next
None for this task. Follow-ons for later queue items: Q6 (T112-b2-powered) could add the best-scoring new
variant (two-sided judge) as a 5th arm in a powered rerun, per the queue brief's Q6 goal.

## boundary
Only context/product-plan/systems/metrics-proof/m2-conflict/v3/ (new baselines/ subfolder) + this task
folder. Never touch results.md/results.json/cases_with_labels_v3.json/frozen.sha256 (frozen v3 artifacts).
No packages/ code change -- this is benchmark scripting, same convention as v3's own build/run scripts
(which also live under context/, gitignored, not packages/).
