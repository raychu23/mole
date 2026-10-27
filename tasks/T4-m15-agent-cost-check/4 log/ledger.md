```notes
ledger (newest last, nothing deleted)
    2026-10-22 17:04      new → proposed      Plan M1.5 agent half: measure whether an agent with the mole_map MCP tool beats the same agent without it on code-comprehension tickets: total tokens, cost, wal
    2026-10-22 17:04      proposed → ready      owner unclaimed
    2026-10-22 17:04      ready → running      worktree /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T4-m15-agent-cost-check · branch ledger/t4-m15-agent-cost-check · base 7d478ac
    2026-10-22 17:16      running → submitted      report: 78 runs graded, data generated data/m15-agent-cost.json, finding: no measurable agent-cost benefit on ui-tui, signal only on impact tickets, commit bbd0a3a, npm run check 49 passed · checks exit 0
    2026-10-22 17:16      checks ran: npm run check in /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T4-m15-agent-cost-check → exit 0 ((Use `node --trace-warnings ...` to show where the warning was created))
    2026-10-22 17:22      submitted → verified      reviewer subagent sa-0-9a319c86 · findings: 5 fixes: lenient T06/T07 + 11-ticket subset in grade.mjs, NO-GO softened to not-demonstrated, 2 tickets x 2 reps + sign test p~0.125, isolation/cap limits disclosed, change-log
    2026-10-22 17:22      checks ran: npm run check in /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T4-m15-agent-cost-check → exit 0 ((Use `node --trace-warnings ...` to show where the warning was created))
    2026-10-22 17:22      verified → integrated      merge ac6ab19 Merge branch ledger/t4-m15-agent-cost-check into main · combined checks exit 0
    2026-10-22 17:22      combined checks ran: npm run check in /Users/a1/Desktop/CS Code/Project/Mole → exit 0 ((Use `node --trace-warnings ...` to show where the warning was created))
    2026-10-27 16:40      integrated → done      outcome: 78 runs on ui-tui: no correctness effect, no cost saving shown, claim stays a hypothesis, merged ac6ab19 · resources: retain · prevents: packages/daemon/bench/m15/grade.mjs:157 limits and lenient/subset scoring 
    2026-10-27 16:40      prevents: packages/daemon/bench/m15/grade.mjs:157 limits and lenient/subset scoring emitted with every result [source: tasks/T4-m15-agent-cost-check; added: 2026-10-27]
```
