```notes
ledger (newest last, nothing deleted)
    2026-10-29 01:38      new → proposed      What actually runs: record call sequences while the test suite runs (V8 coverage + OpenTelemetry spans around exported functions, AppMap-style), and add runtime
    2026-10-29 05:03      proposed → ready      owner mole-builder-5
    2026-10-29 05:08      ready → running      worktree /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T28-runtime-flows-from-tests · branch ledger/t28-runtime-flows-from-tests · base 5b447f7
    2026-10-29 07:12      running → submitted      report: new packages/flows: Vite transform wraps every function body with enter/exit hooks (indexer-compatible ids, no added lines), runtime tracks the caller across await/yield (no AsyncLocalStorage), registries/new C()
    2026-10-29 07:12      checks ran: npm run check && node packages/flows/dist/bench/m20.js in /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T28-runtime-flows-from-tests → exit 0 ((Use `node --trace-warnings ...` to show where the warning was created))
    2026-10-29 07:34      submitted → verified      reviewer reviewer-T28-r1 · findings: 0 P0/P1 (4 log/review-1.md @357fcb9 on the task branch). P2: record leaves .mole/local/flows on a failed run, React-render edges clutter mole flows output, factory-returned closures g
    2026-10-29 07:34      checks ran: npm run check && node packages/flows/dist/bench/m20.js in /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T28-runtime-flows-from-tests → exit 0 ((Use `node --trace-warnings ...` to show where the warning was created))
    2026-10-29 08:09      verified → integrated      merge 1a21fbf · combined checks exit 0 · note: npm run check on main → 40 files, 281/281 passed, exit 0, node packages/flows/dist/bench/m20.js on main → exit 0, recovered 22/22 dynamic edges, invented 0, overhead <= 2x (
    2026-10-29 08:09      combined checks ran: npm run check && node packages/flows/dist/bench/m20.js in /Users/a1/Desktop/CS Code/Project/Mole → exit 0 ((Use `node --trace-warnings ...` to show where the warning was created))
```
