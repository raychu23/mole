---
state: running
owner: hermes-build
repo: /Users/a1/Desktop/CS Code/Project/Mole
branch: ledger/t90-ab-experiment-system
worktree: /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T90-ab-experiment-system
base:
reviewer:
updated: 2026-11-04 15:13
status: ledger running
next: worker finishes → ledger move <task> submitted --report … (ledger runs the checks row)
claimed: 2026-11-04 15:13
---
```notes
T90-ab-experiment-system      ledger task (rules.md §3 code features)      project tasks
    goal                    A reusable pre-registered A/B experiment system for testing Mole ideas with coding agents (arms, tasks, freeze, runner adapters, scoring, paired stats with intervals, results page), generalising the T63 scripts; its first experiment is protocol v2
    done-when               prior-art note (>=5 fetched, dated: Inspect AI, promptfoo, Braintrust/LangSmith experiments, GrowthBook/Statsig stats, SWE-bench harness) · reuse before build · tests first · T63 72-run data re-analysed by the system reproduces results-72.md numbers exactly · protocol v2 written as its first pre-registered experiment (not run)
    status                  2026-11-04 running      worktree /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T90-ab-experiment-system · branch ledger/t90-ab-experiment-sys
    next                    worker finishes → ledger move <task> submitted --report … (ledger runs the checks row)
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
