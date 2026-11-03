---
state: running
owner: hermes-build
repo: /Users/a1/Desktop/CS Code/Project/Mole
branch: ledger/t79-h2-test-selection-number
worktree: /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T79-h2-test-selection-number
base:
reviewer:
updated: 2026-11-03 07:03
status: ledger running
next: worker finishes → ledger move <task> submitted --report … (ledger runs the checks row)
claimed: 2026-11-03 07:03
---
```notes
T79-h2-test-selection-number      ledger task (rules.md §3 code features)      project tasks
    goal                    Resolve D52: the H2 head-to-head (hand-back test selection, packages/verify/src/testmap.ts vs named baselines, packages/bench/src/h3-baselines.ts + scoreboard) reports internally inconsistent numbers (18.5% vs 1347.5%). Reproduce from the frozen inputs, find the arithmetic or definition bug, fix the bench (not the product unless the product is wrong, then a separate commit with its own test), and report the corrected metric with the field's standard names (test impact analysis / regression test selection: inclusiveness = recall of failing tests, selection size %, time saved; cite RTS papers e.g. Ekstazi, STARTS, Gligoric/Legunsen).
    done-when               1 prior-art note naming the standard RTS metrics with sources · 2 a failing test reproducing the inconsistency (red) · 3 fixed, corrected numbers in 4 log/results.md with the old vs new and why · 4 bench + verify tests pass
    status                  2026-11-03 running      worktree /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T79-h2-test-selection-number · branch ledger/t79-h2-test-selec
    next                    worker finishes → ledger move <task> submitted --report … (ledger runs the checks row)
    pinned
    mode                    one worker
    boundary                packages/bench, packages/verify (only if the product is wrong), tests
    checks                  npm run check
    non-goals               anything outside boundary
    proof                   4 log/
    stop                    a corrected number that is not reproducible from committed inputs
    came from               D52; inventory F34/F15
    links                   4 log/ledger.md (every transition + its evidence)
    harness
```
