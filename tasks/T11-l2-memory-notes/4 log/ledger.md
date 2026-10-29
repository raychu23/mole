```notes
ledger (newest last, nothing deleted)
    2026-10-28 21:10      new → proposed      L2 memory store: your notes on code as repo files (.mole/notes/*.md, YAML front matter: symbol qualifiedName, normalized-body hash, author, written date, body =
    2026-10-28 21:10      proposed → ready      owner mole-builder (Hermes chat)
    2026-10-28 21:13      ready → running      worktree /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T11-l2-memory-notes · branch ledger/t11-l2-memory-notes · base bdeff14
    2026-10-28 21:34      running → submitted      report: branch ledger/t11-l2-memory-notes @c2bedb8: new @mole/memory (symbols via TS parser, normalized-body hash = sha256/16 over token texts, .mole/notes/<slug>.md with YAML front matter, memory() status fresh|stale|mo
    2026-10-28 21:34      checks ran: npm run check && node packages/memory/dist/bench/m1.js in /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T11-l2-memory-notes → exit 0 ((Use `node --trace-warnings ...` to show where the warning was created))
    2026-10-28 21:39      submitted → running      changes requested: P1-1 deleted symbol reported moved* to an unrelated same-named symbol in another file (locate() re-anchors on tail alone when exactly 1 candidate, contract says tail + body hash, deleted → orphaned). P
    2026-10-28 21:43      running → submitted      report: round 2: review-1 P1-1 fixed (no name-only re-anchoring: deleted symbol → orphaned) + P2-1 (overload signatures in hash, moved+changed no longer exists, closes P2-2), regression tests packages/memory/test/review-
    2026-10-28 21:43      checks ran: npm run check && node packages/memory/dist/bench/m1.js in /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T11-l2-memory-notes → exit 0 ((Use `node --trace-warnings ...` to show where the warning was created))
    2026-10-28 21:47      submitted → verified      reviewer reviewer-T11-r2 · findings: P2-6 moved+edited now orphaned (within contract, loses new-path hint), P2-7 same-tail+hash ambiguity picks first match silently, P2-8 container-rename branch fires while old container
    2026-10-28 21:47      checks ran: npm run check && node packages/memory/dist/bench/m1.js in /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T11-l2-memory-notes → exit 0 ((Use `node --trace-warnings ...` to show where the warning was created))
    2026-10-28 21:52      verified → integrated      merge e-merge on main (T11 merge commit c45a8c8) · combined checks exit 0 · note: npm run check on main 7b47c51 → 87/87 passed (2 of 3 consecutive runs, 1 run had 1 failed test under load avg ~23, T11 CLI 5s-timeout clas
    2026-10-28 21:52      combined checks ran: npm run check && node packages/memory/dist/bench/m1.js in /Users/a1/Desktop/CS Code/Project/Mole → exit 0 ((Use `node --trace-warnings ...` to show where the warning was created))
```
