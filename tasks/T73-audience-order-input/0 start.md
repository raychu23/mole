---
state: submitted
owner: hermes-build
repo: /Users/a1/Desktop/CS Code/Project/Mole
branch: ledger/t73-audience-order-input
worktree: /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T73-audience-order-input
base:
reviewer:
updated: 2026-11-03 05:04
status: ledger submitted
next: fresh reviewer → ledger move <task> verified --reviewer … --findings …
claimed: 2026-11-03 02:53
---
```notes
T73-audience-order-input      ledger task (rules.md §3 code features)      project tasks
    goal                    Let a person set and compare the audience/value order (tenet ranking per phase) from the IDE and CLI: `mole priorities set --phase P --order a,b,c` writes .mole/priorities.md (a human act, never MCP), and the VS Code reasoning section shows the order in force and offers a what-if 'compare with order X' that runs proposals compare under that order without writing. Also align mole_priorities' bare default with today's phase (backlog priorities-default).
    done-when               1 prior-art note (Bench-Capon VAF audiences, Carneades proof standards/audiences, VS Code quick-pick UX guideline) · 2 tests first · 3 set writes valid priorities.md that T60's parser reads back identically · 4 what-if compare under a given order without writing files (git status clean) · 5 panel shows order + what-if result (screenshot via scripts/panel-screenshot.mjs on the t61 replay copy) · 6 decisions + vscode + mcp tests pass
    status                  2026-11-03 submitted      report: tasks/T73-audience-order-input/2 insights.md, proof 4 log/reasoning-whatif-panel.png · checks exit 0
    next                    fresh reviewer → ledger move <task> verified --reviewer … --findings …
    pinned
    mode                    one worker
    boundary                packages/decisions/src/priorities.ts, packages/proposals, daemon cli, apps/vscode (reasoning section), tests
    checks                  npm run check
    non-goals               anything outside boundary
    proof                   4 log/
    stop                    any write from MCP or from the panel's what-if
    came from               inventory F49; backlog value-order next slice + priorities-default
    links                   4 log/ledger.md (every transition + its evidence)
    harness
```
