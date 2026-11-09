# M2 v4.3 results -- B2 grown to 124 never-seen held-out cases (4 new repos), pooled + standalone.
# Per protocol_v4.3.md (sha256 c319b166..., unedited).

```notes
status DONE (124 new cases built/gated/dual-labeled/blind-reaudited/frozen; T53/RAG/Reviewer/Judge
run once each; standalone + two pooled-with-v4.2 McNemar readings computed; both numbers reported
plainly per task instruction).
```

## Losses first

```notes
1. STANDALONE v4.3's own primary (McNemar, false alarms, T53 vs RAG, this round's 124 cases only)
   is NOT significant: n_nonviolate=85, b=5 (T53-only false alarms), c=12 (RAG-only false alarms),
   p=0.143. This is a real, disclosed reversal of v4.2's own standalone result (p=0.0078): on 4
   repos T53 has never seen before, T53 makes MORE false alarms on its own (5) than it did in all
   of v4.2 (0), and the gap to RAG's false-alarm count narrows sharply. Pooling with v4.2 (below)
   recovers significance, but the new round ALONE does not confirm v4.2's effect.
2. T53's RECALL dropped hard on the new repos: 0.513 [0.362, 0.661] vs v4.2's 0.765. On
   `email-alert-api` specifically T53 scored 0/7 recall (every true-violate case missed). Digging
   into why (not patched, reported as found): this repo's ADR files are named `adr-NNN-title.md`
   (e.g. `adr-006-email-delivery-responsibilities.md`), which `loadGraph`'s filename-derived id
   produces as `adr006`; the case's own id convention is `eaa-0006`, and the arm runner's id-match
   (`ourAdrNum = adr_id.split('-').pop()` -> `"0006"`) -- inherited UNCHANGED from v4.2's script
   per "frozen params" -- never equals `adr006`. For 5 of the 7 missed cases, T53's own semantic
   router DID surface the right decision in its routing list (e.g. `routing: ['adr009','adr006']`
   for `v43-eaa-0006-violate`) but the harness's exact-id lookup then failed to match it, so
   `predictedViolate` was scored False regardless of the escalation tier's actual verdict. This is
   a harness id-normalization gap specific to this one repo's filename convention, not evidence
   T53 cannot semantically route this repo's decisions at all -- but it is NOT fixed this round
   (frozen-params instruction forbids re-tuning mid-round) and it drags down T53's reported
   pooled/standalone recall and false-alarm numbers for real. A follow-up round should normalize
   ADR ids before re-running, not silently patch the frozen v4.3 numbers.
3. The blind third-reader reaudit flipped exactly 1 of 8 disputed cases (`v43-jg-006`, compliant ->
   violate) -- a real, small, disclosed correction, not zero and not large.
4. Power: even the BEST (pooled, v4.2-original-labels) reading reaches n_nonviolate=128 -- short of
   protocol_v4.3.md's own CONSERVATIVE target of ~340 (the Wilson-lower-bound reading of v4.2's
   original 8/8 discordant split). It clears the OPTIMISTIC point-estimate target (~40-50)
   comfortably. Both readings are restated in section 5 below, neither suppressed.
5. `email-alert-api`'s and `semantic-kernel`'s Part A/B build clones were deleted per the task's
   disk-discipline instruction before this round picked the task back up; the original synthetic
   `head` commits (local-only, never pushed) were lost with them. Fixed by re-deriving each case's
   head commit (`reconstruct_commits_v4_3.py`): checkout the shared, still-fetchable upstream
   `base` SHA (verified identical across a fresh `--depth 1` clone, `git rev-parse HEAD` match for
   all 4 repos), re-apply that case's own frozen `diff`, commit. The resulting tree is byte-
   identical to what produced the frozen diff; only the commit SHA differs. This is disclosed, not
   hidden, and `runtime_heads_v4_3.json` (not the frozen case file) carries the substitution.
```

## 1. Merge (124 cases, no id collisions)

Part A (`microsoft/semantic-kernel` + `jaegertracing/jaeger`, 55 cases) + Part B
(`alphagov/content-publisher` + `alphagov/email-alert-api`, 69 cases) merged into
`cases_v4_3_raw.json`. No id collisions (both parts verified unique before and after merge).
Label mix (constructor intent, pre-labeling): violate 34, compliant 34, no_decision 56.
Repo split: content-publisher 44, semantic-kernel 29, jaeger 26, email-alert-api 25.

## 2. Combined leakage gate on all 124 (`leakage_gate_v4_3_combined.py`/`.json`)

| check | result |
|---|---|
| 1. keyword classifier (fixed cue list), per-class | **PASS** -- 1/124 scored (99.2% abstain), the 1 scored case is wrong; `any_class_exceeds_chance=false` |
| 2. structural classifier, trained on v4.2's 60, scored on all 124 | **PASS** -- best train split `adds_import` (train acc 0.4667); per-class: violate 11/34=32.4% (CI 0.191-0.492), compliant 0/34=0% (CI 0-0.102), no_decision 33/56=58.9% (CI 0.459-0.708), bar (majority Wilson upper)=0.539, none exceeds; pooled accuracy 0.355 < majority 0.452 |
| 3. no-ADR LLM (haiku, path+repo only), per-class | **PASS** -- 121/124 scored; violate 7/34=20.6% (CI 0.104-0.368); compliant 5/34=14.7% (CI 0.065-0.301); no_decision 30/53=56.6% (CI 0.433-0.691, lower bound just under the 0.539 bar); none exceeds |
| build-fix cue 1: `read from`/`derived from` phrase (12 Part A distractors) | **NOT separable** -- no_decision rate 12.5% (CI 0.062-0.236), violate/compliant 0%, none exceeds majority bar |
| build-fix cue 2: `require("json")` in Part B's 61 `.rb` cases | **NOT separable** -- violate 47.1%, compliant 58.8%, no_decision 40.7%, all three within a few points of each other and none exceeds the `.rb`-subset majority bar |

Majority class `no_decision` at 45.16% (Wilson 95% CI 36.68-53.93%). **`gate_verdict_FINAL: true`**
(all 3 checks pass, neither build-fix cue is separable). Frozen: `frozen_raw_v4_3.sha256`.

## 3. Dual-label + adjudicate + blind reaudit (124 cases)

- Opus+haiku labeler (`labeler_v4_3.py`, same prompt as v4.2's `labeler_v4_2.py`, schema
  violate/compliant/not_applicable): percent agreement 87.9%, Cohen's kappa 0.810
  (`kappa_summary_v4_3.json`).
- Adjudication (`adjudicate_v4_3.py`, same 3-step rule as v4.2): 109/124 step1 (agree), 6/124
  step3 (file-scope non-NA wins), 1/124 step3 (file-scope NA wins), 8/124 step4
  (constructor-intent fallback -> fed to blind reaudit).
- Blind third-reader reaudit (`reaudit_blind_v4_3.py`) -- **fixes v4.2a's reaudit flaw**: the
  reader is now explicitly, twice, told the binding rule is ONLY the ADR's literal "Decision
  Outcome" (MADR) / "Decision" (Nygard) section, that any "Considered Options" / "Rejected
  Alternatives" section is background the team did NOT adopt and must never be quoted or relied
  on, and the required verbatim quote must come from the accepted section specifically (v4.2a's
  own reaudit had no such constraint and could, in principle, quote a rejected option as if it
  were the rule). All 8 reaudited cases' quotes verified by hand to come from an accepted
  Decision/Decision Outcome section, not a Considered-Options one. 1/8 flipped
  (`v43-jg-006-compliant`: compliant -> violate). Final label mix: violate 39, compliant 29,
  not_applicable 56 (`kappa_summary_v4_3_FINAL.json`).
- Frozen (`frozen_final_v4_3.sha256`): `cases_with_labels_v4_3_FINAL.json`, `labels_raw_v4_3.json`,
  `reaudit_v43_raw.json`, `adjudication_log_v4_3.json`, `kappa_summary_v4_3_FINAL.json`.

## 4. Arms (T53, RAG, Reviewer, Judge), run once each, frozen params, flags off

(positive = predictedViolate; truth = label_final=="violate"; Wilson 95% CIs; source:
`arm_metrics_v4_3.json`)

| arm | tp | fp | tn | fn | recall (CI) | false-alarm rate (CI) | accuracy (CI) |
|---|---|---|---|---|---|---|---|
| T53 (Mole, frozen params) | 20 | 8 | 77 | 19 | 0.513 [0.362, 0.661] | 0.094 [0.049, 0.175] | 0.782 [0.702, 0.846] |
| RAG (reads all) | 38 | 15 | 70 | 1 | 0.974 [0.868, 0.996] | 0.176 [0.110, 0.271] | 0.871 [0.801, 0.919] |
| Reviewer (oracle-given decision) | 38 | 8 | 77 | 1 | 0.974 [0.868, 0.996] | 0.094 [0.049, 0.175] | 0.927 [0.868, 0.961] |
| Judge (two-sided) | 37 | 8 | 77 | 2 | 0.949 [0.831, 0.986] | 0.094 [0.049, 0.175] | 0.919 [0.858, 0.956] |

Both halves of this result are stated equally plainly (per instruction): T53 is still the most
conservative arm on false alarms (0.094, tied with Reviewer/Judge, well below RAG's 0.176), but its
recall (0.513) is now the WORST of the 4 arms and well below RAG/Reviewer's ~0.97 -- a materially
larger recall gap than v4.2's 0.765-vs-1.0.

## 5. Primary: McNemar (exact, two-sided) on false alarms, T53 vs RAG

```
STANDALONE v4.3 (this round's 124 cases only):
  n_nonviolate = 85, b (T53-only FA) = 5, c (RAG-only FA) = 12, p_exact = 0.1435  -- NOT significant

POOLED with v4.2 ORIGINAL frozen labels (pre-registered primary pooling, protocol_v4.3.md sec. 3):
  n_nonviolate = 128 (43 v4.2 + 85 v4.3), b = 5, c = 20, p_exact = 0.00408  -- significant at a=.05

POOLED with v4.2a's REAUDITED labels ("B'", per this task's instruction):
  n_nonviolate = 125 (40 v4.2a + 85 v4.3), b = 5, c = 18, p_exact = 0.01062  -- significant at a=.05
```

Both pooled readings cross alpha=.05; the standalone v4.3-only reading does not. Reported together,
not cherry-picked: the pooled significance is driven mostly by v4.2's own discordance (c=8-6 of the
pooled c=18-20 comes from v4.2/v4.2a alone) plus this round's own c=12, with b staying small (5) in
both. v4.3 ADDS evidence in the same direction (T53 more conservative on false alarms than RAG) but
its own 124 cases, read alone, are not enough to clear significance by themselves.

## 6. Co-primary: recall difference (T53 vs RAG), Wilson CIs, paired test

```
T53 recall:  0.513 [0.362, 0.661]
RAG recall:  0.974 [0.868, 0.996]
difference (RAG - T53): 0.462

Paired test (McNemar-style, true-violate cases only, n=39):
  b (T53 hit, RAG miss) = 1
  c (RAG hit, T53 miss) = 19
  p_exact = 0.00004  -- significant
```

Reported with equal weight to section 5, per instruction ("both numbers equally plain"): RAG
recalls 19 true violations T53 misses (vs T53 catching only 1 RAG misses), a far larger and more
one-sided gap than v4.2's own recall comparison (0.765 vs 1.0, no paired significance test run
there). This is the single largest number in this round's results and is not subordinated to the
false-alarm primary above.

## 7. Per-repo breakdown (source: `analysis_v4_3.json`, `per_repo_breakdown`)

| repo | n | T53 recall | T53 FA rate | RAG recall | RAG FA rate |
|---|---|---|---|---|---|
| semantic-kernel | 29 | 0.375 [0.137, 0.694] | 0.143 [0.050, 0.346] | 1.000 [0.676, 1.0] | 0.190 [0.077, 0.400] |
| jaeger | 26 | 0.889 [0.565, 0.980] | 0.176 [0.062, 0.410] | 0.889 [0.565, 0.980] | 0.176 [0.062, 0.410] |
| content-publisher | 44 | 0.600 [0.358, 0.802] | 0.069 [0.019, 0.220] | 1.000 [0.796, 1.0] | 0.207 [0.099, 0.384] |
| email-alert-api | 25 | 0.000 [0, 0.354] | 0.000 [0, 0.176] | 1.000 [0.646, 1.0] | 0.111 [0.031, 0.328] |

`jaeger` is the only repo where T53 and RAG are identical (same tp/fp/tn/fn) -- T53's semantic
router and escalation tier both performed at parity with RAG's full-corpus read there. Every other
repo shows the same qualitative pattern as the pooled numbers: T53 trades recall for a lower (or
equal) false-alarm rate, most starkly on `email-alert-api` (see loss #2: the 0/7 T53 recall there
is partly a harness id-matching artifact, not a pure semantic miss).

## 8. T53 miss mechanism (`routedCorrectly`)

```
19 T53 false negatives (missed true-violate cases) out of 39 true-violate cases.
  routedCorrectly=False: 17/19 -- T53's semantic router never found the governing decision at all
                                  (a routing failure, upstream of any verdict).
  routedCorrectly=True:   2/19 -- the router found the right decision, but the escalation tier's
                                  own verdict was still COMPLIANT (a judgment failure, not routing).
  decidingTier breakdown among misses: zero-llm 15, llm 2, none 2.
```

Most of T53's recall loss on the new repos is a ROUTING failure (the semantic router not
surfacing the governing decision at all), not a judgment failure once routed -- consistent with
v4.2's own framing of T53 as "conservative/precision-favoring," but a sharper version of it: on
these 4 never-seen repos, the router's recall ceiling (not the escalation LLM's judgment) is the
dominant drag on T53's own recall.

## 9. Power -- stated plainly against the pre-registered target

```
Pre-registered conservative target (protocol_v4.3.md sec. 2): n_nonviolate ~340 (Wilson-lower-bound
reading of v4.2's original 8/8 discordant split). This round's best (pooled) n_nonviolate is 128 --
37.6% of that conservative target, still far short.

Pre-registered optimistic target: n_nonviolate ~40-50 (point-estimate reading). 128 clears this
comfortably (2.6-3.2x over).
```

Both readings are restated here exactly as pre-registered, neither suppressed: this round is
comfortably powered under the optimistic reading and still well short under the conservative one.
Unlike v4.2's own round (whose standalone result was itself significant), v4.3 is the first round
in this bench's history where the STANDALONE new-round result is NOT significant on its own
(p=0.143) -- only the pooled reading clears alpha=.05, which is exactly why reporting standalone +
pooled side by side (not just pooled) matters this round more than it did in v4.1/v4.2.

## Honest summary

v4.3 grew B2 from 60 to 124 never-seen held-out cases (4 new repos: `microsoft/semantic-kernel`,
`jaegertracing/jaeger`, `alphagov/content-publisher`, `alphagov/email-alert-api`), gated cleanly on
all 3 leakage checks plus the two task-specific build-fix cue checks, dual-labeled with a blind
third-reader reaudit that fixes v4.2a's "could quote a rejected option" flaw, and ran all 4 arms
once. The central finding is a genuine complication, not a clean replication: T53's false-alarm
conservatism (the headline of v4.2's result) only reaches significance pooled with v4.2, not on
v4.3's own 124 cases alone (p=0.143 standalone vs p=0.004-0.011 pooled), while T53's RECALL fell
sharply on these new repos (0.513 vs v4.2's 0.765), driven mostly by the semantic router not
finding the governing decision at all (17/19 misses) rather than a judgment error once routed, with
one repo (`email-alert-api`) additionally confounded by a harness id-normalization gap this round
did not fix. Power remains short of the pre-registered conservative target (128 of ~340) and
comfortably over the optimistic one (128 of ~40-50) -- both stated, neither hidden.

---

## CORRECTION (dated 2026-11-08) -- T53 harness id-matching bug (loss #2) audited and fixed

**This section is an addition, not a replacement.** All numbers above (section 1-9, "Honest
summary") are the ORIGINAL run's numbers, unedited, kept for the record. This section reports what
was found on audit and the CORRECTED numbers side by side, per task instruction. Full audit:
`tasks/T112b-b2-grow/4 log/id-matching-audit.md`. Unit tests: `run/adr_id_normalize.test.mjs` (15
tests, all pass, covering every repo's id forms across v3/v4.2/v4.3 -- 13 repos).

### What was wrong

Loss #2 (above) correctly named the bug but did not fix it: `run_t53_semantic_route_v4_3.mjs`'s
`ourAdrNum = adr_id.split('-').pop()` never equals `email-alert-api`'s `loadGraph`-derived id
(`adrNNN`, no dash) for any of its 10 cases, because that repo's id convention (`eaa-NNNN` on the
case side) doesn't fit either assumption the old matcher silently relied on. This is confirmed a
**SCORING bug** (how the harness reads an already-computed verdict), not a re-tuned hyperparameter
-- `cascadeCheck`'s escalation tier ran normally and had the right verdict in its `verdicts` array
the whole time; the harness's lookup into that array just never found it.

### Audit scope and result (part 1 of the task)

Audited id-matching for all 13 repos ever scored by T53 (v4.3's 4, v4.2's 3 scored + merino-py's 0
disclosed, v3's 5). **email-alert-api is the only repo affected** (10/10 of its adr-bearing cases
were match-impossible under the old matcher, 0/10 under the fix). 9 cases across 4 other repos
(semantic-kernel x4, claw-operator x2, log4brains x2, easi-app x1) are ALSO "impossible" under
both matchers -- confirmed (per-case) to be genuine ROUTING failures (the router's own top-K never
contains the right decision for any case referencing it), not a second id-format bug; the
normalizer changes zero cases there. Zero regressions anywhere (verified case-by-case, not just by
count, across all 13 repos): nothing the old matcher got right becomes wrong under the fix. RAG,
Reviewer, and Judge score purely by regexing `VERDICT: VIOLATES/COMPLIANT` out of free text -- they
have no id-matching step and are **not affected** by this bug at all. Full detail, repo-by-repo
table: `id-matching-audit.md`.

**semantic-kernel's 0.375 T53 recall, asked explicitly:** a ROUTING issue, not an id/format issue.
All 5 of its false negatives have `routedCorrectly=False` under both the old AND new matcher (the
router's top-5 never contains the true decision for those 5 cases) -- confirmed unchanged by the
fix.

### The fix

`run/adr_id_normalize.mjs`: `normalizeAdrId(s)` strips a leading run of lowercase
letters/dashes/underscores, then leading zeros (keeping >=1 digit), on BOTH the case's `adr_id` and
the loaded `verdict.decision`/`routing[].decision` id before comparing. `sameAdrId(a, b)` wraps the
comparison. 15 unit tests in `adr_id_normalize.test.mjs` (`node --test`, all pass) cover every
repo's id forms (including non-numeric log4brains slugs, prefix-kept-both-sides python-tuf/
powertools-python, no-prefix-at-all easi-app) with explicit MUST_MATCH and MUST_NOT_MATCH fixtures
(guarding specifically against the old bug's OWN failure mode -- `.split('-').pop()` would have
collapsed `l4b-slug-id` and `l4b-number-id` to the same tail `'id'`; the normalizer does not, since
it only strips a leading prefix, never trims from the end).

### Was the escalation verdict computed, or skipped? (part 3)

**Computed, not skipped.** `cascadeCheck()`'s escalation tier ran normally for every case; its
`verdicts` array had the right answer in it the whole time. The bug is entirely in the runner's
post-hoc lookup into that array. However, the original run only persisted the DERIVED summary row
to disk (`predictedViolate`, `decidingTier`, `routing` ids) -- not the raw `verdicts` array -- so
there was no way to re-score from the already-saved JSON. Re-ran T53 ONLY on the 10 affected
email-alert-api cases, same frozen params (k5 m0 c1.01, claude-haiku-4-5 router), fixed id-match
step only. Required re-cloning `email-alert-api` (`--depth 1`, 4.6MB; the Part B clone had been
deleted per disk discipline before this correction task started) and re-reconstructing the 10
cases' head commits (`reconstruct_commits_v4_3_CORRECTION_eaa.py`, same method as the original
`reconstruct_commits_v4_3.py`: checkout the verified-identical `base` SHA, re-apply each case's own
frozen `diff`, commit -- the resulting tree is byte-identical, only the commit SHA differs, same
disclosed substitution as loss #5 above). Verified repo HEAD == recorded `base` SHA before
touching anything. Run log: `run/t53_v4_3_CORRECTION_eaa.log`. Raw output (NEW file, original NOT
overwritten): `run/runtime_correction_t53_v4_3_email-alert-api_FIXED.json` (includes both the new
AND the old-matcher prediction per case, for a direct before/after diff per case).

### Corrected numbers, side by side with the original (part 4) -- source: `analysis_v4_3_CORRECTION.json`

**email-alert-api, standalone:**

| | tp | fp | tn | fn | recall | FA rate | accuracy |
|---|---|---|---|---|---|---|---|
| ORIGINAL (bug) | 0 | 0 | 18 | 7 | 0.000 [0, 0.354] | 0.000 [0, 0.176] | 0.720 [0.524, 0.857] |
| CORRECTED | 6 | 1 | 17 | 1 | **0.857** [0.487, 0.974] | 0.056 [0.010, 0.258] | **0.920** [0.750, 0.978] |

6 of the 7 previously-"missed" true-violate cases flip to correctly caught; 1 compliant case flips
to a new false positive (`v43-eaa-0004-compliant`); 1 true-violate case (`v43-eaa-0007-violate`)
remains a genuine miss even with the id fixed (`routedCorrectly=false` -- a real routing miss on
that one case, not an id issue).

**Overall (all 124 cases), T53 arm:**

| | tp | fp | tn | fn | recall | FA rate | accuracy |
|---|---|---|---|---|---|---|---|
| ORIGINAL | 20 | 8 | 77 | 19 | 0.513 [0.362, 0.661] | 0.094 [0.049, 0.175] | 0.782 [0.702, 0.846] |
| CORRECTED | 26 | 9 | 76 | 13 | **0.667** [0.510, 0.794] | 0.106 [0.057, 0.189] | 0.823 [0.746, 0.880] |

T53's overall recall rises materially (0.513 -> 0.667); its false-alarm rate also rises slightly
(0.094 -> 0.106, one new FP from the single eaa compliant-case flip) -- both reported plainly, not
just the favorable one.

**Per-repo (unaffected repos repeated for context, unchanged):**

| repo | T53 recall (orig) | T53 recall (corrected) |
|---|---|---|
| semantic-kernel | 0.375 [0.137, 0.694] | 0.375 [0.137, 0.694] (unchanged -- routing issue, see above) |
| jaeger | 0.889 [0.565, 0.980] | 0.889 [0.565, 0.980] (unchanged) |
| content-publisher | 0.600 [0.358, 0.802] | 0.600 [0.358, 0.802] (unchanged) |
| email-alert-api | 0.000 [0, 0.354] | **0.857 [0.487, 0.974]** |

**Primary: McNemar (exact, two-sided) on false alarms, T53 vs RAG:**

| reading | n_nonviolate | b (T53-only FA) | c (RAG-only FA) | p (orig) | p (corrected) | significant? |
|---|---|---|---|---|---|---|
| STANDALONE v4.3 | 85 | 5 | 12 -> 11 | 0.1435 | **0.2101** | NOT sig., either way |
| POOLED, v4.2 ORIGINAL labels | 128 | 5 | 20 -> 19 | 0.00408 | **0.00661** | sig. both ways (a=.05) |
| POOLED, v4.2a REAUDITED labels (B') | 125 | 5 | 18 -> 17 | 0.01062 | **0.01690** | sig. both ways (a=.05) |

The standalone reading was already NOT significant and stays NOT significant after the fix (it
moves further from the threshold, not closer -- the fix added one new T53-false-alarm/RAG-both-hit
case that reduces RAG's unique-FA advantage slightly less than it reduces T53's recall deficit).
Both pooled readings stay significant after the fix. **Bottom line: the fix does not flip any
significance verdict** -- the standalone-vs-pooled disagreement (the central finding of section 5
above) is unchanged in kind, only the exact p-values shift.

**Co-primary: paired recall test (T53 vs RAG, true-violate cases only, n=39):**

| | b (T53 hit, RAG miss) | c (RAG hit, T53 miss) | p_exact | significant? |
|---|---|---|---|---|
| ORIGINAL | 1 | 19 | 0.00004 | significant |
| CORRECTED | 1 | 13 | **0.00183** | still significant |

RAG's recall advantage over T53 narrows (19 -> 13 RAG-only hits among true-violate cases) but
remains large and remains significant at a=.05.

### What does NOT change

- v4.2, v4.2a, and v3's own frozen numbers are untouched (none of their repos' cases were affected
  by this bug -- confirmed by the audit above, not merely asserted).
- The original frozen files (`run/t53_semantic_route_v4_3_heldout_claude-haiku-4-5_k5_m0_c1.01.json`,
  `arm_metrics_v4_3.json`, `analysis_v4_3.json`, `frozen_run_v4_3.sha256`) are NOT overwritten.
  New files hold the correction: `run/runtime_correction_t53_v4_3_email-alert-api_FIXED.json`,
  `run/t53_semantic_route_v4_3_heldout_claude-haiku-4-5_k5_m0_c1.01_CORRECTED.json` (full merged
  124-row set), `analysis_v4_3_CORRECTION.json`.
- Section 9's power conclusion is unchanged (the correction does not touch n_nonviolate in any
  reading -- only the b/c discordant counts shift slightly within an unchanged n).

### Honest summary of the correction

The id-matching bug was real, scoped to exactly one repo (email-alert-api) out of 13 ever scored,
and is now fixed with a disclosed normalizer + unit tests, not a silent patch. The corrected
numbers tell a MATERIALLY DIFFERENT per-repo story for email-alert-api (T53 recall 0.000 ->
0.857 -- most of its apparent total routing failure there was actually a scoring artifact) but a
materially SIMILAR aggregate story: the standalone-vs-pooled McNemar disagreement persists, the
paired recall gap persists (narrower, still significant), and the power shortfall against the
conservative target is unchanged. semantic-kernel's separately-low recall (0.375) is independently
confirmed to be a genuine routing issue, unrelated to this bug and unchanged by its fix.
