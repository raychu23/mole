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
```
