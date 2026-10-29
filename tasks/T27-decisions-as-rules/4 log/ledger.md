```notes
ledger (newest last, nothing deleted)
    2026-10-29 01:38      new → proposed      Turn decisions into checks: a decision record can carry an architecture rule (e.g. 'ui never imports db', 'only api/ calls fetch'), compiled to dependency-cruis
    2026-10-29 05:03      proposed → ready      owner mole-builder-4
    2026-10-29 06:45      ready → running      worktree /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T27-decisions-as-rules · branch ledger/t27-decisions-as-rules · base fb240ab
    2026-10-29 07:40      running → submitted      report: decision records carry rules: forbid import -> real dependency-cruiser forbidden rules, forbid call -> TS call scan, mole rules [--json] [--emit] cites decision id/title/flag/why + record file:line, syntax error 
    2026-10-29 07:40      checks ran: npm run check && node packages/decisions/dist/bench/m19.js in /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T27-decisions-as-rules → exit 0 ((Use `node --trace-warnings ...` to show where the warning was created))
```
