```notes
ledger (newest last, nothing deleted)
    2026-10-29 01:20      new → proposed      Turn the places design decisions actually happen (Slack threads via Slack MCP, meeting notes, PR threads, agent sessions) into proposed decision records anchore
    2026-10-29 15:39      proposed → ready      owner mole-builder-8
    2026-10-29 15:45      ready → running      worktree /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T23-decision-traces-intake · branch ledger/t23-decision-traces-intake · base 92788a9
    2026-10-29 17:02      running → blocked      cause: Implementation complete and verified (M30 bench: seededCaught=10/10, realFalseFlags=0/10, evidencePrecisionPct=100, exit 0, tsc -b clean, packages/intake's own vitest suite 10/10 passing every isolated run). The l
    2026-10-29 21:26      blocked → ready      raymond 10-30 'fix the blocked' - shared vitest timeout fix landed main@3af8a4a
    2026-10-29 21:26      ready → running      worktree /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T23-decision-traces-intake · branch ledger/t23-decision-traces-intake · base 9c42843
    2026-10-29 21:31      running → submitted      report: Unblocked after root-cause fix (shared vitest timeout, main@3af8a4a) + stale .mole/local/verify-fixtures cleanup. Merged main (4f9b59e): resolved package.json/tsconfig.json/server.ts conflicts in packages/mcp (un
    2026-10-29 21:31      checks ran: npm run check && node packages/intake/dist/bench/m30.js in /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T23-decision-traces-intake → exit 0 ((Use `node --trace-warnings ...` to show where the warning was created))
```
