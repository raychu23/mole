M2 v3 baselines -- linter-only, "reviewer + team guidelines" (CodeRabbit-style), and two-sided judge
(Wealthfront Iris pattern), run ONCE on the SAME frozen v3 held-out 89 (T109-b2-baselines / queue Q2,
answering D92's named baselines and `19 Can it stand up.md` fix 3, "why not a linter?").

2026-11-07. Descriptive addition to the already-frozen, already-scored v3 case set (`frozen.sha256`,
`cases_with_labels_v3.json`) -- no label, diff, or case was touched; only 3 new arms were run on the
existing 89 held-out cases, same held-out split v3's T53/reviewer/RAG numbers (`results.md`) came from.
Per `queue/brief.md`'s "Benchmark facts": this is a descriptive addition reported after the fact, not a new
"better than" claim (that needs a new pre-registered set, see Q6/T112).

Scripts: `baselines/linter_arm_v3.py`, `baselines/run_guidelines_arm_v3.py`, `baselines/run_judge_arm_v3.py`,
`baselines/score_baselines_v3.py`. Prior art: `tasks/T109-b2-baselines/4 log/prior-art.md` (CodeRabbit code
guidelines, Wealthfront Iris antagonistic review, dependency-cruiser rules reference, Mole's own T92 rules
compiler, v3's own verified Wilson-CI code). Raw outputs: `arm_linter_heldout_v3.json`,
`arm_guidelines_heldout_v3.json`, `arm_judge_heldout_v3.json`, `results-v3-baselines.json`.

## Losses first

```notes
linter recall is near-zero    scored subset (n=33/89, the cases where a grep rule compiled at all): recall
                                 5.9% (1/17 violate cases caught). Full n=89 view (abstain = linter doesn't
                                 block, which is what a team actually experiences): recall 3.45%. Prose
                                 ADRs encode semantic judgments ("use Go, not Node"; "don't query the DB
                                 directly from a controller") a literal grep-over-added-lines cannot catch
                                 unless the exact rejected term happens to appear verbatim in the diff. This
                                 IS the honest answer to "why not a linter?" -- it mechanically can't, for
                                 THIS kind of decision (prose policy, not import-graph topology).
linter coverage is low        the compiler abstains on 25/51 decisions (49%) and 56/89 held-out cases
                                 (63%) -- no extractable "instead of X" / "Considered Alternatives" pattern
                                 in the ADR text, or the ADR marks itself superseded. Reported as coverage,
                                 not folded into a score (see linter_arm_v3.py's abstain path).
linter vs T53 is SIGNIFICANT,   both views: scored-subset p=0.0023 (n=33, T53 right 15x where linter
in T53's favor                  wrong, linter right 2x where T53 wrong), full n=89 (abstain-as-compliant)
                                 p=0.0 (T53 right 27x where linter wrong, linter right 4x where T53 wrong).
                                 This is the FIRST statistically significant pairwise result anywhere in
                                 the B2 line (v1/v2/v3's own T53-vs-RAG-vs-reviewer McNemar all came back
                                 non-significant, p=0.18-0.69) -- but it is a comparison against a baseline
                                 with 49-63% abstention, not against another always-answers model arm.
"reviewer + guidelines" arm is  recall 100% (misses nothing, same as RAG/reviewer), but precision 65.9% and
WORSE than existing RAG arm      false-alarm rate 25% -- both worse than v3's existing RAG-reads-all arm
                                 (precision 76.3%, FA 15.0%, results.md) and worse than T53 (87.5%/6.7%).
                                 McNemar vs T53: p=0.0063, SIGNIFICANT in T53's favor (T53 right 11x where
                                 this arm wrong, this arm right 1x where T53 wrong) -- the second
                                 significant pairwise result in the whole B2 line, and the first one where
                                 BOTH arms always answer (no abstention confound). Framing all decisions as
                                 standing "guidelines to check the diff against" (CodeRabbit's real
                                 mechanism) appears to make the model flag MORE eagerly than RAG's "find the
                                 relevant one or say none apply" framing -- same decisions, same diffs, same
                                 model, worse precision. This is a real, not hypothetical, downside of the
                                 CodeRabbit-style "always-on guidelines" pattern on this case set.
two-sided judge did NOT         Wealthfront's own result (eng.wealthfront.com, prior-art.md #2): "slightly
replicate Wealthfront's          increased true positives and greatly decreased false positives." Here:
reported effect                 recall DROPPED from T53's 96.6% to 82.8% (full n=89 view) and false-alarm
                                 rate dropped only modestly (6.7% -> 5.0%). McNemar vs T53: p=0.508, NOT
                                 significant. Plausible reason: this is a single-call SIMULATION of the
                                 3-role pattern (prosecutor/defender/judge text in one response), not
                                 Wealthfront's 3 separate model calls with an impartial top-level agent
                                 given latitude to explore further -- see "two-sided judge is a scoped-down
                                 stand-in" below.
two-sided judge abstains on     T53's own semantic router (`run/t53_semantic_route_v3_heldout_...json`,
18/89 (20%) of held-out cases    frozen k=5 params) returned ZERO candidate decisions for 18 of 89 held-out
                                 cases -- the judge has nothing to weigh in those cases and this arm
                                 abstains rather than fabricate a candidate (logged, not hidden). The
                                 n=71-scored view and the n=89 abstain-as-compliant view are both reported
                                 below; neither changes the "not significant" verdict.
two-sided judge is a scoped-    Wealthfront runs 3 separate model calls per finding (prosecutor GPT-5,
down stand-in, not a            defender Gemini-3-Flash, judge Opus-4) plus 3 more directed-research
faithful reproduction            sub-agents, at ~$4/review (prior-art.md #2). This task's compute/time
                                 budget does not support 3x89 extra calls on top of the guidelines arm's 89
                                 calls, so all 3 roles run inside ONE hermes call per case. This is a real
                                 methodological gap, stated here, not smoothed over -- a faithful 3-call
                                 reproduction is future work, not this task's claim.
```

## What was run (no model re-tuning, same held-out 89, same diffs/labels as v3)

```notes
(a) linter-only       zero model calls. Compiles each of the 51 decisions' text (never a diff, never a
                         label) into grep-style regex terms via deterministic patterns ("instead of X",
                         "rather than X", "Considered Alternatives" minus "Chosen Alternative", "must/
                         should not use X", "avoid X", ADR self-marked superseded -> abstain). Flags
                         predictedViolate=true iff a surviving term appears in the diff's ADDED lines.
                         Why grep, not dependency-cruiser: sampling all 51 real ADRs shows every one is a
                         prose policy decision, none an import-graph constraint dependency-cruiser's
                         forbidden/allowed rules check (prior-art.md #3). Script: linter_arm_v3.py.
(b) reviewer +         1 hermes call/case (claude-sonnet-5, --safe-mode), given ALL of the case's repo's
guidelines (b)           real decisions verbatim as standing "team guidelines" (CodeRabbit's actual
                         mechanism, prior-art.md #1), asked for a review, parsed for a VERDICT line.
                         Script: run_guidelines_arm_v3.py.
(c) two-sided judge    1 hermes call/case, given ONLY the 1-3 decisions T53's own semantic router already
                         routed for that case (not the full repo corpus), asked to argue prosecutor THEN
                         defender THEN judge in one response (Wealthfront's role split, single-call
                         scoped-down version, see loss above). Script: run_judge_arm_v3.py.
scoring                same Wilson 95% CI formula v3 itself verified before using (reused from
                         metrics-proof/prelim-11-01/mc-agent-ab/v4/raw/stats.py, not re-derived), same
                         McNemar-exact-on-discordant-pairs method v3/results.md used for T53-vs-RAG-vs-
                         reviewer. Script: score_baselines_v3.py. Full numbers: results-v3-baselines.json.
```

## Numbers -- recall / precision / false-alarm (Wilson 95% CI), cost, latency (held-out, n=89 unless noted)

```notes
arm                               recall (95% CI)       precision (95% CI)    false-alarm (95% CI)   mean cost  p50/p95 latency  n
T53 Mole (from results.md, v3)    0.966 (0.828-0.994)   0.875 (0.719-0.950)   0.067 (0.026-0.159)    $0.0054    13.7s / 30.7s    89
reviewer oracle (results.md)      1.000 (0.883-1.000)   0.806 (0.650-0.902)   0.117 (0.058-0.222)    $0.0081    8.4s / 14.9s     89
RAG reads-all (results.md)        1.000 (0.883-1.000)   0.763 (0.608-0.870)   0.150 (0.081-0.261)    $0.0698    8.1s / 17.9s     89
linter-only (scored subset)       0.059 (0.011-0.270)   1.000 (0.207-1.000)   0.000 (0.000-0.194)    $0         n/a (no calls)   33 (coverage 37%)
linter-only (abstain=compliant)   0.035 (0.006-0.172)   1.000 (0.207-1.000)   0.000 (0.000-0.060)    $0         n/a (no calls)   89
reviewer + guidelines (CR-style)  1.000 (0.883-1.000)   0.659 (0.511-0.781)   0.250 (0.158-0.372)    $0.0816    18.9s / 64.2s    89
two-sided judge (scored subset)   0.828 (0.655-0.924)   0.889 (0.719-0.962)   0.071 (0.025-0.190)    $0.0298    35.8s / 79.7s    71 (coverage 80%)
two-sided judge (abstain=compl.)  0.828 (0.655-0.924)   0.889 (0.719-0.962)   0.050 (0.017-0.137)    $0.0298    35.8s / 79.7s    89
```

## McNemar exact vs T53 (correctness-based: did each arm get the case's final label right?)

```notes
pair (new arm vs T53)             n    both-right   T53-only-right   arm-only-right   both-wrong   discordant   p (exact, 2-sided)
linter-only (scored subset)       33   15           15               2                1            17           0.0023  SIGNIFICANT (T53)
linter-only (abstain=compliant)   89   57           27               4                1            31           0.0000  SIGNIFICANT (T53)
reviewer + guidelines             89   73           11               1                4            12           0.0063  SIGNIFICANT (T53)
two-sided judge (scored subset)   71   60           6                3                2            9            0.5078  not significant
two-sided judge (abstain=compl.)  89   78           6                3                2            9            0.5078  not significant
```

Context: v3's own 3 pairwise McNemar tests (T53 vs RAG p=0.344, T53 vs reviewer p=0.688, RAG vs reviewer
p=0.625, `results.md`) were ALL non-significant. Two of the three NEW comparisons here (linter, guidelines)
ARE significant, in T53's favor -- the first significant pairwise results in the whole B2 line. Read
carefully: the linter's significance rides on an abstaining baseline (37-63% coverage), and the guidelines
arm's significance is a same-decisions/same-diffs/same-model comparison against a worse PROMPT FRAME for
the same read-everything idea, not evidence T53 beats a fundamentally different class of system.

## Reading this plainly

A rule linter, compiled honestly from these 51 real ADRs' prose text with zero model calls, catches almost
nothing (3-6% recall) because these decisions are policy judgments, not import-graph rules -- this directly
answers D92's "why not a linter?" with a real number instead of an assumption. A CodeRabbit-style "all
decisions are standing guidelines" reviewer prompt is measurably WORSE than the existing RAG-style "find
the relevant one" prompt on the exact same decisions and diffs (65.9% vs 76.3% precision, 25% vs 15% false
alarms) -- a genuinely informative finding about PROMPT FRAMING for review agents, independent of Mole. The
two-sided-judge variant, run as a single-call stand-in (not Wealthfront's 3-call architecture) on T53's own
routed candidates, does NOT show Wealthfront's reported "more true positives, fewer false positives" --
recall fell from 96.6% to 82.8%, with only a modest false-alarm improvement (6.7% to 5.0%), and the
McNemar comparison to T53 is not significant (p=0.508). None of this changes v3's own headline (T53 vs RAG
vs reviewer still non-significant, still underpowered per the pre-registered note) -- these are 3 NEW,
separate comparisons, added descriptively as the brief specified.

## Limits

```notes
single run               same as every other B2 arm so far: one run per case per arm, no repeat-run
                            variance measurement.
linter is one compiler   only one rule-compilation design was tried (regex patterns over decision_text);
                            a more sophisticated compiler (e.g. one that also checks for the CHOSEN term's
                            presence, not just the rejected term's absence) might score differently --
                            not tried here, scope was "small" per `19 Can it stand up.md`'s own sizing.
guidelines arm framing   only ONE guideline framing was tried (CodeRabbit's "standing guidelines,
                            always-on"); other CodeRabbit features (path_instructions scoping, severity
                            tiers) were not reproduced.
two-sided judge is       stated above and in prior-art.md: single hermes call simulating 3 roles, not
scoped down                3 separate calls with an impartial top-level agent free to explore further.
                            Cost/latency numbers reflect the scoped-down version, not a faithful Iris
                            reproduction; a 3-call version is real future work (not started here).
router's own 18/89       inherited limitation: the judge's 20% abstention comes entirely from T53's own
zero-candidate rate        semantic router returning 0 candidates on those cases (frozen v2 params, no
                            re-tuning) -- a fix there (if any) is T53's scope, not this baseline's.
```
