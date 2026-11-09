# T112b-b2-grow -- Part B build log (alphagov/content-publisher + alphagov/email-alert-api)

Scope: build this task's "part B" of v4.3's >=95-new-case target: cases from the 2
`alphagov` repos only (`microsoft/semantic-kernel` and `jaegertracing/jaeger` are a separate
part, not built here). Protocol: `protocol_v4.3.md`, sha256-frozen (`frozen_protocol_v4_3.sha256`,
unedited by this task; `shasum -a 256` reconfirmed it matches before building). Template: v4.2's
`build_common_v4_2.py` / `build_cases_v4_2_new.py` (same case shape, same `pair()`/distractor
pattern, same leak-gate design). **STOPPED before labeling** per instruction -- no dual-labeler,
no blind re-adjudication, no freeze-by-sha256, no T53/RAG/reviewer/judge arm runs in this task.

## Losses first

1. **Real structural leak found and fixed, not hidden.** The first build of these 69 cases had
   every single case's diff with `adds_import = False` (no hand-authored Ruby snippet used an
   explicit `require(...)`), because GOV.UK Rails apps autoload and rarely write literal
   `require` calls. `leakage_gate_v4_3_part_B.py`'s structural-feature classifier (trained on
   v4.2's 60 already-labeled new-held-out cases, scored on these 69) picked `adds_import` as its
   best split and, because virtually all of this file's cases share one feature value, it predicted
   "no_decision" for 100% of this file's 31 no_decision cases and 0% of the 38 violate/compliant
   cases -- exactly the v4.1 "pooled accuracy looks fine, one class alone is at/above chance"
   failure mode the per-class check exists to catch. **Fix:** injected a neutral
   `require("json")` call into roughly half of the `.rb` cases, chosen deterministically by
   `zlib.crc32(case_id) % 2` (not by label, not by mode) so the feature value is mixed within
   every class and every file-mode. Re-ran the gate after the fix; it now passes (numbers below).
   This is logged here, not quietly fixed and left unmentioned, because it is evidence the hand-
   authored snippets had a real, if accidental, structural tell before the gate caught it.
2. **Only 19 of the repos' 26 real ADRs were used**, not all of them. Excluded and why:
   - `content-publisher` 0001 (record-architecture-decisions) and `email-alert-api` adr-005
     (same title) are the meta/process ADR about using ADRs itself, not a code decision --
     the same category v4.2 excluded (`handbook` 0000, `hmrc-frontend` 0001 were KEPT and paired
     in v4.2 because their content was itself about ADR format, which IS a testable code
     consequence for docs/adr files; these two meta-ADRs here are pure process prose with no
     testable code consequence, so held out rather than force-paired).
   - `content-publisher` 0006 (tagging-governments) is `Status: Superseded` by ADR 14 -- used
     ADR 14 instead (which has the live accepted decision) rather than pairing a superseded one.
   - `email-alert-api` adr-001 (initial notify integration) is a whole-system architecture sketch
     with no single concrete per-file consequence; adr-003 is `Superseded` by adr-007 (used
     adr-007 instead); adr-008 is `Status: Proposed -- team paused`, not accepted; adr-010 is
     `Status: Proposed`. All four excluded for not being a clear ACCEPTED decision with one
     concrete code consequence, per the task's selection bar.
   - This leaves 14 content-publisher ADRs (0002-0005, 0007-0016, skipping 0006) and 5
     email-alert-api ADRs (adr-002, adr-004, adr-006, adr-007, adr-009) = 19 ADRs, 38 paired cases.
3. **No dual-labeling, reaudit, freeze or arm runs were done.** Per this task's explicit
   instruction ("STOP before labeling"), `label_constructor_intent` in the raw JSON is the
   constructor's own stated intent only (same field v4.2 calls this at the raw-case stage,
   before any labeler sees it) -- it is NOT a verified/frozen label. The next task picks up at
   dual-labeling, same as v4.2's own `labeler_v4_2.py` stage.
4. **Mirrors v4.2's `is_new` detection quirk unchanged.** `features()`'s `is_new` check
   (`diff.splitlines()[2].startswith("new file mode")`) is off-by-one against real `git diff`
   output (the `new file mode` line is at index 1, not 2, so `index 0000000..<sha>` is what's
   actually checked) -- this is inherited verbatim from `leakage_gate_v4_2.py` and was not
   "fixed" here, per "reuse ... not relaxed": it already always evaluates to `False`, which
   makes `is_new` an uninformative (not leak-prone) feature in both v4.2's own run and this one,
   so leaving it unchanged does not add new risk; noted here for whoever runs check 3 (no-ADR
   LLM) next, since that check is unaffected by this quirk.

## What was built

- Cloned shallow (`--depth 1`) to `~/.hermes/cache/scratch/b2v43/{content-publisher,email-alert-api}`,
  disk 6.2 GB free before, 6.2 GB after (clones deleted is still pending -- see Next).
- `build_common_v4_3_partB.py` + `build_cases_v4_3_part_B.py` (same shape as v4.2's
  `build_common_v4_2.py` / `build_cases_v4_2_new.py`): real ADR text read verbatim via
  `read_adr()`, each case's diff built for real against the cloned tree (commit, diff, hard
  reset), ids `v43-cp-<NNNN>-<label>` / `v43-eaa-<NNNN>-<label>` / `v43-none-<n>`, never
  colliding with `v42-*`.
- 19 ADRs x (violate + compliant) = 38 paired cases, plus 31 `no_decision` distractors
  (real-looking unrelated edits in both repos, no reference to any of the 19 decisions used).
  **Total: 69 cases**, label mix `{violate: 19, compliant: 19, no_decision: 31}` (44.9%
  no_decision, matching v4.2's ~45% ratio). File-mode mixed across ALL THREE classes:
  `{(no_decision, append): 18, (compliant, new): 13, (no_decision, new): 13, (violate, new): 12,
  (violate, append): 7, (compliant, append): 6}` -- no class is pure-new or pure-append.
  Repo split: content-publisher 44 cases, email-alert-api 25 cases.
- Output: `cases_v4_3_part_B_raw.json` (same schema as v4.2's `cases_v4_2_new_raw.json`: id,
  repo, adr_id, label_constructor_intent, file, note, source, split="heldout",
  mode_is_new_file, base, head, diff, decision_text). Both repo clones `git status --short`
  clean after the build (every synthetic commit reset via `git reset --hard` + `git clean -fd`).

## Leak gate (`leakage_gate_v4_3_part_B.py`, v4.2's per-class + structural design, unrelaxed)

Run twice: once before the `require("json")` balance fix (FAILED), once after (PASSED). Final
numbers (post-fix), 69 cases, majority class `no_decision` at 44.93% (Wilson 95% CI
33.77-56.62%):

| check | per-class result | exceeds per-class chance bar (Wilson lower > 56.62%)? |
|---|---|---|
| 1. keyword classifier (fixed v4.1/v4.2 cue list) | abstains on 68/69 (98.6%); the 1 scored case (no_decision) is WRONG (0/1) | No -- `check_1_pass: true` |
| 2. structural classifier, trained on v4.2's 60 new-held-out cases, scored on these 69 | violate 8/19=42.1% (CI 23.1-63.7%); compliant 0/19=0% (CI 0-16.8%); no_decision 20/31=64.5% (CI 47.0-78.9%) | No -- `check_1_pass: true` for all three, pooled accuracy 40.6% vs new-set majority rate 44.9% (`beats_majority_pooled: false`) |

`gate_verdict`: `check_1_pass: true`, `check_2_pass: true`, **`overall_pass: true`**. No-ADR LLM
(v4.2's check 3) was not run -- it requires model calls against the cases, which is a labeling
step this task explicitly stops before.

## Files (all in `context/product-plan/systems/metrics-proof/m2-conflict/v4.3/`, main checkout,
not committed by this task per the commit-scope instruction)

- `build_common_v4_3_partB.py`, `build_cases_v4_3_part_B.py` -- builders (v4.2 template adapted).
- `cases_v4_3_part_B_raw.json` -- 69 raw cases (pre-labeling).
- `leakage_gate_v4_3_part_B.py` -- gate (v4.2 design, re-pointed at these cases + v4.2 as the
  "already seen" training set for check 2).
- `leakage_gate_v4_3_part_B.json` -- gate output, matches the table above.

## Next (not done in this task, per "STOP before labeling")

1. Dual-label (opus+haiku, reusing `labeler_v4_2.py`'s shape) via `hermes -z --safe-mode` only.
2. Blind re-adjudicate disputes with a FRESH call given ONLY the ADR text + diff + rule, quoting
   the ADR's accepted **Decision Outcome**/**Decision** section verbatim.
3. Freeze every artifact (cases, gate output, labels, reaudit output) by sha256 before scoring.
4. Combine with the other part (`microsoft/semantic-kernel` + `jaegertracing/jaeger`, built
   separately) to reach the >=95-new-case / pooled->=155 target from `protocol_v4.3.md`.
5. Delete the two scratch clones (`~/.hermes/cache/scratch/b2v43/{content-publisher,email-alert-api}`)
   once this file is committed -- left in place in case a re-run of the builder or gate is needed
   before the next task picks this up.
