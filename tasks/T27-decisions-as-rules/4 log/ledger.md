```notes
ledger (newest last, nothing deleted)
    2026-10-29 01:38      new → proposed      Turn decisions into checks: a decision record can carry an architecture rule (e.g. 'ui never imports db', 'only api/ calls fetch'), compiled to dependency-cruis
    2026-10-29 05:03      proposed → ready      owner mole-builder-4
    2026-10-29 06:45      ready → running      worktree /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T27-decisions-as-rules · branch ledger/t27-decisions-as-rules · base fb240ab
    2026-10-29 07:40      running → submitted      report: decision records carry rules: forbid import -> real dependency-cruiser forbidden rules, forbid call -> TS call scan, mole rules [--json] [--emit] cites decision id/title/flag/why + record file:line, syntax error 
    2026-10-29 07:40      checks ran: npm run check && node packages/decisions/dist/bench/m19.js in /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T27-decisions-as-rules → exit 0 ((Use `node --trace-warnings ...` to show where the warning was created))
    2026-10-29 07:54      submitted → verified      reviewer t27 fresh reviewers (r1 deleg_ecbe76ff, r2 deleg_5df60e1f, r2b deleg_86fc2156) · findings: r1: P1 emitted config rejected by the depcruise CLI + 6 P2 -> fixed 71603e8 with 12 new tests (each fails without its fi
    2026-10-29 07:54      checks ran: npm run check && node packages/decisions/dist/bench/m19.js in /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T27-decisions-as-rules → exit 0 ((Use `node --trace-warnings ...` to show where the warning was created))
    2026-10-29 07:55      verified → integrated      merge 2c05450 · combined checks exit 0 · note: npm run check && node packages/decisions/dist/bench/m19.js on main 2c05450 -> pass (ledger-run), merged branch 0e5de79: 271/271 tests, M19 caught 10/10 citing decision, 0 fa
    2026-10-29 07:55      combined checks ran: npm run check && node packages/decisions/dist/bench/m19.js in /Users/a1/Desktop/CS Code/Project/Mole → exit 0 ((Use `node --trace-warnings ...` to show where the warning was created))
```
