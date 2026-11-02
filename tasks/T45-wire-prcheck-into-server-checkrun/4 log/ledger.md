```notes
ledger (newest last, nothing deleted)
    2026-11-01 18:01      new → proposed      packages/server/src/checkrun.ts's live per-push check-run hardcodes conclusion:'success' (line 46) and never calls prCheck's governed/content-anchor result, wir
    2026-11-01 19:51      proposed → ready      owner t45-builder
    2026-11-01 19:51      ready → running      worktree Project/Mole-worktrees/T45-wire-prcheck-into-server-checkrun · branch t45-wire-prcheck-into-server-checkrun · base ?
    2026-11-01 20:00      running → submitted      report: npm run check: 81 test files passed, 7 skipped (DB-gated, no DATABASE_URL in this env), 559 tests passed / 15 skipped, 0 failed. computeCheckRun now calls prCheck (history:false) instead of hardcoding conclusion:
    2026-11-01 20:00      checks ran: npm run check in /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T45-wire-prcheck-into-server-checkrun → exit 0 ((Use `node --trace-warnings ...` to show where the warning was created))
```
