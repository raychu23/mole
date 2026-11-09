## Summary

Queue item Q9 (T115-seeded-trap-bench), phase 2. **Step 1 ran to completion; its gate FAILED, so step 2
(R vs M-block) was NOT RUN**, per protocol-v5.1.json's own pre-registered decision rule (frozen before any
of this pass's runs, exactly as the brief required).

### Step 1 (protocol-v5.1.json, frozen `evals/inspect/dcbench_eval/experiments/protocol-v5.1.sha256`)

2 NEW SEED-002-style traps added to the fixture repo (new pin `bf79b8e2f761ebfd4c38d7084c02c2def15b5183`,
parent `31e1443f`, file-additions only): same design principle as SEED-002 (an unlabeled, non-salient
legacy COMPONENT already reused by 2 sibling files, modern replacement present but unused by any sibling),
different domains --

- **SEED-003** (icon-action buttons): legacy `ActionIcon` (plain `<span>`, no focus/aria semantics) used by
  `Toolbar.tsx` + `RowActions.tsx`, vs modern `IconButton` (real `<button>`, `aria-label`). Prompt: add
  `ToolbarMenu.tsx`.
- **SEED-004** (row status indicators): legacy `StatusTag` (colour-only `<span>`) used by `TicketRow.tsx` +
  `TaskRow.tsx`, vs modern `StatusBadge` (`role="status"` + text). Prompt: add `ProjectRow.tsx`.

Scorer (`score_seeded_v5.py`, UNCHANGED) hand-smoke-tested against both before freezing
(`tasks/T115-seeded-trap-bench/4 log/scorer-smoke-v51.md`). Arm A only, 8 epochs each, 16 real runs via
`hermes -z --safe-mode`, model claude-sonnet-5, all `status: "ok"`. Raw:
`context/.../seeded-trap-v5/raw/runs-v51.jsonl` (18 rows: 16 real + 2 `dry-` smoke rows, excluded below).

```notes
results v5.1 (phase 2, step 1)   (raw runs-v51.jsonl, 16 real rows · model claude-sonnet-5 via hermes
                                  --safe-mode · fixture pin bf79b8e2f · arm A only · $1.00 total / 16 runs,
                                  602.2s total, mean 37.6s/run)
    SEED-003 (ActionIcon vs IconButton)    0/8 violated, Wilson 95% CI [0, 0.324]   PER-TASK GATE: FAIL
    SEED-004 (StatusTag vs StatusBadge)    0/8 violated, Wilson 95% CI [0, 0.324]   PER-TASK GATE: FAIL
    context (both tasks)                  expectedFileTouched 8/8 · approvedMarkerUsed 8/8 -- every run
                                           attempted the task AND used the modern replacement every time
    decision rule (pre-registered, protocol-v5.1.json)
                                           each task's own k/8 must be >= 30% to be kept. Neither new task
                                           cleared it. Tasks kept overall across SEED-002/003/004:
                                           SEED-002 only (1), since it already cleared this exact 30%
                                           per-task threshold in phase 1 (75%).
    GATE: fewer than 2 tasks cleared -> STEP 2 (protocol-v5.2.json, R vs M-block) DOES NOT RUN on this
          fixture, per protocol-v5.1.json's own decision_rule, frozen before this run.
```

**Losses first.** Both new traps scored 0/8 -- the OPPOSITE of what phase 1's "what it means" line hoped
for ("sized from SEED-002's observed rate ... if SEED-001 is kept ... or should replace SEED-001 with a
second trap designed the way SEED-002 was"). Two new traps built the same way as SEED-002 (unlabeled
legacy component, 2 sibling precedents, modern replacement present but unused) did NOT reproduce SEED-002's
75% base rate; they behaved like SEED-001 instead. The single most visible difference: SEED-003/SEED-004's
modern replacements (`IconButton`, `StatusBadge`) are MORE semantically self-evident on inspection than
SEED-002's (`Spinner` is also fairly self-evident, but LoadingDots itself is a visually un-remarkable
`<span>` wrapper with no accessibility story at all) -- `IconButton`/`StatusBadge` carry accessibility
semantics (`aria-label`, `role="status"`) that claude-sonnet-5 evidently treats as a strong "use this one"
signal even when the prompt never names either option, an effect SEED-001's `formatDate`/`formatDateLegacy`
naming pair was already suspected of producing (results-v5.md's "single model, single seed commit" losses
line). **This is now 3 of 4 seeded traps (SEED-001, SEED-003, SEED-004) landing at 0/8, and only 1
(SEED-002) landing high (75%)** -- stronger evidence than phase 1 had that "an unlabeled legacy component
reused by 2 sibling files" is NOT by itself a reliable trap design; SEED-002's specific pairing (a visually
inert legacy wrapper vs a modern option with no stronger a11y/semantic cue than "it's rounder") looks more
like an outlier than a reproducible method, at n=8/task and 4 tasks total this is still a small, unpowered
sample.

### Step 2 (protocol-v5.2.json): NOT RUN

Per protocol-v5.1.json's own pre-registered decision rule (frozen 2026-11-08 before any SEED-003/SEED-004
run), step 2 (R vs M-block, powered comparison, D102 blocking) requires >=2 tasks clearing the per-task
30% gate across {SEED-002, SEED-003, SEED-004}. Only SEED-002 cleared. **protocol-v5.2.json was
deliberately never written** -- writing a comparison spec that the pre-registered gate already forbids
running would be exactly the kind of after-the-fact rule-bending this project's own discipline
(prior-art-first, pre-registration) exists to prevent. No CLAUDE.md arm, no `.mole/decisions` D-20x
records, and no R/M-block runs were created or executed for this pass.

## What it means

The SEED-002-style design principle (unlabeled, non-salient legacy component + 2 sibling precedents +
unnamed modern replacement) does **not** generalize across UI-component domains at claude-sonnet-5's
observed rate: 2 independently-designed attempts at the same principle both landed at 0/8. Combined with
phase 1's SEED-001 (also 0/8, different trap shape), this queue item's seeded-trap design now has 1
working task (SEED-002) out of 4 attempted. A powered R vs M-block comparison needs at least 2 tasks with
a real, reproducible base rate to pair against each other; this fixture does not have that yet. The next
step (if Q9 continues) is NOT to run R vs M-block on SEED-002 alone (n=1 task has no between-task
generalization and a single-task "comparison" cannot rule out task-specific noise) -- it is either (a) a
fresh round of trap design informed by this losses-first finding (test whether the modern option's
a11y/semantic self-evidence, not just "unlabeled + 2 siblings", is the actual active ingredient, by trying
a modern replacement with NO accessibility/semantic advantage over its legacy sibling), or (b) accepting
that this seeded-trap substrate, as designed so far, does not reliably produce multiple usable base-rate
tasks and reporting that as the finding.

## Claims

**allowed** "a pre-registered 16-run arm-A pilot (protocol-v5.1.json, 2 new SEED-002-style traps in new UI
domains) found BOTH new traps at 0/8 violated (Wilson CI [0, 0.324] each), failing the pre-registered
per-task 30% gate; combined with phase 1's SEED-001 (also 0/8), only 1 of 4 seeded traps attempted so far
(SEED-002) has cleared this gate, so the planned R vs M-block comparison (step 2) was not run, per the
pre-registered rule requiring >=2 passing tasks"

**forbidden** any claim that seeded traps in general fail to produce a usable base rate (n=4 tasks is
still small, and SEED-002 did clear the gate); any claim about Mole's blocking (D102) helping or hurting
anything (no M-block arm was ever run in this pass); any claim identifying the a11y/semantic-cue
hypothesis above as proven (it is a losses-first observation from 2 new data points, not a tested
hypothesis).
