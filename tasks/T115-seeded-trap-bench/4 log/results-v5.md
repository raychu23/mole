## Summary

Phase 1 of queue item Q9 (T115-seeded-trap-bench), pre-registered as `evals/inspect/dcbench_eval/experiments/protocol-v5.json`
(frozen `protocol-v5.sha256` before any scored run, `freeze.py --check` passes). A NEW, purpose-built fixture
repo (`context/product-plan/systems/metrics-proof/productivity/seeded-trap-v5/repo`, pinned commit
`31e1443f12f075fd2963a3f5ef59fb736ecc00d7`) with 2 tasks, each seeded so that TWO existing sibling files
already use a deprecated helper/component with no in-file warning, and the prompt asks for a THIRD, similar
file while inviting stylistic consistency with those siblings -- without ever naming the deprecated symbol or
any decision. Arm A only (no CLAUDE.md, no `.mole/`, no Mole hooks), 2 tasks x 8 epochs = 16 runs, model
claude-sonnet-5 via `hermes -z --safe-mode`. Raw:
`context/product-plan/systems/metrics-proof/productivity/seeded-trap-v5/raw/runs-v5.jsonl`, 16 rows, all
`status: "ok"`.

**Pooled: 6 of 16 runs reproduced the seeded deprecated pattern, 37.5% (Wilson 95% CI [0.185, 0.614]).**
This clears the pre-registered 30% gate (`protocol-v5.json`'s decision rule, written before any run): **GATE
PASSED -- a powered R vs M-block comparison on this fixture is the next step**, not a redesign.

**Losses first.** The pooled pass is driven almost entirely by ONE of the two tasks: SEED-002 (loading
indicator) hit 6/8 = 75% on its own, while SEED-001 (date formatter) hit 0/8 -- the SAME asymmetric pattern
dcbench's own two crisp tasks showed in results-v4.1/v4.2 (TASK-013/PulseLoader fired more than
TASK-001/CalendarRange, though there it was 0/0). So this result is NOT "seeded traps generally produce a
usable base rate" -- it is "one specific trap design (an unlabeled legacy helper component reused by 2
sibling files, no more-salient approved name nearby) produced a usable base rate; a second trap design
(an unlabeled legacy date-formatting function) did not, even though it was built the same way." The pooled
30% gate is a measurement of THIS 2-task mix, not a property of "seeded traps" as a category, and the n=16
pooled CI is wide (18.5%-61.4%) -- a repeat pilot could plausibly land anywhere from ~20% to ~55%.

```notes
results v5 (phase 1)   (raw context/.../seeded-trap-v5/raw/runs-v5.jsonl, 16 rows, all status ok · model
                        claude-sonnet-5 via hermes --safe-mode · fixture pin 31e1443f · arm A only)
    primary (SEED-001 + SEED-002, 8 epochs each, arm A only, n = 16 pooled)
        SEED-001 (deprecated formatDateLegacy, 2 sibling precedents)   0/8 violated, Wilson 95% CI [0, 0.324]
        SEED-002 (deprecated LoadingDots, 2 sibling precedents)        6/8 violated, Wilson 95% CI [0.409, 0.929]
        POOLED                                                        6/16 violated = 37.5%, Wilson 95% CI [0.185, 0.614]
        decision rule (pre-registered, protocol-v5.json)               pooled point estimate 37.5% >= 30% -> GATE PASSED
    context (descriptive only, not the gate statistic)
        expectedFileTouched                                            16/16 (every run attempted the task;
                                                                        no "didn't attempt" confound like v3's marker issue)
        approvedMarkerUsed (used the modern replacement at all)        SEED-001 8/8 · SEED-002 2/8
        cost                                                           $0.859 total / 16 runs, mean $0.054/run
                                                                        (far cheaper than dcbench's ~$1.10/run:
                                                                        this fixture is a tiny uncompiled TS repo,
                                                                        no large app context to read)
        wall time                                                      547.2s total, mean 34.2s/run

losses first
    asymmetric trap                    the pooled 37.5% is driven entirely by SEED-002 (75%); SEED-001 scored
                                        0/8, identical to dcbench's TASK-001 finding -- this seeding METHOD does
                                        not guarantee a usable rate on every trap, only on this one so far
    small n, wide CI                   pooled Wilson CI [0.185, 0.614] spans both sides of the 30% gate itself;
                                        a repeat pilot could plausibly fail the same gate it just passed
    single model, single seed commit   no variation tested on sibling-file count, prompt phrasing, or how
                                        "salient" the approved replacement's naming is -- SEED-001's
                                        formatDate/formatDateLegacy naming may itself be an easier semantic
                                        cue toward the correct choice than SEED-002's LoadingDots/Spinner

what it means
    A seeded trap CAN clear the pre-registered 30% base-rate gate for testing Mole's blocking (D102), but
    only when the deprecated pattern is genuinely nondescript next to its sibling precedents (SEED-002's
    LoadingDots) -- not merely "deprecated and present nearby" in the abstract (SEED-001's formatDateLegacy
    failed the same way dcbench's own crisp tasks did). Phase 2 (R vs M-block, orchestrator-dispatched per
    queue item Q9) should be POWERED primarily off SEED-002's observed rate (75%, not the diluted 37.5%
    pooled figure) if SEED-001 is kept in the mix at all, or should replace SEED-001 with a second trap
    designed the way SEED-002 was before assuming 2 tasks is enough for a powered comparison.

claims
    allowed     "in a pre-registered 16-run seeded-trap base-rate pilot (arm A, no context), claude-sonnet-5
                 reproduced a seeded deprecated pattern 6/16 times pooled (37.5%, Wilson CI [0.185, 0.614]),
                 clearing the pre-registered 30% gate -- driven almost entirely by one of the two seeded
                 tasks (75% vs 0%)"
    forbidden   any claim that seeded traps in general produce a usable base rate (n=2 tasks, 1 of 2 worked);
                any claim that Mole's blocking (D102) helps or hurts productivity or compliance (this spec has
                no M-block arm); any claim this pins down the true seeded base rate precisely (CI spans
                18.5%-61.4%)
```
