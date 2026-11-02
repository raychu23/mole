```notes
ledger (newest last, nothing deleted)
    2026-11-01 20:41      new → proposed      Borrow mature verifier mechanics: wire Mole's existing dependency-cruiser rules engine (rules/check.ts) into prCheck + cascade, paginate check-run annotations p
    2026-11-01 21:11      proposed → ready      owner t49-builder
    2026-11-01 21:11      ready → running      worktree /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T49-verifier-wiring · branch ledger/t49-verifier-wiring · base b9c2eda
    2026-11-01 21:44      running → submitted      report: Wired rules/check.ts into prCheck (crisp rule: hit kind, zero cost when no rules: item exists, throwaway git-worktree at head + merge-base records). Batched cascade escalation: N escalating decisions on one check
    2026-11-01 21:44      checks ran: npm run check in /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T49-verifier-wiring → exit 0 ((Use `node --trace-warnings ...` to show where the warning was created))
    2026-11-01 23:26      submitted → verified      reviewer reviewer-T49-r1 (deleg_969e97b1 task 1) + parent fix · findings: P0 rules gate checked head only -> PR could delete/strip its own rule: fixed (gate checks merge base) + 2 regression tests, P2 batched budget not 
    2026-11-01 23:26      checks ran: npm run check in /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T49-verifier-wiring → exit 0 ((Use `node --trace-warnings ...` to show where the warning was created))
    2026-11-01 23:30      verified → integrated      merge e1a5f5b · combined checks exit 0 · note: npm run check on main e1a5f5b exit 0
    2026-11-01 23:30      combined checks ran: npm run check in /Users/a1/Desktop/CS Code/Project/Mole → exit 0 (at new Promise (<anonymous>))
```
