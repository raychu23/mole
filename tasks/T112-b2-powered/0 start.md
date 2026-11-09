# T112-b2-powered (Q6) -- B2 v4.2a: fixes to v4.2's review FAIL (blind re-adjudication + write-up corrections)

**Goal:** per queue brief Q6 + the fresh-reviewer FAIL on v4.2 (`/Users/a1/.hermes/cache/delegation/
live/deleg_b94d7cd2/task-0.log`): re-adjudicate the 7 labeler-disagreement cases blind (third model,
no constructor intent, no arm outputs), re-score all 5 arms from v4.2's EXISTING raw run outputs (no
re-runs) under both label sets, and fix 4 write-up defects (ADR count, final label mix, the
`v42-claw-0005-compliant` flip narration, the structural-stump "lucky" framing, T53's routing-failure
disclosure, and the closing summary's one-sided framing). v4.2's own files are kept untouched; all new
work is v4.2a/, a new subdirectory.

**Done-when:** 7 disagreement cases re-adjudicated by a fresh `claude-sonnet-5` (`hermes -z --safe-mode`)
given ONLY the literal ADR text + diff + written rule (blind to constructor intent, blind to every
arm's output), each required to quote the ADR sentence relied on; new labels frozen by sha256 BEFORE
re-scoring; T53/RAG re-scored from the existing raw run files under both the original and reaudited
label sets; primary McNemar (false alarms) reported under both; write-up states 16 ADRs, final mix
17/15/28, narrates the `v42-claw-0005-compliant` flip, discloses the structural stump predicts
violate on 59/60 cases (uninformative, not "lucky"), states T53's 4 original misses are all routing
failures (`routedCorrectly=false`), and states the recall trade-off plainly alongside the false-alarm
result.

**Status:** DONE.
- Blind re-adjudication: 5 of 7 disagreement cases flipped label under the blind third-model check
  (4 compliant->violate, 1 violate->compliant; 2 unchanged). Frozen BEFORE re-scoring:
  `v4.2a/frozen_v42a_reaudit.sha256` (verifies).
- Re-scored from `run/*.json` (no re-runs). Primary McNemar (false alarms, T53 vs RAG): label set A
  (v4.2 original) n=43, b=0, c=8, p=0.0078 (reproduces v4.2's own number exactly); label set B
  (v4.2a reaudited) n=40, b=0, c=6, p=0.0313 -- both significant at alpha=0.05, gap narrows.
- Write-up fixes applied in `v4.2a/results-v4.2a.md`: 16 ADRs (not 17); v4.2's actual final label mix
  is 17/15/28 (not the pre-adjudication 16/16/28 `results-v4.2.md` reported); the
  `v42-claw-0005-compliant` flip is narrated (both labelers + the no-ADR-LLM gate check all read it as
  `violate` despite `compliant` constructor intent -- this single case explains 17/15/28 vs 16/16/28);
  the structural stump is shown to predict `violate` on 59/60 cases (a near-constant predictor, not a
  lucky per-class hit); T53's 4 original-label-set misses are confirmed `routedCorrectly=false` for
  all 4 (routing-layer failures, not judgment failures); the closing summary states the recall
  trade-off (T53 recall drops 0.765 -> 0.700 under reaudited labels, RAG holds at 1.000) next to the
  false-alarm result, not instead of it.
- v4.2's own files (`protocol_v4.2.md`, `results-v4.2.md`, `cases_with_labels_v4_2_new.json`,
  `arm_metrics_v4_2.json`, `mcnemar_v4_2.json`, etc.) are UNTOUCHED -- verified no writes landed
  outside `v4.2a/` during this fix.

All artifacts live in `context/product-plan/systems/metrics-proof/m2-conflict/v4.2/v4.2a/`
(gitignored, main checkout only, same convention as v3/v4/v4.1/v4.2). v4.2's own directory contents
are untouched; v4, v4.1 untouched.

**Next:** a full re-score of the reviewer/cascade/judge arms under the reaudited label set (only
T53/RAG were re-scored, since they are the primary test's pair); consider a second blind labeler for
the 7 reaudited cases to compute a blind-vs-blind kappa instead of relying on a single third-model
call per case.

See `4 log/v4.2a-review-fix.md` for the full evidence trail; `4 log/v4.2-new-heldout.md`,
`4 log/v4.1-review-fix.md`, `4 log/evidence.md` for v4.2/v4.1/v4's prior evidence trails, kept for
history.
