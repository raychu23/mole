```notes
ledger (newest last, nothing deleted)
    2026-10-29 15:39      new → proposed      Read decisions where teams already keep them, nothing new to learn (USER 10-29 'highly integrate', 3C1 741 'either: give structured docs format (like big tech) 
    2026-10-29 15:39      proposed → ready      owner mole-builder-10
    2026-10-29 15:45      ready → running      worktree /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T36-spec-kit-and-adr-import · branch ledger/t36-spec-kit-and-adr-import · base dec0f95
    2026-10-29 16:28      running → blocked      cause: T36's own work is done and verified green (M29 bench: recall 100%, fields 100%, anchored-flags 100%, packages/decisions 81/81 on every isolated run, incl. the 9 new T36 tests, packages/daemon's --spec-kit flag and
    2026-10-29 17:32      blocked → ready      decision owner raymond: retrying npm run check in lower-load window per his instruction
    2026-10-29 17:32      ready → running      worktree /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T36-spec-kit-and-adr-import · branch ledger/t36-spec-kit-and-adr-import · base c0ba5b5
    2026-10-29 17:48      running → blocked      cause: Reclaimed 2026-10-29 22:40 per raymond's instruction (load believed lower). Merged main cleanly (18 commits, 0 boundary overlap, 0 conflicts). M29 bench unchanged on merged code: 100%/100%/100%. 3 full npm run che
    2026-10-29 21:26      blocked → ready      raymond 10-30 'fix the blocked' - shared vitest timeout fix landed main@3af8a4a
    2026-10-29 21:26      ready → running      worktree /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T36-spec-kit-and-adr-import · branch ledger/t36-spec-kit-and-adr-import · base ce958e9
    2026-10-29 21:36      running → submitted      report: Unblocked after root-cause fix (shared vitest timeout, main@3af8a4a) + stale .mole/local/verify-fixtures cleanup. Merged main cleanly (83f758b), no conflicts, npm install needed (T33's server deps - pg/fastify/ex
    2026-10-29 21:36      checks ran: npm run check && node packages/decisions/dist/bench/m29.js in /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T36-spec-kit-and-adr-import → exit 0 ((Use `node --trace-warnings ...` to show where the warning was created))
    2026-10-29 22:20      submitted → verified      reviewer fresh-review-subagent-a18-r1 · findings: No P0. P1 (logged, not blocking): the bench key + red tests landed in the same commit as the importer rather than a strictly separate earlier red commit, reviewer indepen
    2026-10-29 22:20      checks ran: npm run check && node packages/decisions/dist/bench/m29.js in /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T36-spec-kit-and-adr-import → exit 0 ((Use `node --trace-warnings ...` to show where the warning was created))
    2026-10-29 22:26      verified → integrated      merge fe367515dc77d2371f72dbb96dd40efdd00d417f · combined checks exit 0 · note: npm run check on main (496/510, 65/72 files) + node packages/decisions/dist/bench/m29.js → M29a recall 100%, fields 100%, M29b anchored-flag
    2026-10-29 22:26      combined checks ran: npm run check && node packages/decisions/dist/bench/m29.js in /Users/a1/Desktop/CS Code/Project/Mole → exit 0 ((Use `node --trace-warnings ...` to show where the warning was created))
```
