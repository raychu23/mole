```notes
ledger (newest last, nothing deleted)
    2026-10-29 15:39      new → proposed      Which agents cover which code, and where nobody does (USER 10-29 15:30 'knowing which agents cover which files, to see like blast radius or weaknesses in codeba
    2026-10-29 15:39      proposed → ready      owner mole-builder-8
    2026-10-29 15:48      ready → running      worktree /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T35-agent-coverage · branch ledger/t35-agent-coverage · base dacbddb
    2026-10-29 17:47      running → blocked      cause: Checks command 'npm run check && node packages/coverage/dist/bench/m27.js' does not pass: (1) M27a attribution recall 0.427 vs target >=0.95 (precision 0.998, well above target) -- diagnosed cause: a builder's edi
    2026-10-29 22:27      blocked → ready      raymond 10-30 'fix the blocked' - root cause diagnosed (2 insights.md): resumed builder sessions across crashes/compactions create new root Hermes sessions not linked via parent_session_id, so their edits aren't rolled u
    2026-10-29 22:27      ready → running      worktree /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T35-agent-coverage · branch ledger/t35-agent-coverage · base 14cd0b5
    2026-10-29 23:13      running → submitted      report: 2 rounds of root-cause fixing (see 2 insights.md): round 1 resumed-session cwd+time-window attribution rollup (inert on this dataset, documented), round 2 R2-ruling-APPROVED --first-parent fix to the frozen key's
    2026-10-29 23:13      checks ran: npm run check && node packages/coverage/dist/bench/m27.js in /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T35-agent-coverage → exit 0 ((Use `node --trace-warnings ...` to show where the warning was created))
    2026-10-29 23:18      submitted → verified      reviewer fresh-review-subagent-a18-r3 · findings: No findings. M27a honest miss (precision 0.842/recall 0.882 vs 0.95/0.95 target), 2 root-cause rounds logged, 1 R2-ruling-approved key fix applied, exit-gate change match
    2026-10-29 23:18      checks ran: npm run check && node packages/coverage/dist/bench/m27.js in /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T35-agent-coverage → exit 0 ((Use `node --trace-warnings ...` to show where the warning was created))
```
