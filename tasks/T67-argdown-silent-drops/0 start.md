---
state: ready
owner: hermes-build
repo:
branch:
worktree:
base:
reviewer:
updated: 2026-11-03 01:53
status: ledger ready
next: worker claims it → ledger move <task> running --orca | --git-worktree | --worktree PATH
---
```notes
T67-argdown-silent-drops      ledger task (rules.md §3 code features)      project tasks
    goal                    The Argdown loader stops silently dropping data: a duplicate argument id and a self-attack edge each produce an explicit problem or are kept; self-attack semantics follow Dung/ASPIC+/Carneades prior art (a self-attacking argument is out under grounded), recorded as a decision.
    done-when               1 tests first · 2 duplicate id -> problem naming both files/lines · 3 self-attack kept as an edge, grounded label matches the Carneades/ICCMA reference on fixtures · 4 Mole's own graph still 0 problems · 5 decisions + reasoning tests pass
    status                  2026-11-03 ready      owner hermes-build
    next                    worker claims it → ledger move <task> running --orca | --git-worktree | --worktree PATH
    pinned
    mode                    one worker
    boundary                packages/decisions/src/argdown/*, packages/reasoning if needed, tests
    checks                  npm run check
    non-goals               anything outside boundary
    proof                   4 log/
    stop                    Mole repo graph gains problems that are not real
    came from               backlog incident-loader-indent + argdown-self-attack; inventory F41
    links                   4 log/ledger.md (every transition + its evidence)
    harness
```
