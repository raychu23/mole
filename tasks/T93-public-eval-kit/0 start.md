---
state: ready
owner: hermes-build
repo:
branch:
worktree:
base:
reviewer:
updated: 2026-11-04 16:47
status: ledger ready
next: worker claims it → ledger move <task> running --orca | --git-worktree | --worktree PATH
---
```notes
T93-public-eval-kit      ledger task (rules.md §3 code features)      project tasks
    goal                    Make the Inspect AI A/B kit (evals/inspect/dcbench_eval, task mole_ab) usable by Mole's public users: an agent option that runs Claude Code or Codex via inspect-swe (users don't have hermes), no private references in the Python, shipped by export-public with docs/experiments.md
    done-when               inspect-swe claude_code/codex agent wired as an arm-independent agent option, tested with mockllm or 1 real call · private-string scan clean with evals shipped · docs/experiments.md commands verified verbatim in a fresh clone of the export · pytest green
    status                  2026-11-04 ready      owner hermes-build
    next                    worker claims it → ledger move <task> running --orca | --git-worktree | --worktree PATH
    pinned
    mode                    one worker
    boundary                evals/inspect, docs/experiments.md, scripts/export-public.mjs
    checks                  npm run check
    non-goals               anything outside boundary
    proof                   4 log/
    stop                    publishing; paid API calls
    came from               USER 11-04 integrate + usable by users; T90 gap
    links                   4 log/ledger.md (every transition + its evidence)
    harness
```
