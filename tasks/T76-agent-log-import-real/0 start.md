---
state: ready
owner: hermes-build
repo:
branch:
worktree:
base:
reviewer:
updated: 2026-11-03 05:34
status: ledger ready
next: worker claims it → ledger move <task> running --orca | --git-worktree | --worktree PATH
---
```notes
T76-agent-log-import-real      ledger task (rules.md §3 code features)      project tasks
    goal                    T39's importers (Entire checkpoints, git-ai Git Notes, Agent Trace) were proven only on fixtures built from the tools' docs. Obtain REAL output from at least one tool (install the real git-ai and/or Entire CLI from their official repos/releases and produce real records on a scratch repo, or use public repos that already carry their notes/checkpoints) and make the importers link it correctly.
    done-when               1 prior-art note: each tool's real format at a pinned version (source files, not docs) · 2 real output captured to 4 log/real-samples/ with how it was produced · 3 tests first on the real samples · 4 >=90% of real records linked, 0 wrong links (hand-checked table) · 5 agentstate tests pass
    status                  2026-11-03 ready      owner hermes-build
    next                    worker claims it → ledger move <task> running --orca | --git-worktree | --worktree PATH
    pinned
    mode                    one worker
    boundary                packages/agentstate/src/importers + tests
    checks                  npm run check
    non-goals               anything outside boundary
    proof                   4 log/
    stop                    real output cannot be obtained -> record NOT RUN with what was tried and keep the claim 'fixture-only'
    came from               inventory F32; D45/D46; resume verification: fixture-only
    links                   4 log/ledger.md (every transition + its evidence)
    harness
```
