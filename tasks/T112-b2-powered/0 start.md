# T112-b2-powered (Q6) -- B2 v4.2: strengthened leakage gate + 60 NEW never-seen held-out cases

**Goal:** per queue brief Q6 (revised 11-08) + the fresh-reviewer FAIL on v4.1 (per-class leak: no-ADR
LLM scored 7/9=0.778 on `no_decision` alone, pooled 0.310 hid it; 3 held-out distractors were
brand-new files like every violate/compliant case). Strengthen the gate BEFORE building (per-class
accuracy within each class's own chance CI + a structural-feature classifier trained on v4.1/scored on
new held-out + a repo+path-aware no-ADR LLM), build a brand-new held-out set from the ~18 previously
untouched real ADRs so the primary result is on never-seen cases, fix v4.1's 3 miscoded distractors in
a corrected copy (secondary, "seen before"), then label/gate/freeze/run once.

**Done-when:** gate strengthened and pre-registered BEFORE any case was built; >=60 NEW held-out cases
built, mixing new-file/edit-existing shapes across violate/compliant/no_decision (not just the
no_decision bucket); labeled (2 models) + adjudicated + frozen 3x by sha256; 5 arms run once; primary
McNemar (false alarms, T53 vs RAG) on the NEW held-out only, pre-registered; v4.1's 3 defective
distractors fixed and reported secondary; results-v4.2.md reports losses first.

**Status:** DONE.
- Gate: 2/3 checks (keyword classifier; no-ADR LLM with repo+path) pass cleanly, per class. Check 2
  (structural classifier trained on v4.1, scored on new held-out) is MIXED: pooled accuracy stays
  below majority, but a weak (43.9% train-accuracy) stump lands a lucky 16/16 hit on `violate` alone --
  reported, not hidden, and traced to v4.1's own training-data confound, not v4.2's construction.
- Built 60 new held-out cases (17 ADRs' violate/compliant pairs + 28 no_decision distractors), all
  never seen in v3/v4/v4.1. violate/compliant are each exactly 50.0% new-file (no confound between
  those two classes); no_decision sits at 35.7% new-file (narrowed from v4.1's 100%-vs-33% gap, not
  fully closed -- stated as a loss).
- Labeled (opus/haiku), kappa 0.765, adjudicated, frozen 3x (frozen_raw/final/run_v4_2.sha256, all
  verify).
- 5 arms run once. **Primary McNemar (false alarms, T53 vs RAG, n_nonviolate=43): b=0, c=8, p=0.0078 --
  significant.** T46 cascade loses badly on this round (0/17 recall on violate). Optional pooled
  analysis (v4.1 SEEN 42 + v4.2 UNSEEN 60): p=0.000244 -- NOT the primary result (mixes seen/unseen).
- v4.1's v4-none-3/4/5 fixed in `v4_1_corrected/cases_v4_1_corrected.json` (real pre-existing files now
  targeted, no longer silently new-file) -- reported secondary, does not change v4.1's frozen arm runs.
- n (60) still below the task's full >=175 / v3's 155-175 power band -- hand-authoring time, not call
  budget, bound this round, same posture as v4/v4.1.

All artifacts live in `context/product-plan/systems/metrics-proof/m2-conflict/v4.2/` (gitignored, main
checkout only, same convention as v3/v4/v4.1 -- this task folder is the git-tracked summary +
pointers). v4 and v4.1's own directories are untouched.

**Next:** grow the held-out set using claw-operator ADR-0004/0020 (held back this round) and close the
no_decision file-mode gap further (currently 35.7% vs violate/compliant's 50.0%); fix v4.1's broader
new-file confound at the source (not just the 3 distractors) so check 2's structural-classifier gate
stops landing lucky per-class hits trained on it.

See `4 log/v4.2-new-heldout.md` for the full evidence trail; `4 log/v4.1-review-fix.md` and
`4 log/evidence.md` for v4/v4.1's prior evidence trails, kept for history.
