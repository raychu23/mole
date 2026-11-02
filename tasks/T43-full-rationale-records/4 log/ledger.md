```notes
ledger (newest last, nothing deleted)
    2026-11-01 17:49      new → proposed      Agent-facing decision output (MCP tools, hook text, .mole/decisions records, T36 ADR import) carries the full Decision + Rationale/Context + Consequences text, 
    2026-11-01 17:51      proposed → ready      owner t43-builder
    2026-11-01 17:51      ready → running      worktree /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T43-full-rationale-records · branch ledger/t43-full-rationale-records · base 9eb8fad
    2026-11-01 18:35      running → submitted      report: npm run check: 572 passed, 15 skipped, 0 failed (84/91 files, 7 skipped files pre-existing, need live Postgres). M-B dev B-arm rerun with PRODUCT importer: 11/12 CORRECT, 1/12 INCORRECT, 0/12 NOT_ATTEMPTED vs v2 
    2026-11-01 18:35      checks ran: npm run check in /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T43-full-rationale-records → exit 0 ((Use `node --trace-warnings ...` to show where the warning was created))
    2026-11-01 20:41      submitted → running      changes requested: fresh reviewer FAIL: P0 sectionsOf dropped unmatched sibling sections (adr001 Discussion/Risks, adr009 Background), P1 decisionsBlock had no aggregate rationale budget (clip() could cut mid-Decision at
    2026-11-01 20:43      running → submitted      report: All 4 reviewer findings fixed, red test first then fix, each its own commit on ledger/t43-full-rationale-records (worktree Project/Mole-worktrees/T43-full-rationale-records): P0 rationale.ts sectionsOf keeps unma
    2026-11-01 20:43      checks ran: npm run check in /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T43-full-rationale-records → exit 0 ((Use `node --trace-warnings ...` to show where the warning was created))
    2026-11-01 21:50      submitted → verified      reviewer reviewer-T43-r2 (fresh subagent deleg_463af3a3 task 1), r1 FAIL deleg_dd5f59de task 0 · findings: r1: P0 dropped sections, P1 hook mid-Decision clip, P2 TS/mjs drift, P2 MCP total budget -> all fixed, M-B dev wi
    2026-11-01 21:50      checks ran: npm run check in /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T43-full-rationale-records → exit 0 ((Use `node --trace-warnings ...` to show where the warning was created))
```
