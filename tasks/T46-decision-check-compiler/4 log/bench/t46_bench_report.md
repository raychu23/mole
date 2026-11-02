# T46 bench report: compile-at-capture + cascade vs the LLM reviewer (dev-gated, held-out once)

Losses first (per this project's own R6 convention). n=8 dev / 8 held-out (M2's own 16-case split; wide intervals,
see m2-conflict/protocol.md). Scripts + raw rows: `4 log/bench/` (`compile_adrs.mjs`, `correct_dev_scope.mjs`,
`correct_dev_match.mjs`, `run_cascade.mjs`, `cascade_dev_results.json`, `cascade_heldout_results.json`). Real
`hermes -z ... -m claude-sonnet-5 --provider anthropic --safe-mode --usage-file` calls throughout (same shape as
M2's own `run_llm_arms.py`); every cost figure below is a real recorded token cost, nothing estimated.

## Losses

```notes
held-out false-alarm did NOT improve on the LLM reviewer   0.50 [adr010-compliant, adr007-compliant false-flagged]
                                                            vs the LLM reviewer's own 0.50 on the SAME split
                                                            [adr007-compliant, adr014-compliant] -- same rate,
                                                            different specific cases. The compiler's one-shot,
                                                            text-only draft for the held-out ADRs (005, 014) carried
                                                            over the exact vocabulary-overlap trap results.md
                                                            already documented for the SHIPPED anchors (adr007's msw
                                                            pattern also matches correct msw usage; here adr010's
                                                            luxon/moment pattern matches a compliant case too) --
                                                            drafting from ADR text alone does not, on its own, avoid
                                                            this failure mode; see prior-art.md's 2602.07609 note.
held-out mean cost/check is 58% of the LLM reviewer's,     $0.0025 vs $0.0043 -- better than paying for an LLM call
not <=25%                                                  on every check, but far short of the dev gate's 25%
                                                            bar. One case (heldout-adr005-violate) needed THREE
                                                            escalations (the shared catalog-model barrel file is in
                                                            scope for 3 decisions at once, none crisp), at $0.0199 --
                                                            almost the entire held-out cost total by itself.
the dev gate's $0 cost depended on a human correction      the v1 model draft guessed the wrong barrel-file path
informed by the dev cases' own diffs, not just ADR text    (packages/catalog-model/src/index.ts vs the real
                                                            packages/catalog-model/src/entity/index.ts) and needed a
                                                            second, diff-informed scope fix plus a hand-added crisp
                                                            content anchor before it reached $0/recall 1.00/FA 0.
                                                            That correction is explicitly IN BOUNDS (compile-at-
                                                            capture's whole point is "a person approves/edits"), and
                                                            it only ever used the DEV cases (never held-out, per the
                                                            task's own rule) -- but it means the dev number is a
                                                            ceiling the system reaches WITH a careful reviewer in the
                                                            loop, not what the model alone produces from ADR text.
```

## Numbers (recall / false-alarm / mean cost per check), vs the LLM reviewer on the SAME cases

```notes
split      arm                recall           false-alarm       mean cost/check    zero-LLM share
dev (n=8)  llm-reviewer        1.00 (4/4)       0.00 (0/4)        $0.0053            0% (oracle: always 1 call)
dev (n=8)  T46 cascade         1.00 (4/4)       0.00 (0/4)        $0.0000 (0%)       100% (8/8 zero-LLM tier)
heldout(8) llm-reviewer        1.00 (4/4)       0.50 (2/4)        $0.0043            0%
heldout(8) T46 cascade         1.00 (4/4)       0.50 (2/4)        $0.0025 (58%)      88% (7/8 zero-LLM; 1 case,
                                                                                      3 escalations)
mole (shipped, before T46)     0.50 (M2 n=16)   0.25 (M2 n=16)    $0                 100% (no LLM tier exists yet)
```

## Done-when 5's dev gate (the actual pass/fail bar; held-out is reported, not gated, per the task contract)

```notes
recall >= LLM reviewer's minus 1 case     1.00 >= (1.00 - 1 case = 0.75)         PASS (exact match, not just within 1)
false alarms <= LLM reviewer's            0.00 <= 0.00                          PASS (exact match)
mean cost/check <= 25% of LLM reviewer    $0.0000 <= $0.00133 (25% of $0.0053)   PASS (0%, not just under 25%)
held-out untouched during the above       confirmed: adr005/adr014 records had no drafted/approved checks until
                                           AFTER the dev numbers above were final; see git history under
                                           4 log/bench/records/.mole/decisions/bs-adr00{5,14}.md (both dated after
                                           the dev correction scripts)
```

## What changed vs the shipped `mole pr-check` arm (recall 0.50, 8 of 16 Backstage ADRs with zero content-anchor
coverage), read plainly

```notes
dev split    compile-at-capture turned 2 previously-uncovered ADRs (adr002, adr009) into fully zero-LLM, zero-cost,
             crisp checks: a model draft (from the ADR text only) plus one human correction each (a barrel-file
             path fix, a content anchor) -- 2 LLM calls to draft ($0.034 + $0.026, one-time, at capture) replacing
             what would otherwise be a $0.0053/check-forever LLM reviewer call on every future PR touching that file.
held-out     the SAME process (model draft from ADR text, zero human correction -- the fair one-shot test) raised
             recall from governed-at-all 0%/0% (adr005, adr014 had zero anchors before T46) to 1.00/1.00, at a real
             cost (not $0, and one case needed 3 LLM calls) and without fixing the false-alarm rate the LLM
             reviewer already had on this split. The honest read: compile-at-capture's text-only draft reliably
             gets a decision FROM "no rule exists" TO "something governs it, right file" (the recall win generalizes);
             getting from there to a CRISP, zero-cost, low-false-alarm rule still usually needs the human review step
             the task contract calls for, not the model alone -- consistent with 2602.07609's own finding that
             explicit/code-inferable decisions are the model's strength and implicit ones are not (prior-art.md).
```
