---
state: prepared
owner: hermes-build
repo: /Users/a1/Desktop/CS Code/Project/Mole
branch: ledger/t97-benchmark-v4-blocking
worktree: /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T97-benchmark-v4-blocking
base: 980e6a6
reviewer:
updated: 2026-11-04 21:40
status: prepared + frozen + smoked; full run NOT LAUNCHED (needs Raymond's go on cost)
next: Raymond reviews smoke evidence, then launches with the command in 4 log/launch-command.md
claimed: 2026-11-04 20:55
---
```notes
T97-benchmark-v4-blocking     ledger task (wave G, "the measurement that matters next")     project tasks
    goal                    prepare, freeze and smoke-test protocol v4 of the T63 dcbench benchmark: test Mole
                            AS IT SHIPS NOW (D102 blocking hooks, T92 2df7a8f/0624e94) against R (same decisions
                            in CLAUDE.md), A optional. Protocol v3 (judge arm) is frozen but was never run and its
                            M arm (model judge) is now known-inert (results-mj.md: 0/24 flags while the scorer
                            saw 19/24 blocking violations) -- v4 supersedes it with the REAL blocking mechanism.
    done-when               protocol-v4.json written + frozen (sha256) · crisp-rule audit of all 15 seeded
                            decisions against Mole's actual `rules:` mechanism (forbid: import | call only --
                            no "require" kind exists) · M arm's .mole/decisions carries rules: on every decision
                            that audit found expressible, same decision text as R (fairness) · ONE real smoke run
                            per arm (R, M-block) on one task proving the Stop block fires / or a clean run ·
                            exact launch command returned · full run NOT launched
    status                  2026-11-04 prepared+frozen+smoked -- see 4 log/evidence.md
    next                    Raymond approves the cost (48 runs, ~8h) then runs 4 log/launch-command.md
    pinned
    mode                    one worker
    boundary                evals/inspect/dcbench_eval/experiments/protocol-v4.json (NEW spec, v3 untouched) +
                            scratch/dcbench-v4 (new pinned dcbench worktree, scratch/dcbench itself untouched) +
                            tasks/T97-benchmark-v4-blocking/
    checks                  targeted: python -m pytest evals/inspect/dcbench_eval/tests/test_protocol_v3.py -q
                            (unaffected -- v3 untouched); new freeze.py --check on protocol-v4.json
    non-goals               launching the 48-run pilot itself; editing protocol-v3.json; touching live .mole/
    came from               G-wave.md G2 (Raymond 11-04 21:30, "the measurement that matters next")
    links                   4 log/evidence.md, 4 log/launch-command.md, 4 log/prior-art.md
    harness
```
