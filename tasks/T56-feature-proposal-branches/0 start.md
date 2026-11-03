---
state: submitted
owner: codex-proposals
repo: /Users/a1/Desktop/CS Code/Project/Mole
branch: build/t56-proposals-1102
worktree: /Users/a1/.hermes/cache/scratch/mole-build/T56
base: 0029416
reviewer:
updated: 2026-11-02 18:17
status: ledger submitted
next: fresh reviewer → ledger move <task> verified --reviewer … --findings …
claimed: 2026-11-02 17:02
---
```notes
T56-feature-proposal-branches      ledger task (rules.md §3 code features)      project tasks
    goal                    D67 first working slice: create isolated git worktree branches of decision records, evaluate competing proposals against the same pinned approved baseline with the existing graph/argument engine, and compare explained affected outcomes without mutating baseline records.
    done-when               Primary prior art and fit check saved before code; failing test first; real temp-git-repo CLI create/evaluate/compare smoke; two proposal branches use same immutable baseline; approved record tree unchanged; malformed input/collisions/dirty-root cases safe; deterministic output includes source ids and base revision; tests and typecheck pass.
    status                  2026-11-02 submitted      report: tasks/T56-feature-proposal-branches/2 insights.md · checks exit 0 · note: worktree npm run check after fast-forw
    next                    fresh reviewer → ledger move <task> verified --reviewer … --findings …
    pinned
    mode                    one worker
    boundary                New packages/proposals/** plus minimal build references only if needed, no edits to existing decisions CLI/capture/cascade/reasoning; main live records untouched.
    checks                  npm run check
    non-goals               No staged rollout/holdout outcomes, no automatic approval or merge, no semantic inference from arbitrary prose, no paid model calls, no commits/push/deploy, no prototype directory.
    proof                   CLI transcript on real throwaway repo with two alternative decision branches, baseline tree hash before/after, failure-path tests, focused and full checks.
    stop                    Stop if worktree safety or baseline immutability cannot be established; preserve user changes; do not fabricate proposal accuracy metrics.
    came from               USER 2026-11-02 get started building consolidated backlog; D67 in plan update 11-01.
    links                   4 log/ledger.md (every transition + its evidence)
    harness                 codex
```
