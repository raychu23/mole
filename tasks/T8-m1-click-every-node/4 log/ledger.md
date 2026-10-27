```notes
ledger (newest last, nothing deleted)
    2026-10-27 16:41      new → proposed      Close the M1 acceptance gap 'every node opens file:line': in the real VS Code window, open EVERY node of a file map and a symbol map, and for callers check the 
    2026-10-27 16:41      proposed → ready      owner unclaimed
    2026-10-27 16:41      ready → running      worktree /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T8-m1-click-every-node · branch ledger/t8-m1-click-every-node · base 46ed9be
    2026-10-27 16:46      running → submitted      report: selftest now opens every node: 761/761 landed on path:line in real VS Code (40 file maps + 40 symbol maps), 103/103 caller lines contain the function name, data generated data/m1-click-all.json, p95 switch 16 ms,
    2026-10-27 16:46      checks ran: npm run check in /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T8-m1-click-every-node → exit 0 ((Use `node --trace-warnings ...` to show where the warning was created))
    2026-10-27 17:07      submitted → verified      reviewer subagent sa-0-6db3d303 · findings: 5 fixes: editor parked on package.json:1 before each open (no false pass), strict call regex instead of includes, real DOM click path exercised (96/96), selftest writes m1-clic
    2026-10-27 17:07      checks ran: npm run check in /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T8-m1-click-every-node → exit 0 ((Use `node --trace-warnings ...` to show where the warning was created))
    2026-10-27 17:08      verified → integrated      merge d0d9c1e merge of ledger/t8-m1-click-every-node into main · combined checks exit 0
    2026-10-27 17:08      combined checks ran: npm run check in /Users/a1/Desktop/CS Code/Project/Mole → exit 0 ((Use `node --trace-warnings ...` to show where the warning was created))
    2026-10-27 17:08      integrated → done      outcome: M1 acceptance 'every node opens file:line' closed in real VS Code: 857/857 (761 via openFile + 96 via real DOM click), 103 caller lines are real call sites, reviewed, hardened, merged · resources: retain · preve
    2026-10-27 17:08      prevents: apps/vscode/scripts/selftest.mjs:1 selftest fails the run if any node does not land on its path:line [source: tasks/T8-m1-click-every-node; added: 2026-10-27]
```
