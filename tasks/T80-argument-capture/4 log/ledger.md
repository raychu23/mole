```notes
ledger (newest last, nothing deleted)
    2026-11-03 07:03      new → proposed      Contestable AI-drafted arguments from human records (W3, backlog argument-capture): when Mole drafts an argument (premise, pro/con, attack) from an ADR/PR/meeti
    2026-11-03 07:03      proposed → ready      owner hermes-build
    2026-11-03 07:03      ready → running      worktree /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T80-argument-capture · branch ledger/t80-argument-capture · base ?
    2026-11-03 07:40      running → running (evidence)      prior-art.md written (4 sources: W3C TextQuoteSelector, Stab & Gurevych 2014, MADR template + this repo's vendored corpus, AIF + T46 compile store)
    2026-11-03 07:40      running → running (evidence)      RED: npx tsc -b with capture/loader/CLI files absent -- 5 TS2307 errors (4 log/red.txt)
    2026-11-03 07:40      running → running (evidence)      implemented capture/arguments.ts, capture/captured-store.ts, argdown/captured-loader.ts (wired into graph.ts after loadArgdown), capture/arguments-cli.ts + daemon `arguments` cmd, index.ts exports; derive-adr.ts's sameName exported for reuse
    2026-11-03 07:40      running → running (evidence)      GREEN: npx tsc -b clean; npx vitest run packages/decisions packages/reasoning packages/daemon -- 48 files / 525 tests pass (9 new)
    2026-11-03 07:40      running → running (evidence)      found+fixed real bug on the 5-record run:     2026-11-03 10:10      running → submitted      report: tasks/T80-argument-capture/2 insights.md, proof 4 log/span-hand-check.md, real-run-5-madr-records.json, red.txt · checks exit 0
    2026-11-03 10:10      checks ran: npm run check in /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T80-argument-capture → exit 0 (mole steer: inbox for session s4 was not valid JSON (Unterminated string in JSON at position 31 (lin)
```markdown example fences in 0009/0016 Pros-and-Cons sections looked like real headings/bullets to the first version of extractProsCons, truncating the scan (0009: 7->29 args, 0016: 3->9 args after the fence-tracking fix)
    2026-11-03 07:40      running → running (evidence)      real run: 5 real MADR records (0008/0009/0012/0015/0016), 98 captured arguments, every span hand-checked character-for-character (4 log/span-hand-check.md); CLI end-to-end proof on a scratch repo (capture -> rules 0 violations with drafts invisible -> approve -> re-list shows approved)
    2026-11-03 07:40      running → running (evidence)      node packages/daemon/dist/cli.js rules --root . : 0 violations (0013/0014/0017 hold)
    2026-11-03 07:40      running → running (evidence)      stop-condition test asserts a draft argument is never a graph node / never changes evaluate()'s labels; only approveCapturedArgument flips that -- never violated
```
