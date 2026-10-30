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
    2026-10-29 17:32      ready → running      worktree /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T25-hand-back-verify-gate · branch ledger/t25-hand-back-verify-gate · base d1b7298
    2026-10-29 18:08      running → blocked      cause: clean-load re-verify (round4, same code as round3 commit d1b7298, merged main -> 93707ed, no code changes this round per instructions): 2 back-to-back runs under genuinely low host load (1min avg 12-76, well below
    2026-10-29 21:13      blocked → ready      raymond 10-30 'fix the blocked'
    2026-10-29 21:13      ready → running      worktree /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T25-hand-back-verify-gate · branch ledger/t25-hand-back-verify-gate · base 93707ed
    2026-10-29 22:21      running → blocked      cause: Round 5 real-number miss accepted per R7/D39 (same shape as T19/D33): agree 17/20 (85% vs 90% target), p95 mole 20.5-20.6s (vs <=20s), 0/6 planted verified (safety met). Root-caused H05/H09 (no later-fix oracle po
    2026-10-29 22:21      blocked → ready      Per R7/D39 (T19/D33 fallback shape): accepting the real NOT MET M17 number (agree 17/20=85%, p95 mole 20.5-20.6s, 0/6 planted verified met, safety-critical target held). Fresh-subagent review (contract + decide() code + 
    2026-10-29 22:21      ready → running      worktree /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T25-hand-back-verify-gate · branch ledger/t25-hand-back-verify-gate · base 930d173
    2026-10-29 22:22      running → submitted      report: Round 5 (raymond 10-30 'fix the blocked'): no code change. Root-caused H05/H09 (false-verified: pass every test that existed at hand-back, the later fix itself adds the missing assertion -- no later-fix oracle ex
    2026-10-29 22:22      checks ran: npm run check in /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T25-hand-back-verify-gate → exit 0 ((Use `node --trace-warnings ...` to show where the warning was created))
    2026-10-29 22:24      submitted → verified      reviewer fresh-review-a19-r1 · findings: Independent fresh-subagent review (delegate_task, contract + decide() code + m17-key.json only, never saw this round's implementation transcript) confirmed: decide() logic matches
    2026-10-29 22:24      checks ran: npm run check in /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T25-hand-back-verify-gate → exit 0 ((Use `node --trace-warnings ...` to show where the warning was created))
```
