---
state: running
owner: hermes-build
repo: /Users/a1/Desktop/CS Code/Project/Mole
branch: ledger/t63-dcbench-mole-arm
worktree: /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T63-dcbench-mole-arm
base:
reviewer:
updated: 2026-11-03 05:35
status: ledger running
next: worker finishes → ledger move <task> submitted --report … (ledger runs the checks row)
claimed: 2026-11-03 05:35
---
```notes
T63-dcbench-mole-arm      ledger task (rules.md §3 code features)      project tasks
    goal                    B3 productivity proof on a public benchmark: add a Mole arm (M) and a rules-file arm (R) to dcbench (brief-hq/dcbench, MIT, arXiv 2605.08112) beside its codebase-only arm (A), same tasks + scorer unchanged, one model via hermes -z; report decision compliance, merge-ready, cost per merge-ready task and wall time to a merge-ready 100%-compliant diff, R vs M first. Protocol: context/product-plan/systems/metrics-proof/productivity/protocol.md.
    done-when               1 harness: dcbench cloned at a pinned commit, runner spawn swapped for hermes -z only (diff reviewed), M records + R CLAUDE.md generated from seed-data.ts by a script · 2 protocol sha256 frozen before run 1 · 3 dry run 1 task × 3 arms passes end to end · 4 scored runs (count per Raymond's answer) · 5 per task × arm table + paired test, losses first · 6 fresh review of harness diff + table
    status                  2026-11-03 running      worktree /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T63-dcbench-mole-arm · branch ledger/t63-dcbench-mole-arm · ba
    next                    worker finishes → ledger move <task> submitted --report … (ledger runs the checks row)
    pinned
    mode                    one worker
    boundary                scratch clone of dcbench + bench/dcbench/ adapter + generator script in Mole; no change to dcbench tasks.ts/scorer.ts
    checks                  npm run check
    non-goals               Brief arm rerun (needs their API) · human timing (METR style) · tuning prompts or records after run 1
    proof                   context/product-plan/systems/metrics-proof/productivity/results.md
    stop                    any edit to scorer/tasks/records after the first scored run, or mixing models
    came from               Hermes chat 11-02 'yes do rest whatever. needed as planned'; backlog productivity-proof; B3 'rapid A/B feature trials'
    links                   4 log/ledger.md (every transition + its evidence)
    harness
```
