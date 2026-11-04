---
state: ready
owner: hermes-build
repo:
branch:
worktree:
base:
reviewer:
updated: 2026-11-04 15:13
status: ledger ready
next: worker claims it → ledger move <task> running --orca | --git-worktree | --worktree PATH
---
```notes
T90-ab-experiment-system      ledger task (rules.md §3 code features)      project tasks
    goal                    A reusable pre-registered A/B experiment system for testing Mole ideas with coding agents (arms, tasks, freeze, runner adapters, scoring, paired stats with intervals, results page), generalising the T63 scripts; its first experiment is protocol v2
    done-when               prior-art note (>=5 fetched, dated: Inspect AI, promptfoo, Braintrust/LangSmith experiments, GrowthBook/Statsig stats, SWE-bench harness) · reuse before build · tests first · T63 72-run data re-analysed by the system reproduces results-72.md numbers exactly · protocol v2 written as its first pre-registered experiment (not run)
    status                  2026-11-04 ready      owner hermes-build
    next                    worker claims it → ledger move <task> running --orca | --git-worktree | --worktree PATH
    pinned
    mode                    one worker
    boundary                new package or bench dir in the Mole repo + docs; T63 raw data read-only
    checks                  npm run check
    non-goals               anything outside boundary
    proof                   4 log/
    stop                    edit raw/runs.jsonl or frozen files · inventing stats (use a published method + cite)
    came from               USER 11-04 'build out full a/b idea testing system', results-72.md next steps
    links                   4 log/ledger.md (every transition + its evidence)
    harness
```
