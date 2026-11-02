---
state: proposed
owner:
repo:
branch:
worktree:
base:
reviewer:
updated: 2026-11-01 20:41
status: ledger proposed
next: fill owner + done-when + boundary + checks + non-goals + proof + stop → ledger move <task> ready
---
```notes
T48-argument-edges-argdown      ledger task (rules.md §3 code features)      project tasks
    goal                    Give the decision graph argumentation relations and an authoring format next to design docs, borrowing Argdown's data model (RelationType support/attack/undercut, JSON export) and AIF's RA/CA node split: EdgeType gains supports/attacks/undercuts; an Argdown loader reads .argdown files / argdown code blocks in markdown into the graph; packages/reasoning (T42) evaluates the resulting framework and  shows in/out/undecided per argument. Source: Project/Mole/context/product-plan/systems/core-audit/capture-records-schema.md top 1-2
    done-when               1 failing tests first · 2 Argdown fixtures from the Argdown repo's own examples parse to the same relation counts as Argdown's JSON export (use @argdown/core as a dev dependency or its exported JSON as fixtures; licence checked) · 3 Nixon diamond + an undercut example labelled correctly end to end through the reasoning engine · 4 existing ADR/YAML records unchanged (regression tests) · 5 npm run check
    status                  2026-11-01 proposed
    next                    fill owner + done-when + boundary + checks + non-goals + proof + stop → ledger move <task> ready
    pinned
    mode                    one worker
    boundary                packages/decisions/src/{types.ts,graph.ts} + new packages/decisions/src/argdown/** + packages/reasoning wiring + tests; avoid compile/, cascade/, rationale.ts, cli.ts except a minimal display hook
    checks                  npm run check
    non-goals
    proof
    stop
    came from               core audit 11-01 (capture-records-schema top 1-2; plan W1)
    links                   4 log/ledger.md (every transition + its evidence)
    harness                 hermes
```
