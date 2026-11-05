---
status (11-05)   MERGED into main 6f788a1 · pilot launched 11-05 05:05, screen t107-v4.2-pilot · older status lines below are history
state: prepared
owner: hermes-build
repo: /Users/a1/Desktop/CS Code/Project/Mole
branch: ledger/t107-benchmark-v42-base-rate
worktree: /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T107-benchmark-v42-base-rate
base: d97bdea
reviewer: not yet requested
updated: 2026-11-05 14:40
status: v4.2 prepared + frozen + smoked; full run NOT LAUNCHED (needs Raymond's go)
next: Raymond reviews v4.2 smoke evidence, then launches with the command in 4 log/launch-command.md
claimed: 2026-11-05 08:30
---
```notes
T107-benchmark-v42-base-rate     ledger task (wave G follow-up: v4.1's own next step)     project tasks
    goal                    measure the BASE RATE of the two dcbench crisp mistakes (D-001 CalendarRange,
                            D-005 PulseLoader) with NO context at all (arm A), 8 epochs each on TASK-001/
                            TASK-013 (16 runs), per results-v41.md's own "what's open" item: v4.1 found
                            0/32 crisp-task violations in EITHER arm (R, M-block), so D102 blocking was
                            never exercised and that pilot cannot say whether blocking helps or hurts.
    done-when               protocol-v4.2.json written + frozen (sha256, freeze.py --check passes) ·
                            spec.py's arms>=2 requirement loosened to arms>=1 for this legitimate
                            single-arm design (test_single_arm_spec_freezes / test_zero_arm_spec_refused
                            added) · run_dcbench_v42.py (NEW file, copy of frozen run_dcbench_v4.py +
                            arm "A") and score-v42.mjs (NEW file, copy of frozen score.mjs + arm-setup-file
                            exclusion) · both runner+scorer hashes frozen in
                            protocol-v4.2.tooling-sha256.txt · ONE real smoke run (arm A, TASK-001) ·
                            exact launch command for the 16-run pilot returned · full run NOT launched
    status                  2026-11-05: prepared, frozen, smoke-tested with one real hermes -z call.
                            Smoke result: TASK-001, arm A, mergeReady, D-001 gotcha PASSED (agent used
                            DateRangePicker correctly, no CalendarRange import) -- consistent with v4.1's
                            finding that this model does not make the crisp mistake easily, but n=1 proves
                            nothing on its own; the full 16-run pilot is needed for the decision rule.
    next                    Raymond approves the ~2.2h / 16-run / ~$23 cost (4 log/launch-command.md) and
                            launches it, or requests a review of v4.2 first.
    pinned
    mode                    one worker
    boundary                evals/inspect/dcbench_eval/experiments/protocol-v4.2.json (NEW spec,
                            v2/v3/v4/v4.1 all untouched) + evals/inspect/dcbench_eval/spec.py (arms>=1,
                            backward compatible) + context/.../scripts/run_dcbench_v42.py,
                            score-v42.mjs (NEW files; run_dcbench_v4.py, score.mjs untouched, hashes
                            still match protocol-v4.1.tooling-sha256.txt) + tasks/T107-benchmark-v42-base-rate/.
                            scratch/dcbench-v4 and the T97 worktree's frozen tooling reused READ-ONLY.
    checks                  targeted: python3 -m pytest evals/inspect/dcbench_eval/tests/test_freeze.py
                            evals/inspect/dcbench_eval/tests/test_v42_score_exclude_setup_files.py -q
                            (8 passed) · freeze.py --check experiments/protocol-v4.2.json passes · ONE
                            real smoke run (TASK-001, arm A) through run_dcbench_v42.py --tasks TASK-001
                            --epochs 1 --arms A
    non-goals               launching the 16-run pilot itself; editing protocol-v4.json/v4.1.json/score.mjs/
                            run_dcbench_v4.py; touching scratch/dcbench-v4's pinned repo/mole-pinned or the
                            T97 worktree's frozen context/ files; npm run check (no TS package touched)
    came from               results-v41.md's "what it means -> next" line (Raymond-approved wave-G-overnight
                            continuation, brief G-wave.md)
    links                   4 log/evidence.md, 4 log/launch-command.md, evals/inspect/dcbench_eval/
                            experiments/protocol-v4.2.json
    harness
```
