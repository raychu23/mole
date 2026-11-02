```notes
ledger (newest last, nothing deleted)
    2026-11-01 18:01      new → proposed      packages/server/src/checkrun.ts's live per-push check-run hardcodes conclusion:'success' (line 46) and never calls prCheck's governed/content-anchor result, wir
    2026-11-01 19:51      proposed → ready      owner t45-builder
    2026-11-01 19:51      ready → running      worktree Project/Mole-worktrees/T45-wire-prcheck-into-server-checkrun · branch t45-wire-prcheck-into-server-checkrun · base ?
    2026-11-01 20:00      running → submitted      report: npm run check: 81 test files passed, 7 skipped (DB-gated, no DATABASE_URL in this env), 559 tests passed / 15 skipped, 0 failed. computeCheckRun now calls prCheck (history:false) instead of hardcoding conclusion:
    2026-11-01 20:00      checks ran: npm run check in /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T45-wire-prcheck-into-server-checkrun → exit 0 ((Use `node --trace-warnings ...` to show where the warning was created))
    2026-11-01 21:16      submitted → running      changes requested: Fresh review FAILED (round 2): P1 baseOf() in packages/server/src/checkrun.ts used ref^ only, so a multi-commit push diffed only the last commit and a violation in an earlier commit of the same push wa
    2026-11-01 21:18      running → submitted      report: Fixed both review round 2 findings, tests-first. P1: threaded GitHub push payload 'before' through webhook.ts -> compute-check-run job data -> computeCheckRun, used as prCheck's base when present/not all-zero/an 
    2026-11-01 21:18      checks ran: npm run check in /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T45-wire-prcheck-into-server-checkrun → exit 0 ((Use `node --trace-warnings ...` to show where the warning was created))
    2026-11-01 23:25      submitted → verified      reviewer reviewer-T45-r2 (deleg_969e97b1 task 0), r1 FAIL deleg_6c0532f4 task 1 · findings: r1 P1 base from ref^ only -> payload.before + is-ancestor fallback, r1 P2 silent catch -> console.error, r2 no findings, first v
    2026-11-01 23:25      checks ran: npm run check in /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T45-wire-prcheck-into-server-checkrun → exit 0 ((Use `node --trace-warnings ...` to show where the warning was created))
    2026-11-01 23:29      verified → integrated      merge e1a5f5b · combined checks exit 0 · note: npm run check on main e1a5f5b exit 0
    2026-11-01 23:29      combined checks ran: npm run check in Project/Mole → exit 0 (at new Promise (<anonymous>))
```
