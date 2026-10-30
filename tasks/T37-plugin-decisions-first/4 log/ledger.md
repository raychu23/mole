```notes
ledger (newest last, nothing deleted)
    2026-10-29 15:41      new → proposed      Make the agent plugin serve the decisions, not just notes (USER 10-29 15:30 'plugins are ours right how are they inque exactly whats the pt … aligngin all apsec
    2026-10-29 15:41      proposed → ready      owner mole-builder-8
    2026-10-29 15:46      ready → running      worktree /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T37-plugin-decisions-first · branch ledger/t37-plugin-decisions-first · base 85af7ab
    2026-10-29 17:09      running → submitted      report: SessionStart: decisions+tenets governing files in play (scope-matched, fast path uses record status, falls back '(weak spots from T35: not available yet)'), PreToolUse (Edit|Write, new hook): adds a governing dec
    2026-10-29 17:09      checks ran: npm run check && node plugins/claude-code/test/m31.mjs in /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T37-plugin-decisions-first → exit 0 ((Use `node --trace-warnings ...` to show where the warning was created))
    2026-10-29 17:51      submitted → blocked      cause: npm run check fails only on unrelated tests (packages/telemetry, packages/agentstate claims-hook etc.) with 'Test timed out in 5000ms' / vitest-worker onTaskUpdate timeout, under confirmed host load avg 225-265 fr
    2026-10-29 21:15      blocked → ready      raymond 10-30 'fix the blocked' - shared vitest timeout fix landed main@3af8a4a
```
