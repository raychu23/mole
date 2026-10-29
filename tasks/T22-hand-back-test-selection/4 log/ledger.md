```notes
ledger (newest last, nothing deleted)
    2026-10-29 01:20      new → proposed      At hand-back (Claude Code Stop hook / mole check), run only the tests that matter for this change: the guarding tests of every past fix whose lines it edits (T1
    2026-10-29 05:03      proposed → ready      owner mole-builder-5
    2026-10-29 05:08      ready → running      worktree /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T22-hand-back-test-selection · branch ledger/t22-hand-back-test-selection · base 70a2989
    2026-10-29 07:06      running → submitted      report: new packages/verify: selectTests = T12 past-fix guard tests + nearest tests per caller branch on the @mole/indexer call graph (tests indexed too, graph cached in SQLite), runTests runs the selection with vitest b
    2026-10-29 07:06      checks ran: npm run check && node packages/verify/dist/bench/m14.js in /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T22-hand-back-test-selection → exit 0 ((Use `node --trace-warnings ...` to show where the warning was created))
```
