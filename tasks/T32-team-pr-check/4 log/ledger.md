```notes
ledger (newest last, nothing deleted)
    2026-10-29 03:59      new → proposed      Team phase A, no server (Team mode.md §5): a GitHub Actions job runs `mole check --diff` on every pull request and posts ONE check run: the decision records (.m
    2026-10-29 05:03      proposed → ready      owner mole-builder-4
    2026-10-29 06:45      ready → running      worktree /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T32-team-pr-check · branch ledger/t32-team-pr-check · base fb240ab
    2026-10-29 07:52      running → blocked      cause: M24 missed at the official check: precision 0.63 (>= 0.9), recall 0.52 (>= 0.8), silent 27/30, owners 30/30 exact, p95 2.3 s, failure case + local workflow proof pass, dogfood 9/11. Options round (2 insights §3): 
    2026-10-29 10:04      blocked → ready      Raymond 10-29 10:04 'ok use better ways': an options round on record → lines matching, prior-art.md first (traceability link recovery, co-change mining, scope globs, symbol anchors), frozen key and targets unchanged, max
    2026-10-29 10:09      ready → running      worktree /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T32-team-pr-check · branch ledger/t32-team-pr-check · base d3e834c
    2026-10-29 10:32      running → blocked      cause: Options round 2 (prior-art.md, 2 insights §3 cont.): title-term bump gate (option 3, IR/VSM-style) kept, precision 0.63->0.75 (fp 9->5), recall 0.52 unchanged, owners 30/30, silent 27/30, p95 0.62s. Still FAILS M2
    2026-10-29 15:39      blocked → ready      USER 10-29 15:30 'make it work': round 3 options (up to 3) with prior art (traceability link recovery: IR + structural, co-change mining such as Zimmermann ROSE, scope globs), targets unchanged, if none passes, integrate
    2026-10-29 15:46      ready → running      worktree /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T32-team-pr-check · branch ledger/t32-team-pr-check · base dbfdc52
    2026-10-29 17:27      running → submitted      report: Options round 3 (options 4/5/6): export-declaration AST detector, comment/test-path noise filter, Terraform bare-block title gate (file-scoped). Frozen key/overlay untouched. M24 bar now PASSES. · checks exit 0 ·
    2026-10-29 17:27      checks ran: npm run check && node packages/decisions/dist/bench/m24.js in /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T32-team-pr-check → exit 0 ((Use `node --trace-warnings ...` to show where the warning was created))
    2026-10-29 18:26      submitted → verified      reviewer fresh-review-a14-r1 · findings: 0 P0. 1 P1 found and fixed by me this round (disclosed, 1 commit 77b31a1): .github/actions/mole-check/action.yml built with 'npx tsc -b packages/daemon', which fails on a genuine 
    2026-10-29 18:26      checks ran: npm run check && node packages/decisions/dist/bench/m24.js in /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T32-team-pr-check → exit 0 ((Use `node --trace-warnings ...` to show where the warning was created))
```
