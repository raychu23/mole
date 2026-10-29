```notes
ledger (newest last, nothing deleted)
    2026-10-29 01:20      new → proposed      Check what an agent says it did against what it did: parse an agent's final answer for claims ('tests pass', 'fixed X', 'updated file Y', 'committed') and verif
    2026-10-29 05:03      proposed → ready      owner mole-builder-5
    2026-10-29 05:08      ready → running      worktree /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T24-agent-claim-check · branch ledger/t24-agent-claim-check · base 80e2ca0
    2026-10-29 07:09      running → submitted      report: packages/agentstate/src/claims: answers.ts (turn-final answers, read-only), split.ts (sentence/clause split + patterns: tests, exit, commit, merge, push, file, fix), verify.ts (claims vs the run's own earlier too
    2026-10-29 07:09      checks ran: npm run check && node packages/agentstate/dist/bench/m16.js in /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T24-agent-claim-check → exit 0 ((Use `node --trace-warnings ...` to show where the warning was created))
    2026-10-29 07:34      submitted → running      changes requested: reviewer-T24-r1 (4 log/review-1.md @917310d): P1-1 >= 10 of 14 flags outside the key are wrong (metric values like '5/5' read as test counts, bug descriptions, expected 'exits 1', feature descriptions)
    2026-10-29 07:48      running → submitted      report: review-1 fixes: key-ruling-1 applied (3212348, C03 → supported, new sha in key.md), P1-1 fixed (cdb428c, 96ad794: metric values, bug/behaviour descriptions, expected exits, conditionals, code blocks, others' find
    2026-10-29 07:48      checks ran: npm run check && node packages/agentstate/dist/bench/m16.js in /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T24-agent-claim-check → exit 0 ((Use `node --trace-warnings ...` to show where the warning was created))
    2026-10-29 08:10      submitted → running      changes requested: reviewer-T24-r2 (4 log/review-2.md @63da91b): review-1 repros fixed in-sample, NEW P1-1 out-of-sample flag precision 0/18 on 8 real 10-29 answers not in the key (wrapper exit 0 overrides a printed 'exi
    2026-10-29 09:52      running → submitted      report: round 8 (review-2 fixes): held-out key first (e3ed678 09:33, 16 answers, 158 hand-labelled claims, sha only), baseline on old code 18 flags 0 correct (e101cb3), red 7ca8e6d (12 failing) → abea89b + 9cbb7db: self-
    2026-10-29 09:52      checks ran: npm run check && node packages/agentstate/dist/bench/m16.js in /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T24-agent-claim-check → exit 0 ((Use `node --trace-warnings ...` to show where the warning was created))
```
