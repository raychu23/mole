---
state: running
owner: hermes-build
repo: /Users/a1/Desktop/CS Code/Project/Mole
branch: ledger/t89-mj-arm
worktree: /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T89-mj-arm
base:
reviewer:
updated: 2026-11-04 15:35
status: ledger running (24 scored runs launched, in flight)
next: poll /Users/a1/.hermes/cache/scratch/dcbench/scored-mj.log + raw/runs-mj.jsonl until 24/24, write results-mj.md, then ledger move <task> submitted --report … (ledger runs the checks row)
claimed: 2026-11-04 15:12
---
```notes
T89-mj-arm      ledger task (rules.md §3 code features)      project tasks
    goal                    T63 pre-registered M+J arm (D96): Mole as shipped with the haiku router + judge after the edit, so a judged violation forces one resume; scored on the same 8 dcbench tasks and the same pin as A/R/M
    done-when               prior-art + protocol addendum frozen (sha256) before run 1 · dry run 3/3 · 24 scored runs (8 tasks x 3) · results-mj.md vs the 72, losses first, paired permutation · judge cost separate
    status                  2026-11-04 running      worktree /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T89-mj-arm · branch ledger/t89-mj-arm · base ?
    next                    worker finishes → ledger move <task> submitted --report … (ledger runs the checks row)
    pinned
    mode                    one worker
    boundary                context/product-plan/systems/metrics-proof/productivity/ (arm addendum, runner flag, results) and plugins/claude-code only if a bug blocks the judge path (then a separate fix commit)
    checks                  npm run check
    non-goals               anything outside boundary
    proof                   4 log/
    stop                    any edit to frozen A/R/M files · mixing agent models · tuning after run 1
    came from               D96, D94, USER 11-04 blanket approval
    links                   4 log/ledger.md (every transition + its evidence)
    harness
```
