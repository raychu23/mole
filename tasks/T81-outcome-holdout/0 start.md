---
state: integrated
owner: hermes-build
repo: /Users/a1/Desktop/CS Code/Project/Mole
branch: ledger/t81-outcome-holdout
worktree: /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T81-outcome-holdout
base:
reviewer: hermes-subagent deleg_4aace94e PASS (fresh, claude-sonnet-5)
updated: 2026-11-03 09:35
status: ledger integrated
next: record outcome → ledger move <task> done --outcome … --resources … --prevents …
claimed: 2026-11-03 07:03
---
```notes
T81-outcome-holdout      ledger task (rules.md §3 code features)      project tasks
    goal                    Outcome ledger (D66, backlog outcome-holdout): a decision can carry a prediction (expected outcome + measurable signal + check-at date) and later a realized outcome; `mole outcomes [--due] [--json]` lists due/overdue checks and the prediction-vs-outcome record; a staged rollout record names the treated scope and a holdout scope (no assignment logic beyond recording it). Outcomes that contradict a prediction surface as a suggested incident for the existing T58 revival path (human-gated, never automatic).
    done-when               1 prior-art note (pre-registration / decision journals: Annie Duke, Kahneman premortem; experiment registries; holdout practice from online controlled experiments, Kohavi et al.) · 2 tests first · 3 front-matter fields documented in the record template · 4 demo on a temp repo in 4 log · 5 decisions tests pass
    status                  2026-11-03 integrated      merge 5cb3bba (main check green: Tests  1294 passed | 19 skipped (1313), mole-build/main-check-waveD1b.txt) · combined c
    next                    record outcome → ledger move <task> done --outcome … --resources … --prevents …
    pinned
    mode                    one worker
    boundary                packages/decisions (outcomes/), daemon cli, read-only MCP tool optional, tests
    checks                  npm run check
    non-goals               anything outside boundary
    proof                   4 log/
    stop                    any automatic acceptance or verdict change from an outcome
    came from               D66; backlog outcome-holdout; inventory F59
    links                   4 log/ledger.md (every transition + its evidence)
    harness
```
