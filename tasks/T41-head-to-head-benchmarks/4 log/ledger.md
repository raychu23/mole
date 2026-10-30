```notes
ledger (newest last, nothing deleted)
    2026-10-29 21:07      new → proposed      Prove each Mole claim as a percentage against the most recognizable tool that does the same job, scored the way the field scores it (USER 10-29 23:55: 'percenta
    2026-10-29 21:08      proposed → ready      owner mole-builder-12
    2026-10-29 21:10      ready → running      worktree /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T41-head-to-head-benchmarks · branch ledger/t41-head-to-head-benchmarks · base c1663f3
    2026-10-29 21:22      running → submitted      report: packages/bench: h2h.ts assembles H1-H6 scoreboard + T38 bonus row from frozen/reused keys (T1,T11,T19,T21,T22,T24,T38) and 3 new reimplemented-from-docs H3 baselines, scoreboard.json/.md written · checks exit 0 ·
    2026-10-29 21:22      checks ran: npm run check && node packages/bench/dist/h2h.js --check in /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T41-head-to-head-benchmarks → exit 0 ((Use `node --trace-warnings ...` to show where the warning was created))
    2026-10-29 21:32      submitted → running      changes requested: review-1 P1: R1 violated (stub-free src shipped in the red commit), P2: root tsconfig.json edited outside the stated boundary. Fixing: split into a genuinely red commit + separate implementation commit
    2026-10-29 21:33      running → submitted      report: Review-1 fix: red commit now contains only harness+keys+stub-src(throws)+failing tests (7/9 red), real implementation is a separate commit, boundary note for root tsconfig.json added to 2 insights.md · checks exi
    2026-10-29 21:33      checks ran: npm run check && node packages/bench/dist/h2h.js --check in /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T41-head-to-head-benchmarks → exit 0 ((Use `node --trace-warnings ...` to show where the warning was created))
    2026-10-29 21:46      submitted → running      changes requested: review-2 P1: red commit bb1589d was NOT actually red (stale git index carried real impl forward past an unstaged write). Root-caused + fixed with explicit git add + grep verification before/after each 
    2026-10-29 21:48      running → submitted      report: Review-2 fix: re-did the red/impl split with explicit git add + before/after content verification, red commit dcd57bf confirmed 0 real logic (throws only), impl commit 51d06b5 confirmed M not A on the stub files 
    2026-10-29 21:48      checks ran: npm run check && node packages/bench/dist/h2h.js --check in /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T41-head-to-head-benchmarks → exit 0 ((Use `node --trace-warnings ...` to show where the warning was created))
    2026-10-29 21:54      submitted → verified      reviewer review-round-3 · findings: No P0/P1 · checks exit 0
    2026-10-29 21:54      checks ran: npm run check && node packages/bench/dist/h2h.js --check in /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T41-head-to-head-benchmarks → exit 0 ((Use `node --trace-warnings ...` to show where the warning was created))
    2026-10-29 22:08      verified → integrated      merge 9527293444c909c15d903eeb18e2a5644035af06 · combined checks exit 0 · note: npm run check on main -> 477 passed | 14 skipped (491), 0 failed, node packages/bench/dist/h2h.js --check -> exit 0, 7 rows
    2026-10-29 22:08      combined checks ran: npm run check && node packages/bench/dist/h2h.js --check in /Users/a1/Desktop/CS Code/Project/Mole → exit 0 ((Use `node --trace-warnings ...` to show where the warning was created))
```
