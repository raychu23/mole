---
state: proposed
owner:
repo:
branch:
worktree:
base:
reviewer:
updated: 2026-10-23 04:09
status: ledger proposed
next: fill owner + done-when + boundary + checks + non-goals + proof + stop → ledger move <task> ready
---
```notes
T6-m15b-agent-cost-excalidraw      ledger task (rules.md §3 code features)      project tasks
    goal                    Rerun the M1.5 agent-cost comparison where the tool should help: impact, call-path and alias/barrel tickets on excalidraw (672 files) with the T4 harness, 3 conditions, 3 reps
    done-when               tickets + keys from the language service on excalidraw (d3a9c2a195), >=3 tickets per type incl. alias/barrel, same briefs/grader, results generated data/m15b-agent-cost.json, honest report vs T4
    status                  2026-10-23 proposed
    next                    fill owner + done-when + boundary + checks + non-goals + proof + stop → ledger move <task> ready
    pinned
    mode                    code
    boundary                packages/daemon/bench/m15/** and generated data/m15b-*
    checks                  npm run check
    non-goals               no product changes; queued behind T5
    proof                   generated data + npm run check
    stop                    spend over 15 USD
    came from               T4 review; USER 2026-10-22
    links                   4 log/ledger.md (every transition + its evidence)
    harness                 any
```
