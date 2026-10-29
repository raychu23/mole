```notes
ledger (newest last, nothing deleted)
    2026-10-28 21:10      new → proposed      L1 observe, personal: record what you've looked at (VS Code: a symbol visible in the editor >= 5 s, hovered, or noted) into .mole/local/seen.jsonl (gitignored, 
    2026-10-28 21:10      proposed → ready      owner mole-builder (Hermes chat)
    2026-10-28 22:05      ready → running      worktree /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T13-l1-since-you-last-looked · branch ledger/t13-l1-since-you-last-looked · base b91c6a9
    2026-10-28 22:25      running → submitted      report: branch ledger/t13-l1-since-you-last-looked @a36df6c: packages/memory/src/seen.ts (.mole/local/seen.jsonl appendSeen/readSeen/since/formatSince, reuses T11 hash + move rule), CLI mole since [--json] / mole seen, e
    2026-10-28 22:25      checks ran: npm run check && node packages/memory/dist/bench/m3.js in /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T13-l1-since-you-last-looked → exit 0 (at target: true)
    2026-10-28 22:29      submitted → verified      reviewer reviewer-T13-r1 · findings: P2-1 torn last line in seen.jsonl swallows the next appended look (appendSeen doesn't newline-terminate first) -> missed entry, P2-2 rename / move+change reported as 'deleted', newPat
    2026-10-28 22:29      checks ran: npm run check && node packages/memory/dist/bench/m3.js in /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T13-l1-since-you-last-looked → exit 0 (at target: true)
    2026-10-28 22:45      verified → integrated      merge 094e877 · combined checks exit 0 · note: npm run check on main 094e877 → 110/110 passed · m3.js on main → precision 100% (3/3), recall 100% (3/3), unseen listed 0, at target
    2026-10-28 22:45      combined checks ran: npm run check && node packages/memory/dist/bench/m3.js in /Users/a1/Desktop/CS Code/Project/Mole → exit 0 (at target: true)
```
