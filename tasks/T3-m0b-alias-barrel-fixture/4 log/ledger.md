```notes
ledger (newest last, nothing deleted)
    2026-10-19 23:52      new → proposed      Add a second M0 fixture with real tsconfig-paths aliases and barrel re-exports and re-run the engine benchmark on it, so alias/barrel evidence is not one ambien
    2026-10-19 23:52      proposed → ready      owner unclaimed
    2026-10-19 23:54      ready → running      worktree /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T3-m0b-alias-barrel-fixture · branch ledger/t3-m0b-alias-barrel-fixture · base 8dfe16a
    2026-10-20 00:04      running → submitted      report: bench generalised by env (SRC_MODE=tsconfig, TSCONFIG, PROBE, SCIP_MODE, SAMPLE_PER_STRATUM), excalidraw @ d3a9c2a195 MIT, 672 files, 461 sampled sites (alias 100, barrel 100, method 100, static 100, dynamic 61).
    2026-10-20 00:04      checks ran: npm run check in /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T3-m0b-alias-barrel-fixture → exit 0 ((Use `node --trace-warnings ...` to show where the warning was created))
    2026-10-20 01:05      submitted → verified      reviewer subagent sa-0-d78c0d36 (independent) · findings: PASS with defects: missing fixture URL, wrong diagnosis of 7 dynamic misses (actual cause: this.x!() in object literal, checker vs contextual member), missing no-
    2026-10-20 01:05      checks ran: npm run check in /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T3-m0b-alias-barrel-fixture → exit 0 ((Use `node --trace-warnings ...` to show where the warning was created))
    2026-10-20 01:06      verified → integrated      merge merged to main 0e1fea5, npm run check 16 pass · combined checks exit 0
    2026-10-20 01:06      combined checks ran: npm run check in /Users/a1/Desktop/CS Code/Project/Mole → exit 0 ((Use `node --trace-warnings ...` to show where the warning was created))
    2026-10-27 16:40      integrated → done      outcome: Second fixture excalidraw confirmed P2, this.x!() contextual calls fixed, dynamic recall 61/61, merged 23d2a62 · resources: retain · prevents: packages/indexer/test/indexer.test.ts:158 contextual member calls
    2026-10-27 16:40      prevents: packages/indexer/test/indexer.test.ts:158 contextual member calls [source: tasks/T3-m0b-alias-barrel-fixture; added: 2026-10-27]
```
