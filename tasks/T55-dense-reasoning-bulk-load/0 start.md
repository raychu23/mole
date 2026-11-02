---
state: running
owner: hermes-build
repo: /Users/a1/Desktop/CS Code/Project/Mole
branch: build/t55-dense-load-1102
worktree: /Users/a1/.hermes/cache/scratch/mole-build/T55
base: 0029416
reviewer:
updated: 2026-11-02 16:54
status: ledger running
next: worker finishes → ledger move <task> submitted --report … (ledger runs the checks row)
claimed: 2026-11-02 16:54
---
```notes
T55-dense-reasoning-bulk-load      ledger task (rules.md §3 code features)      project tasks
    goal                    Load an existing argument graph without recomputing once per edge, retaining full/incremental agreement and public edit behavior; fix the dense graph skipped by the engine comparison.
    done-when               Regression test fails before fix; initial bulk load does not call per-edge mutation API; dense saved ICCMA instance finishes and equals full evaluation before/after an edit; input validation consistent; npm run check.
    status                  2026-11-02 running      worktree /Users/a1/.hermes/cache/scratch/mole-build/T55 · branch build/t55-dense-load-1102 · base 0029416
    next                    worker finishes → ledger move <task> submitted --report … (ledger runs the checks row)
    pinned
    mode                    one worker
    boundary                packages/reasoning/src/incremental.ts and focused reasoning tests; benchmark scripts only under task evidence
    checks                  npm run check
    non-goals               No semantics changes, no new benchmark headline from changed protocol, no commits/push/deploy, no changes to live .mole records.
    proof                   Task red/green run logs plus dense-load reproduction timing and exact label checks.
    stop                    Stop on unexplained label disagreement or repeated failing check; do not weaken tests.
    came from               USER 2026-11-02 get started building; build-backlog dense-load
    links                   4 log/ledger.md (every transition + its evidence)
    harness                 hermes
```
