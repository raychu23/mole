```notes
ledger (newest last, nothing deleted)
    2026-10-29 01:38      new → proposed      One verification gate at the agent hand-back (Claude Code Stop hook, mole check --gate): the type-error delta from the TypeScript compiler (new errors vs the ba
    2026-10-29 05:03      proposed → ready      owner mole-builder-5
    2026-10-29 10:00      ready → running      worktree /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T25-hand-back-verify-gate · branch ledger/t25-hand-back-verify-gate · base 9c4c21f
    2026-10-29 11:52      running → blocked      cause: M17 NOT MET after 2 rounds (branch ledger/t25-hand-back-verify-gate @d312d66, runs.jsonl 2026-10-29T11:50:45): agree 17/20 (85%, target >= 18/20), planted verified 0/6 (met), gate p95 mole 25.5 s (target <= 20 s, 
    2026-10-29 15:39      blocked → ready      USER 10-29 15:30 'make it work': round 3, speed. Accuracy met except 17/20 (target >= 18/20), gate p95 25.5 s vs <= 20 s. Prior art first: tsc --incremental / tsBuildInfo, a TypeScript LanguageService kept warm in the da
    2026-10-29 15:45      ready → running      worktree /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T25-hand-back-verify-gate · branch ledger/t25-hand-back-verify-gate · base d312d66
    2026-10-29 16:52      running → blocked      cause: round 3 (speed, Raymond 'make it work' 10-29 15:30): warm-worker + module-scope SourceFile/oldProgram cache implemented in packages/verify/src/gate/{index,typedelta}.ts (prior-art.md: tsc oldProgram reuse, warm La
    2026-10-29 17:31      blocked → ready      reclaim under lower host load (uptime ~50-92 vs round3's 190-208) to get trustworthy M17 numbers
```
