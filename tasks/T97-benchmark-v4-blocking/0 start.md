---
state: prepared
owner: hermes-build
repo: /Users/a1/Desktop/CS Code/Project/Mole
branch: ledger/t97-benchmark-v4-blocking
worktree: /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T97-benchmark-v4-blocking
base: 980e6a6
reviewer: deleg_b40d00a6 (round 1: FIX, applied; round 2: not yet requested)
updated: 2026-11-05 04:20
status: v4.1 prepared + frozen + smoked (round-1 FIX applied); full run NOT LAUNCHED (needs Raymond's go on cost)
next: Raymond reviews v4.1 smoke evidence, then launches with the command in 4 log/launch-command.md
claimed: 2026-11-04 20:55
---
```notes
T97-benchmark-v4-blocking     ledger task (wave G, "the measurement that matters next")     project tasks
    goal                    prepare, freeze and smoke-test protocol v4 of the T63 dcbench benchmark: test Mole
                            AS IT SHIPS NOW (D102 blocking hooks, T92 2df7a8f/0624e94) against R (same decisions
                            in CLAUDE.md), A optional. Protocol v3 (judge arm) is frozen but was never run and its
                            M arm (model judge) is now known-inert (results-mj.md: 0/24 flags while the scorer
                            saw 19/24 blocking violations) -- v4 supersedes it with the REAL blocking mechanism.
    done-when               protocol-v4.1.json written + frozen (sha256, default `freeze.py --check` passes) ·
                            round-1 review FIXes applied: score.mjs stages git add --intent-to-add before
                            diffing (proven against real D-001 gotcha) · Mole pinned for the whole run from a
                            built release/mole-code tarball (not the live repo) · TASK-001/TASK-013 (the only
                            2 of 8 tasks with a crisp rule) made the PRIMARY outcome, all 8 descriptive-only
                            secondary · ONE real smoke run per arm (R, M-block) on TASK-013 through the
                            updated runner, scorer confirmed seeing new files, hook confirmed resolving the
                            pinned Mole (not live repo) · exact launch command returned · full run NOT launched
    status                  2026-11-05 round-1 review (deleg_b40d00a6) returned FIX before any scored run;
                            applied all 5 required changes, re-smoked on TASK-013 -- see 4 log/evidence.md
    next                    Raymond approves the cost (44 runs, ~7.3h) then runs 4 log/launch-command.md
                            (or requests a round-2 adversarial check of v4.1 first)
    pinned
    mode                    one worker
    boundary                evals/inspect/dcbench_eval/experiments/protocol-v4.1.json (NEW spec, v3/v4 untouched) +
                            scratch/dcbench-v4 (pinned dcbench worktree + mole-pinned/ Mole install, scratch/dcbench
                            itself untouched) + tasks/T97-benchmark-v4-blocking/
    checks                  targeted: python3 -m pytest evals/inspect/dcbench_eval/tests/test_v4_score_intent_to_add.py -q
                            (2 passed, real D-001 gotcha against the pinned dcbench repo) · freeze.py --check
                            experiments/protocol-v4.1.json (default invocation, no --frozen flag) passes
    non-goals               launching the 44-run pilot itself; editing protocol-v3.json/protocol-v4.json; touching live .mole/
    came from               G-wave.md G2 (Raymond 11-04 21:30) + round-1 review deleg_b40d00a6 (2026-11-04 22:02, FIX)
    links                   4 log/evidence.md, 4 log/launch-command.md, 4 log/prior-art.md
    harness
```
