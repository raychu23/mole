---
state: proposed
owner: hermes-build
repo:
branch:
worktree:
base:
reviewer:
updated: 2026-11-04 16:47
status: ledger proposed
next: fill owner + done-when + boundary + checks + non-goals + proof + stop → ledger move <task> ready
---
```notes
T94-szz-why-study      ledger task (rules.md §3 code features)      project tasks
    goal                    D82: does a stated 'why' (decision record / ADR / rationale in the commit or PR) go with fewer bug-inducing changes? SZZ via PyDriller on public repos with ADRs, pre-registered, honest either way
    done-when               prior-art (SZZ variants, PyDriller, published ADR-quality studies) · protocol frozen before mining · >=3 repos · effect + CI + confounders (size, churn, author experience) · results doc, losses first
    status                  2026-11-04 proposed
    next                    fill owner + done-when + boundary + checks + non-goals + proof + stop → ledger move <task> ready
    pinned
    mode                    one worker
    boundary                bench/ or evals/ scripts + a results doc in the task folder
    checks                  npm run check
    non-goals               anything outside boundary
    proof                   4 log/
    stop                    p-hacking (one pre-registered analysis), claims beyond the data
    came from               D82 approved under D101, decision-triage rank 4
    links                   4 log/ledger.md (every transition + its evidence)
    harness
```
