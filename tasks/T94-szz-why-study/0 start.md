---
state: running
owner: hermes-build
repo: /Users/a1/Desktop/CS Code/Project/Mole
branch: ledger/t94-szz-why-study
worktree: /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T94-szz-why-study
base:
reviewer:
updated: 2026-11-04 16:47
status: ledger running
next: worker finishes → ledger move <task> submitted --report … (ledger runs the checks row)
claimed: 2026-11-04 16:47
---
```notes
T94-szz-why-study      ledger task (rules.md §3 code features)      project tasks
    goal                    D82: does a stated 'why' (decision record / ADR / rationale in the commit or PR) go with fewer bug-inducing changes? SZZ via PyDriller on public repos with ADRs, pre-registered, honest either way
    done-when               prior-art (SZZ variants, PyDriller, published ADR-quality studies) · protocol frozen before mining · >=3 repos · effect + CI + confounders (size, churn, author experience) · results doc, losses first
    status                  2026-11-04 running      worktree /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T94-szz-why-study · branch ledger/t94-szz-why-study · base ?
    next                    worker finishes → ledger move <task> submitted --report … (ledger runs the checks row)
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
