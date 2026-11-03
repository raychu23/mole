---
state: integrated
owner: hermes-build
repo: /Users/a1/Desktop/CS Code/Project/Mole
branch: ledger/t78-one-way-door-assurance
worktree: /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T78-one-way-door-assurance
base:
reviewer: hermes-subagent deleg_96eab0c0 FAIL, deleg_aebe7ae6 FAIL, deleg_77e88544 PASS (fresh, claude-sonnet-5)
updated: 2026-11-03 07:01
status: ledger integrated
next: record outcome → ledger move <task> done --outcome … --resources … --prevents …
claimed: 2026-11-03 05:35
---
```notes
T78-one-way-door-assurance      ledger task (rules.md §3 code features)      project tasks
    goal                    For one-way-door decisions only (D65), record assurance fields per link: doubt type (rebutting/undermining/undercutting, ASPIC+), provenance (person/compiler/model), author != approver, ALCOA+ attributes, and a scheduled re-verification date; `mole assurance [--folder X]` reports the assured share per folder and what is overdue.
    done-when               1 prior-art note (ALCOA+ FDA/MHRA data-integrity guidance, ASPIC+ attack types, Bezos one-way vs two-way doors; how Mole already infers doors: find the existing door inference and measure its reliability on the corpora first) · 2 STOP check: if door inference is unreliable (<80% agreement on a hand-labelled sample of >=20 real ADRs), record it and scope assurance to an explicit `door: one-way` front-matter field instead · 3 tests first · 4 report on a real corpus · 5 decisions tests pass
    status                  2026-11-03 integrated      merge 4b0644c (main check green: Tests  1268 passed | 19 skipped (1287), mole-build/main-check-waveC.txt) · combined che
    next                    record outcome → ledger move <task> done --outcome … --resources … --prevents …
    pinned
    mode                    one worker
    boundary                packages/decisions (assurance/), daemon cli, tests
    checks                  npm run check
    non-goals               anything outside boundary
    proof                   4 log/
    stop                    assurance scoped to an unreliable inference without saying so
    came from               D65; inventory F67
    links                   4 log/ledger.md (every transition + its evidence)
    harness
```
