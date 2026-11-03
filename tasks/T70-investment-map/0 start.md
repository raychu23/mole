---
state: verified
owner: hermes-build
repo: /Users/a1/Desktop/CS Code/Project/Mole
branch: ledger/t70-investment-map
worktree: /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T70-investment-map
base:
reviewer: hermes-subagent deleg_34eee310 FAIL then deleg_f93d50cf PASS (fresh, claude-sonnet-5)
updated: 2026-11-03 04:17
status: ledger verified
next: merge → ledger move <task> integrated --merge … (ledger reruns checks in the repo)
claimed: 2026-11-03 01:54
---
```notes
T70-investment-map      ledger task (rules.md §3 code features)      project tasks
    goal                    Rank code areas to pay down from data Mole already has (D68): churn x complexity hotspots (Tornhill/code-maat) x decision volatility (temporal revisions) x incident/fix density (history), as `mole hotspots` (CLI + read-only MCP tool), each rank explained by its four inputs.
    done-when               1 prior-art note (Tornhill, code-maat, Nagappan & Ball churn) · 2 tests first on a fixture repo · 3 run on Mole's own repo: top 10 with inputs in 4 log · 4 touched packages' tests pass
    status                  2026-11-03 verified      reviewer hermes-subagent deleg_34eee310 FAIL then deleg_f93d50cf PASS (fresh, claude-sonnet-5) · findings: R1: any-zero
    next                    merge → ledger move <task> integrated --merge … (ledger reruns checks in the repo)
    pinned
    mode                    one worker
    boundary                packages/history or new packages/hotspots, daemon cli, mcp tool, tests
    checks                  npm run check
    non-goals               anything outside boundary
    proof                   4 log/
    stop                    ranking not explainable by its inputs
    came from               D68 build 2nd after T17; inventory F65
    links                   4 log/ledger.md (every transition + its evidence)
    harness
```
