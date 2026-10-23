---
state: verified
owner: unclaimed
repo: /Users/a1/Desktop/CS Code/Project/Mole
branch: ledger/t4-m15-agent-cost-check
worktree: /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T4-m15-agent-cost-check
base: 7d478ac
reviewer: subagent sa-0-9a319c86
updated: 2026-10-22 17:22
status: ledger verified
next: merge → ledger move <task> integrated --merge … (ledger reruns checks in the repo)
claimed: 2026-10-22 17:04
---
```notes
T4-m15-agent-cost-check      ledger task (rules.md §3 code features)      project tasks
    goal                    Plan M1.5 agent half: measure whether an agent with the mole_map MCP tool beats the same agent without it on code-comprehension tickets: total tokens, cost, wall time, correctness. Go/no-go for 'cheap for agents' before M2
    done-when               1) >=12 tickets on a real repo (ui-tui scratch copy) with ground truth from an independent source (TS language service findReferences/definitions + grep), spanning find-callers, impact/what-breaks, where-defined-and-what-it-calls, cross-file trace; tickets and answer keys written before any run and stored in packages/daemon/bench or generated data/m15-*; 2) harness runs claude -p (stream/json usage) per ticket in two conditions (A built-in tools only, B built-in + mole_map MCP), >=2 repetitions each, same model, fixed turn cap and budget cap, in a read-only scratch copy; 3) generated data/m15-agent-cost.json with per-run tokens (input, output, cache), cost, wall time, tool calls, correctness (precision/recall vs key), and per-condition medians + paired differences with spread; 4) written go/no-go recommendation with the numbers and the strongest alternative explanation (prompt wording, grep being good enough, MCP schema overhead), plan.json M1.5 result PROPOSED until Raymond accepts
    status                  2026-10-22 verified      reviewer subagent sa-0-9a319c86 · findings: 5 fixes: lenient T06/T07 + 11-ticket subset in grade.mjs, NO-GO softened to
    next                    merge → ledger move <task> integrated --merge … (ledger reruns checks in the repo)
    pinned
    mode                    code
    boundary                packages/daemon/bench/m15/** (new) · generated data/m15-* · plan.json M1.5 result only · scratch dirs outside the repo
    checks                  npm run check
    non-goals               no learner/junior study (needs people), no product code changes, never write into the ui-tui fixture or the user's real repos, no secrets in logs
    proof                   generated data/m15-agent-cost.json + npm run check + change-log entry in context/product-plan/0 start.md
    stop                    stop and report if total spend would exceed 15 USD, if runs cannot be isolated from the user's own Claude config/memory, or if ground truth cannot be made independent of Mole's own index
    came from               plan M1.5; USER 2026-10-20 'do recommended keep doing all the agents'
    links                   4 log/ledger.md (every transition + its evidence)
    harness                 any
```
