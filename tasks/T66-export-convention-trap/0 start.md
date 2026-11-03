---
state: integrated
owner: hermes-build
repo: /Users/a1/Desktop/CS Code/Project/Mole
branch: ledger/t66-export-convention-trap
worktree: /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T66-export-convention-trap
base:
reviewer: hermes-subagent deleg_34eee310 FAIL then deleg_f93d50cf PASS (fresh, claude-sonnet-5)
updated: 2026-11-03 03:51
status: ledger integrated
next: record outcome → ledger move <task> done --outcome … --resources … --prevents …
claimed: 2026-11-03 01:53
---
```notes
T66-export-convention-trap      ledger task (rules.md §3 code features)      project tasks
    goal                    A decision whose title merely contains a word starting 'export' (e.g. 'Audit every data export') must not be treated as a JS module-export rule that fires crisply with no judge. Let the export-convention hit route the decision and the cascade judge decide, or narrow the title test to module-export wording, whichever the evidence supports.
    done-when               1 tests first (red): 'Audit every data export' + a new TS export -> not a crisp zero-llm violation · 2 the M2 export-convention cases that motivated option 4 (bs-adr004 etc.) still caught: zero-LLM part of m2-conflict v3 before/after, same catches · 3 packages/decisions tests pass
    status                  2026-11-03 integrated      merge 03d30e5, main 91aec47 full check 1133 pass 0 fail (/Users/a1/.hermes/cache/scratch/mole-build/main-check-waveA.txt
    next                    record outcome → ledger move <task> done --outcome … --resources … --prevents …
    pinned
    mode                    one worker
    boundary                packages/decisions/src/check/{options,pr-check}.ts, cascade/cascade.ts, tests
    checks                  npm run check
    non-goals               anything outside boundary
    proof                   4 log/
    stop                    any lost catch on the M2 v3 set without a written trade-off
    came from               T65 found 11-03; blocks T63 freeze (dcbench D-002)
    links                   4 log/ledger.md (every transition + its evidence)
    harness
```
