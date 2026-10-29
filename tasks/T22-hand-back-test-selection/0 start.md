---
state: integrated
owner: mole-builder-5
repo: /Users/a1/Desktop/CS Code/Project/Mole
branch: ledger/t22-hand-back-test-selection
worktree: /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T22-hand-back-test-selection
base: 70a2989
reviewer: reviewer-T22-r3
updated: 2026-10-29 09:51
status: ledger integrated
next: record outcome → ledger move <task> done --outcome … --resources … --prevents …
claimed: 2026-10-29 05:08
---
```notes
T22-hand-back-test-selection      ledger task (rules.md §3 code features)      project tasks
    goal                    At hand-back (Claude Code Stop hook / mole check), run only the tests that matter for this change: the guarding tests of every past fix whose lines it edits (T12) plus tests that reach the edited functions through the call graph, and report pass/fail beside the past-fix lines; the model never decides which tests run
    done-when               1) mole check --run-tests selects tests by fix lineage + call-graph reachability and runs them with the repo's runner (vitest first); 2) M14 bench: 10 planted regressions in Mole + Excalidraw (key written before the code) → catches >= 9 of 10 while running <= 1/3 of the tests that transitively reach the change (Meta's predictive test selection reference point: >99.9% of regressions at 1/3 of tests); baseline rows for 'run all' and 'run none'; 3) failure case: no test reaches the change → says so, suggests the nearest guarding test, exit 0; 4) npm run check passes
    status                  2026-10-29 integrated      merge 2cdf9ec · combined checks exit 0 · note: npm run check on main → 294/294 passed, exit 0, node packages/verify/dist
    next                    record outcome → ledger move <task> done --outcome … --resources … --prevents …
    pinned
    mode                    code
    boundary                packages/verify/** (new: test selection), packages/history/src (read-only use, export a helper only if needed), packages/daemon/src/cli.ts (register the subcommand with one import + one call only), plugins/claude-code/** (Stop hook output line only), tasks/T22-hand-back-test-selection/**
    checks                  npm run check && node packages/verify/dist/bench/m14.js
    non-goals               no PR comments/bot (D24) · no structure-map work (D23) · prototype/ rejected · no publishing or pushing · Raymond's accounts never used · no paid API or model calls from Mole code · don't edit benchmark keys after the red-tests commit (R2) · shared registries (MCP tool list, CLI usage, workspace deps) tested with toContain, never an exact set
    proof                   runs.jsonl last line with the metric + npm run check output + the red-tests commit sha dated before the first implementation commit + the fresh reviewer's verdict
    stop                    same check failure 3 rounds in a row (R3) · needs Raymond's accounts, paid API spend, people or a product decision (log it in 4 log, move on to the next task)
    came from               USER 2026-10-29 06:15 pasted vertical-AI chat ('does this info add anything useful … critically understand and expand') · Vertical AI chat, checked.md · D29
    links                   4 log/ledger.md (every transition + its evidence)
    harness                 hermes
```
