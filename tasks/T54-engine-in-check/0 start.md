---
state: proposed
owner:
repo:
branch:
worktree:
base:
reviewer:
updated: 2026-11-02 10:44
status: ledger proposed
next: fill owner + done-when + boundary + checks + non-goals + proof + stop → ledger move <task> ready
---
```notes
T54-engine-in-check      ledger task (rules.md §3 code features)      project tasks
    goal                    Put the reasoning engine (packages/reasoning, T42) and the argument links (T48: supports/attacks/undercuts, Argdown) into the change-check path, so a flagged change is judged against the decision's argument chain (objections answered/standing, team value order) rather than its text alone; makes resume B2's 're-runs the team's argument chain' true. Prior art first: Carneades proof standards (Gordon & Walton), ASPIC+ / abstract argumentation for requirements & design rationale (e.g. argumentation-based design rationale checking), ArgLLMs (arXiv 2405.02079).
    done-when               1 prior-art note · 2 failing tests first · 3 cascade verdict carries the engine's labels for the decision's arguments (which still stand) and uses them in the judge prompt or rules · 4 M2 v2 re-run (dev tuned, held-out once): recall and false alarms no worse than T53 (0.96 / 0.05 all-61), report any change · 5 npm run check
    status                  2026-11-02 proposed
    next                    fill owner + done-when + boundary + checks + non-goals + proof + stop → ledger move <task> ready
    pinned
    mode                    one worker
    boundary                packages/decisions/src/{cascade,route}/** + reasoning wiring + tests
    checks                  npm run check
    non-goals
    proof
    stop
    came from               USER 11-02 'all needed mentioned'; S6 blocker #244 B2 wording
    links                   4 log/ledger.md (every transition + its evidence)
    harness                 hermes
```
