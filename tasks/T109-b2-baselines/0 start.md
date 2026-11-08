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

## status (2026-11-07) -- DONE
All 3 baselines run on the full 89 held-out cases, scored, written up. Headline: linter-only recall
3.5-5.9% (49-63% abstain, 0 false alarms), significantly worse than T53 (McNemar p<=0.0023, both views).
Reviewer+guidelines (CodeRabbit-style) recall 100% / precision 65.9% / FA 25% -- worse than v3's existing
RAG arm on the SAME decisions+diffs, and significantly worse than T53 (p=0.0063). Two-sided judge (single-
call stand-in on T53's routed candidates) recall 82.8% / precision 88.9% / FA 5.0%, not significant vs T53
(p=0.508) -- did not replicate Wealthfront's reported effect. Full numbers + losses:
`context/.../m2-conflict/v3/results-v3-baselines.md` (copy in this task's `4 log/`).

## next
None for this task. Follow-ons for later queue items: Q6 (T112-b2-powered) could add the best-scoring new
variant (two-sided judge) as a 5th arm in a powered rerun, per the queue brief's Q6 goal.

## boundary
Only context/product-plan/systems/metrics-proof/m2-conflict/v3/ (new baselines/ subfolder) + this task
folder. Never touch results.md/results.json/cases_with_labels_v3.json/frozen.sha256 (frozen v3 artifacts).
No packages/ code change -- this is benchmark scripting, same convention as v3's own build/run scripts
(which also live under context/, gitignored, not packages/).
