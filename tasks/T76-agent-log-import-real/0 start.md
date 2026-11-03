---
state: integrated
owner: hermes-build
repo: /Users/a1/Desktop/CS Code/Project/Mole
branch: ledger/t76-agent-log-import-real
worktree: /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T76-agent-log-import-real
base:
reviewer: hermes-subagent deleg_96eab0c0 FAIL, deleg_aebe7ae6 PASS (fresh, claude-sonnet-5)
updated: 2026-11-03 06:44
status: ledger integrated
next: record outcome → ledger move <task> done --outcome … --resources … --prevents …
claimed: 2026-11-03 05:34
---
```notes
T76-agent-log-import-real      ledger task (rules.md §3 code features)      project tasks
    goal                    T39's importers (Entire checkpoints, git-ai Git Notes, Agent Trace) were proven only on fixtures built from the tools' docs. Obtain REAL output from at least one tool (install the real git-ai and/or Entire CLI from their official repos/releases and produce real records on a scratch repo, or use public repos that already carry their notes/checkpoints) and make the importers link it correctly.
    done-when               1 prior-art note: each tool's real format at a pinned version (source files, not docs) · 2 real output captured to 4 log/real-samples/ with how it was produced · 3 tests first on the real samples · 4 >=90% of real records linked, 0 wrong links (hand-checked table) · 5 agentstate tests pass
    status                  2026-11-03 integrated      merge 2ee4fc1 (main check green: Tests  1268 passed | 19 skipped (1287), mole-build/main-check-waveC.txt) · combined che
    next                    record outcome → ledger move <task> done --outcome … --resources … --prevents …
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
