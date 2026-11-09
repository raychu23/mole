# T112b-b2-grow (Q6b) -- grow B2 to >=155 never-seen held-out cases (v4.3)

**Goal:** per queue brief Q6b: grow B2 (v4.2/v4.2a, 60 held-out cases) to >=155 never-seen held-out
cases using 3-6 NEW public repos (>=10 real ADRs each, not used in v1-v4.2), >=95 new held-out cases,
pre-registering the pool-vs-standalone design AND a power analysis from v4.2's observed discordance in
`protocol_v4.3.md` BEFORE building. Then: pass the leak gate, label, blind re-adjudicate disputes
(Decision-Outcome-only instruction), freeze, run T53 (frozen params, flags off)/RAG/reviewer/judge once,
report McNemar (false alarms, T53 vs RAG, primary) and recall difference with Wilson CIs (co-primary),
losses first.

**Done-when:** >=95 new held-out cases built from the 4 selected repos, gated, labeled, disputes blind
re-adjudicated, frozen by sha256, all 4 arms run once each, pooled-or-standalone McNemar + Wilson CIs
reported per the pre-registered design, write-up states losses first.

**Status:** DONE. 124 new held-out cases (55 Part A + 69 Part B, >=95 target met) built, combined
leakage-gated (all 3 checks + 2 task-specific build-fix cue checks pass), dual-labeled (opus+haiku,
kappa 0.81), 8 disputed cases blind-reaudited (1 flip), frozen, all 4 arms (T53/RAG/Reviewer/Judge)
run once on all 124, standalone + 2 pooled McNemar readings computed, per-repo breakdown and T53
miss-mechanism reported. Full write-up: `4 log/results-v4.3.md`.

**CORRECTION 2026-11-08:** loss #2's T53 harness id-matching bug (email-alert-api only, 10/10
adr-bearing cases match-impossible) audited across all 13 repos ever scored (only email-alert-api
affected; semantic-kernel's separate 0.375 recall confirmed a routing issue, not this bug) and
fixed (`run/adr_id_normalize.mjs` + 15 unit tests), then re-scored on just the 10 affected cases
with frozen params. email-alert-api T53 recall 0.000 -> 0.857; overall T53 recall 0.513 -> 0.667;
neither pooled McNemar significance verdict flips. Original numbers kept, not overwritten; see
`4 log/results-v4.3.md`'s dated CORRECTION section and `4 log/id-matching-audit.md`.

## Headline result (losses first -- see `4 log/results-v4.3.md` for full detail)

- Standalone v4.3 primary (McNemar, FA, T53 vs RAG, this round's 124 cases only) is **NOT
  significant** (p=0.143, n_nonviolate=85). Pooled with v4.2 original labels it IS significant
  (p=0.004, n_nonviolate=128); pooled with v4.2a's reaudited labels also significant (p=0.011,
  n_nonviolate=125). Both reported, standalone is NOT suppressed in favor of the pooled number.
- T53's recall fell sharply on the 4 new repos (0.513 vs v4.2's 0.765), driven mostly by the
  semantic router never finding the governing decision (17/19 misses routedCorrectly=False), not
  judgment error once routed. `email-alert-api` (0/7 T53 recall) is additionally confounded by an
  id-normalization mismatch between this repo's `adr-NNN-*.md` filenames and the arm runner's
  (v4.2-inherited, unmodified this round) id-matching logic -- disclosed, not patched.
- Power: pooled n_nonviolate=128 clears the pre-registered OPTIMISTIC target (~40-50) by 2.6-3.2x
  but remains well short (37.6%) of the pre-registered CONSERVATIVE target (~340). Both stated.
- Blind reaudit fix applied and verified: the third reader is now explicitly told (twice) to judge
  ONLY against the ADR's accepted Decision Outcome/Decision section, never a Considered
  Options/Rejected Alternatives section -- v4.2a's reaudit had no such constraint. 1/8 disputed
  cases flipped under the fixed reaudit.

## What was done this session (continuing from the PARTIAL state left by the build sessions)

1. Merged `cases_v4_3_part_A_raw.json` (55) + `cases_v4_3_part_B_raw.json` (69) -> 124, no id
   collisions, repo split content-publisher 44/semantic-kernel 29/jaeger 26/email-alert-api 25.
2. Combined leak gate (`leakage_gate_v4_3_combined.py`): keyword, structural (trained on v4.2),
   no-ADR LLM (path+repo), all per-class, all PASS. Added the two task-specific build-fix cue
   checks (the "read from"/"derived from" phrase added to 12 Part A distractors; the
   `require("json")` injected into ~half of Part B's 61 `.rb` cases) -- neither is separable by
   class. Froze (`frozen_raw_v4_3.sha256`).
3. Dual-labeled all 124 (opus+haiku, 248 calls, `labeler_v4_3.py`), adjudicated
   (`adjudicate_v4_3.py`, same 3-step rule as v4.2), 8 disputes -> blind third-reader reaudit
   (`reaudit_blind_v4_3.py`, FIXES v4.2a's reaudit flaw per this task's instruction: explicit,
   doubled instruction to judge only the accepted Decision Outcome/Decision section, never
   Considered Options/Rejected Alternatives). 1/8 flipped. Froze (`frozen_final_v4_3.sha256`).
4. Re-cloned the 2 repos whose Part-A build clones had already been deleted
   (`microsoft/semantic-kernel`, `jaegertracing/jaeger`) and reused Part B's surviving clones
   (`content-publisher`, `email-alert-api`); verified every repo's current HEAD matches the
   recorded shared `base` SHA. Reconstructed each case's `head` commit
   (`reconstruct_commits_v4_3.py`, disclosed as a loss) since the original synthetic head commits
   were local-only and deleted with the Part-A clones.
5. Ran T53 (frozen k5/m0/c1.01/haiku-router params, flags off), RAG, Reviewer, Judge once each on
   all 124 cases (`run/run_t53_semantic_route_v4_3.mjs`, `run/run_arms_v4_3.py`,
   `baselines/run_judge_arm_v4_3.py`). Froze (`frozen_run_v4_3.sha256`).
6. Computed stats (`analysis_v4_3.py`): standalone + 2 pooled McNemar readings, recall diff with
   Wilson CIs + paired test, per-repo breakdown, T53 miss mechanism via `routedCorrectly`.
7. Wrote `4 log/results-v4.3.md` (losses first, both McNemar/recall numbers equally plain, power
   shortfall vs conservative n~340 stated).

See `4 log/prior-art.md`, `4 log/build-part-A.md`, `4 log/build-part-B.md` for the repo-selection
and case-build history that preceded this session.
