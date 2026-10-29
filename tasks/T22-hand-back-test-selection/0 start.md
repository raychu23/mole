---
state: proposed
owner:
repo: /Users/a1/Desktop/CS Code/Project/Mole
branch:
worktree:
base:
reviewer:
updated: 2026-10-29 01:20
status: ledger proposed
next: fill owner + done-when + boundary + checks + non-goals + proof + stop → ledger move <task> ready
---
```notes
T22-hand-back-test-selection      ledger task (rules.md §3 code features)      project tasks
    goal                    At hand-back (Claude Code Stop hook / mole check), run only the tests that matter for this change: the guarding tests of every past fix whose lines it edits (T12) plus tests that reach the edited functions through the call graph, and report pass/fail beside the past-fix lines; the model never decides which tests run
    done-when               1) mole check --run-tests selects tests by fix lineage + call-graph reachability and runs them with the repo's runner (vitest first); 2) M14 bench: 10 planted regressions in Mole + Excalidraw (key written before the code) → catches >= 9 of 10 while running <= 1/3 of the tests that transitively reach the change (Meta's predictive test selection reference point: >99.9% of regressions at 1/3 of tests); baseline rows for 'run all' and 'run none'; 3) failure case: no test reaches the change → says so, suggests the nearest guarding test, exit 0; 4) npm run check passes
    status                  2026-10-29 proposed
    next                    fill owner + done-when + boundary + checks + non-goals + proof + stop → ledger move <task> ready
    pinned
    mode                    code
    boundary
    checks
    non-goals
    proof
    stop
    came from               USER 2026-10-29 06:15 pasted vertical-AI chat ('does this info add anything useful … critically understand and expand') · Vertical AI chat, checked.md · D29
    links                   4 log/ledger.md (every transition + its evidence)
    harness                 hermes
```
