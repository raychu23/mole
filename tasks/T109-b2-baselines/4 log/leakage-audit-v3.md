# B2 v3 leakage audit (v3 edition of the v4 construct-validity review)

Scope: `context/product-plan/systems/metrics-proof/m2-conflict/v3/` (build_cases_v3.py, cases_with_labels_v3.json,
labels, run outputs, results*.md), audited for the SAME construct-validity leak the v4 review found
(`deleg_33b4deaf/task-0.log`: verdict-narrating comments baked into constructed diffs, NOTE.md stub
distractors; a no-ADR keyword classifier scored 20/21 on v4). No v3 data was touched (read-only audit,
per instructions); this file is the only change in this commit.

## Losses first

```notes
SAME LEAK CONFIRMED IN       Every one of v3's 151 synthetic cases is built by build_cases_v3.py's pair()/
V3, ALL 3 LABEL CLASSES        trap() helpers, which append an inline verdict-narrating comment to the
                              added diff line for BOTH the violate and compliant half of each pair, and
                              every no_decision distractor's one-line NOTE.md-style stub file literally says
                              it is "unrelated to" the relevant decision(s). Quoted examples (part 1 below)
                              show this holds for all 3 final-label classes, not just violate/compliant as
                              in v4's finding.
NO-ADR KEYWORD CLASSIFIER     Zero ADR text, zero model calls, ~15 lines of regex over the diff's own added
SCORES 93.6% ON SCORED,         lines (phrases like "instead of"/"moved away from"/"anti-pattern" -> violate;
83.1% FULL-VIEW, VS 36.0%      "per the decision"/"per ADR\d" -> compliant; "only if read naively"/
MAJORITY-CLASS RATE            "superseded"/"decommission" -> not_applicable; else abstain) scores 44/47
                              correct on the 47 cases it doesn't abstain on (93.6%, Wilson 95% CI
                              82.8-97.8%), and 74/89 (83.1%, CI 74.0-89.5%) if the 42 abstains are
                              defaulted to "not_applicable". The majority-class floor (always guess
                              "not_applicable", the plurality label, 32/89) is 35.96% (CI 26.8-46.3%). The
                              keyword classifier beats the floor by ~47 points (scored) / ~47 points
                              (full-view) with NO access to any ADR text and NO model call -- this is the
                              same order of magnitude as v4's reported 20/21 (95.2%) scored-subset result.
NO-ADR LLM (claude-sonnet-5,  One hermes call per held-out case (89/89, no retries needed), given ONLY the
DIFF ONLY) SCORES 80.9%        unified diff (no decision_text, no ADR id, no note field), asked to guess
                              VIOLATES/COMPLIANT/NOT_APPLICABLE. Scored 72/89 correct = 80.9% (Wilson 95%
                              CI 71.5-87.7%) -- more than DOUBLE the majority-class rate (35.96%, CI
                              26.8-46.3%, non-overlapping CIs) using nothing but the diff's own narrating
                              comments and the distractor files' own "unrelated to X" prose. Cost: $1.04
                              total / $0.0117 mean per case (raw: noadr_llm_heldout_v3.json, scratch copy
                              under /Users/a1/.hermes/cache/scratch/b2v3audit/, not committed).
WHERE THE NO-ADR LLM FAILS    Of the 17 cases it got wrong, 15 are "compliant" cases it mis-called
                              "violate" (it treated a comment like "kept in application memory, per the
                              decision" or "deprecated alias kept... per the decision" as suspicious on its
                              own, without knowing WHAT the decision actually required) -- i.e. even its
                              failures are driven by reading the planted comment, just miscalibrated about
                              what "per the decision" implies without the decision text, not by genuine
                              diff-only ambiguity. This is further evidence the comments, not real ADR
                              reasoning, are doing the work.
T53-vs-RAG FALSE-ALARM GAP    On the n=17 subset where the no-ADR LLM was wrong (the closest available proxy
PERSISTS, DIRECTIONALLY,       for "cases where the planted text gives no/a misleading hint"), T53's false-
ON THE HARDEST SUBSET --       alarm rate is 2/17 = 11.8% (CI 3.3-34.3%) vs RAG's 5/17 = 29.4% (CI
BUT n=17 IS UNDERPOWERED        13.3-53.1%) -- the SAME direction and a LARGER relative gap (~2.5x) than the
                              full-89 result (T53 6.7% vs RAG 15.0%, ~2.2x, results.md). McNemar exact on
                              this subset: b=4 (T53-only-right), c=1 (RAG-only-right), p=0.375, NOT
                              significant (n=17 is far too small to resolve this on its own; this subset
                              has ZERO true "violate" cases, so recall cannot be compared here at all, only
                              false-alarm rate). Read plainly: the result does NOT visibly collapse to zero
                              or reverse direction on the harder subset, which is evidence against "the
                              whole T53-vs-RAG FA gap is a pure leak artifact" -- but n=17 cannot confirm
                              the gap is real either; this is a directional, not a statistical, finding.
CAVEAT ON THE SUBSET ITSELF   The "wrong" subset is defined by a DIFF-ONLY probe, but v3's own label_final
                              values were produced by labeler models (opus/haiku) that DID see decision_text
                              (full real ADR prose), which itself often reuses the same vocabulary the
                              planted comment echoes (e.g. "per the decision" paraphrases the ADR's own
                              chosen option). So "no-ADR-LLM-wrong" is not a clean independent sample of
                              "cases requiring real ADR-vs-diff reasoning" -- it is correlated with, but not
                              identical to, that construct. Treat the subset result as suggestive, not
                              dispositive.
SECONDARY, UNASKED-FOR         Incidentally found while sampling: the 3 "backstage" held-out case diffs are
FINDING: DIFF-SIZE NOISE        NOT minimal 1-line diffs -- v3-bs-adr008-violate's diff is 316KB / 7159
(BACKSTAGE REPO ONLY)           lines (base..head picked up real unrelated upstream Backstage history, not
                              just the synthetic 1-line edit), vs every other repo's cases which are small,
                              clean, single-file diffs. This cost $0.36 of the no-ADR LLM run's $1.04 total
                              on a single case and is a DIFFERENT kind of validity problem (diff-construction
                              noise, not comment leakage) -- flagged here because it was visible during this
                              audit, not scored or fixed (out of this audit's scope; only 3/89 held-out
                              cases are backstage, so its effect on the numbers above is small but nonzero).
```

## (1) 15 held-out cases sampled across label classes, diff comments quoted verbatim

Stratified sample: 5 `violate`, 5 `compliant`, 5 `not_applicable` (random seed 99, `label_final`-stratified).
Full dump: `/Users/a1/.hermes/cache/scratch/b2v3audit/sample15_dump.json` (scratch, not committed).

```notes
violate (constructor_intent matches label_final in all 5 sampled)
v3-easi-cache-violate        "var cache = redis.NewClient(&redis.Options{}) // new expensive-call cache
                               backed by Redis, not the chosen in-application memory cache"
v3-l4b-ghflow-violate        "export const RELEASE_BRANCHES = ['develop', 'stable']; // re-introduces the
                               develop/stable branch pair the decision moved away from"
v3-easi-mockci-violate       "func TestCedarCallsLiveAPI(t *testing.T) { cedarClient.Call() } // CI
                               integration test hits the LIVE CEDAR API, not a mock"
v3-easi-cedarasync-violate   "func SubmitAction(a *models.Action) error { return cedarClient.SendIntake(a) }
                               // new action handler calls the CEDAR Intake client synchronously inline,
                               not via the async dispatch path"
v3-tuf-repolib-violate       "def do_everything(root, targets, keys, expiry, consistent_snapshot, prefix):
                               # one giant global-state function, the legacy repo.py anti-pattern ADR0010
                               moves away from"

compliant (constructor_intent matches label_final in all 5 sampled)
v3-easi-svgicons-compliant   "import CheckIcon from './icons/check.svg'; // new icon added as an SVG
                               element, per the decision"
v3-easi-rhf-compliant        "import { useForm } from 'react-hook-form'; // new form built with React Hook
                               Form, per the decision"
v3-easi-softdelete-compliant "func DeleteSystemIntake(id string) { db.Exec(\"UPDATE system_intakes SET
                               deleted_at = NOW() WHERE id = $1\", id) } // new delete path sets
                               deleted_at, per the decision"
v3-easi-nostatemachine-compliant "func HandleSubmitAction(intake *models.SystemIntake) error { return nil }
                               // new transition handled as an explicit per-action Service method, not a
                               generic state machine, per the decision"
v3-easi-cache-compliant      "var cache = make(map[string]interface{}) // new expensive-call cache kept in
                               application memory, per the decision"

not_applicable (constructor_intent = "no_decision" in all 5 sampled -- plain NOTE.md-style stub distractors)
v3-easi-none-29              "Generated GraphQL operation types live here; unrelated to the resolver/
                               Dataloader ADR specifically."
v3-pt-none-5                 "This example shows typical EMF metric usage; not part of the package's own
                               ADR-governed code."
v3-easi-none-26              "React context providers live here; unrelated to form/editor/icon decisions."
v3-easi-none-36              "App-level wrapper components (auth, timeout) live here; unrelated to this
                               set's ADRs."
v3-easi-none-23              "AWS SES wrapper lives here; unrelated to the logging-platform ADR
                               specifically."
```

Pattern: every `violate` comment states the REJECTED mechanism in contrastive language ("not X", "instead
of", "moved away from", "anti-pattern"); every `compliant` comment states "per the decision" / "per ADR\d"
verbatim; every `not_applicable` distractor's one-line stub states its own irrelevance ("unrelated to ...").
None of the 15 sampled cases requires reading the real ADR text to label correctly from the comment alone.

## (2) No-ADR baselines run on ALL 89 held-out v3 cases

```notes
baseline                       scored/n    correct   wrong   abstain   accuracy (Wilson 95% CI)
majority class (guess           n/a (always "not_applicable",     32/89    0.360 (0.268-0.463)
"not_applicable")                the plurality label)
keyword classifier (regex,      47/89       44        3       42        0.936 (0.828-0.978) scored-only
zero ADR text, $0, no calls)    89/89 (abstain->not_applicable default)   0.831 (0.740-0.895) full-view
no-ADR LLM (claude-sonnet-5,    89/89       72        17      0         0.809 (0.715-0.877)
--safe-mode, diff only, 1
hermes call/case, $1.04 total)
```

Both no-ADR baselines' 95% CIs sit entirely ABOVE the majority-class CI's upper bound (0.463) -- this is
not noise. The keyword classifier's 3 scored errors are the 2 real supersession traps (where the "superseded"
keyword also matched but the real adjudicated `label_final` disagreed with the trap's own intended answer,
a pre-existing v3 adjudication quirk, not a classifier bug) plus `v3-bs-adr008-violate` (the one case where
both real labeler models independently disagreed with the constructor's intended "violate" label). Scripts
and raw outputs: `/Users/a1/.hermes/cache/scratch/b2v3audit/` (keyword classifier inline in this audit's
analysis, `noadr_llm.py` + `noadr_llm_heldout_v3.json` for the LLM baseline) -- scratch, not committed per
the "no fixes to v3 data" instruction; this .md file is the only tracked artifact from this audit.

## (3) Does the T53-vs-RAG false-alarm result plausibly survive?

```notes
view                            n     T53 FA (95% CI)        RAG FA (95% CI)        T53 recall    RAG recall
full held-out (sanity check,    89    0.067 (0.026-0.159)    0.150 (0.081-0.261)    0.966         1.000
reproduces results.md exactly)
subset: no-ADR LLM WRONG        17    0.118 (0.033-0.343)    0.294 (0.133-0.531)    n/a (0 true    n/a (0 true
(hardest-to-guess-from-text-               violate cases     violate cases
alone cases, by construction)                                in subset)     in subset)
```

McNemar exact on the n=17 subset (binarized predictedViolate vs true-violate correctness): both-right=11,
T53-only-right=4, RAG-only-right=1, both-wrong=1 -> p=0.375, NOT significant (same non-significant pattern
v3's own full-set T53-vs-RAG comparison showed, p=0.344, results.md -- this was never a powered claim).

**Verdict: plausibly survives, but only as a directional, not statistical, result.** The T53-vs-RAG
false-alarm gap does NOT collapse or reverse on the subset where a no-ADR LLM (the closest available proxy
for "the planted text gives no/a misleading hint") got the label wrong -- if anything the gap is
PROPORTIONALLY LARGER there (11.8% vs 29.4%, ~2.5x) than on the full leaky set (6.7% vs 15.0%, ~2.2x). That
is evidence against "the entire T53-vs-RAG FA gap is a pure artifact of the comment leak." It is NOT proof
the gap is real: n=17 is far too small to resolve significance on its own (CIs span 3.3-53.1%, heavily
overlapping), the subset happens to contain zero true-violate cases so recall can't be checked at all here,
and the subset-selection probe (a diff-only LLM) is correlated with but not identical to "needs real
ADR-vs-diff reasoning" (the caveat above: real `label_final` values were set by labelers that DID see
decision_text, which shares vocabulary with the planted comments). The honest summary: the construct-
validity leak is real and large (same magnitude as v4's finding, now confirmed present across v3 too), the
B2 resume claim's underlying comparison (T53 vs RAG false-alarm rate) is not obviously destroyed by it on
the one subset test available, but that subset test is underpowered and not a clean causal isolation -- a
properly leak-free case set (comments stripped, distractors rewritten to not announce their own
irrelevance) is the only way to settle this with real power, not attempted here per the "no fixes to v3
data" instruction.
```

## Method notes

- No v3 frozen artifact was modified (`frozen.sha256`, `cases_with_labels_v3.json`, `results.md`,
  `results.json` all untouched; `git status` on the main checkout shows only this new `.md` file added).
- Keyword classifier logic: reimplemented from the shape of v4 review's naive_predict (diff-only, regex over
  added lines, abstain when no pattern matches) since the exact v4 regex source wasn't preserved verbatim in
  the review transcript -- this is a reconstruction consistent with the review's documented behavior and
  result magnitude (v4: 20/21 scored; v3 here: 44/47 scored), not a byte-identical copy.
- No-ADR LLM baseline: `hermes -z <prompt> -m claude-sonnet-5 --provider anthropic -t "" --safe-mode`, same
  call shape as v3's own `run_guidelines_arm_v3.py`/`run_judge_arm_v3.py`, but the prompt withholds
  `decision_text` entirely and only shows the diff, mirroring the construct-validity probe the v4 review ran.
- Sample-15 and no-ADR-LLM raw outputs live under `/Users/a1/.hermes/cache/scratch/b2v3audit/` (scratch,
  pruned after 24h idle, not part of this commit) -- the numbers above are reproducible from that script
  (`noadr_llm.py`) against the frozen `cases_with_labels_v3.json` at any time.
