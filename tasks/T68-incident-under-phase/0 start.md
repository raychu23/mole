---
state: integrated
owner: hermes-build
repo: /Users/a1/Desktop/CS Code/Project/Mole
branch: ledger/t68-incident-under-phase
worktree: /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T68-incident-under-phase
base:
reviewer: hermes-subagent deleg_34eee310 PASS (fresh, claude-sonnet-5)
updated: 2026-11-03 04:04
status: ledger integrated
next: record outcome → ledger move <task> done --outcome … --resources … --prevents …
claimed: 2026-11-03 01:54
---
```notes
T68-incident-under-phase      ledger task (rules.md §3 code features)      project tasks
    goal                    Incident suggestions and proposal comparison respect the phase in force (T60 priorities) instead of plain Dung, so a revival real under the current phase is found; which phase applies and whether accept freezes it is chosen from prior art and recorded as a reversible default (D93).
    done-when               1 tests first · 2 the T61 replay case (best-effort vs parallel tags) finds the revival under the phase in force, plain-Dung result shown beside it · 3 mole incident suggest / proposals compare / MCP tools take --at/--phase, default today's phase · 4 decisions + mcp + proposals tests pass
    status                  2026-11-03 integrated      merge 662e57e, main 91aec47 full check 1133 pass 0 fail (/Users/a1/.hermes/cache/scratch/mole-build/main-check-waveA.txt
    next                    record outcome → ledger move <task> done --outcome … --resources … --prevents …
    pinned
    mode                    one worker
    boundary                packages/decisions/src/{incidents,priorities.ts}, packages/proposals, packages/mcp/src/reasoning-tools.ts, tests
    checks                  npm run check
    non-goals               anything outside boundary
    proof                   4 log/
    stop                    T58 and T62 cannot be reconciled -> show both side by side, never pick silently
    came from               backlog incident-under-phase (T62 found); inventory F58
    links                   4 log/ledger.md (every transition + its evidence)
    harness
```
