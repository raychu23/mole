---
state: running
owner: t48-builder
repo: /Users/a1/Desktop/CS Code/Project/Mole
branch: ledger/t48-argument-edges-argdown
worktree: /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T48-argument-edges-argdown
base: 9f7f393
reviewer:
updated: 2026-11-01 21:18
status: ledger running
next: worker finishes → ledger move <task> submitted --report … (ledger runs the checks row)
claimed: 2026-11-01 20:45
---
```notes
T48-argument-edges-argdown      ledger task (rules.md §3 code features)      project tasks
    goal                    Give the decision graph argumentation relations and an authoring format next to design docs, borrowing Argdown's data model (RelationType support/attack/undercut, JSON export) and AIF's RA/CA node split: EdgeType gains supports/attacks/undercuts; an Argdown loader reads .argdown files / argdown code blocks in markdown into the graph; packages/reasoning (T42) evaluates the resulting framework and  shows in/out/undecided per argument. Source: Project/Mole/context/product-plan/systems/core-audit/capture-records-schema.md top 1-2
    done-when               1 failing tests first · 2 Argdown fixtures from the Argdown repo's own examples parse to the same relation counts as Argdown's JSON export (use @argdown/core as a dev dependency or its exported JSON as fixtures; licence checked) · 3 Nixon diamond + an undercut example labelled correctly end to end through the reasoning engine · 4 existing ADR/YAML records unchanged (regression tests) · 5 npm run check
    status                  2026-11-01 running      changes requested: PASS with 1 P1: parser.ts silently accepted invalid Argdown (blank line inside an indented relation b
    next                    worker finishes → ledger move <task> submitted --report … (ledger runs the checks row)
    pinned
    mode                    one worker
    boundary                packages/decisions/src/{types.ts,graph.ts} + new packages/decisions/src/argdown/** + packages/reasoning wiring + tests, avoid compile/, cascade/, rationale.ts, cli.ts except a minimal display hook
    checks                  npm run check
    non-goals               full Argdown grammar (PCS premise-conclusion reconstruction, inference rules, colored map export, CLI), preferred/complete/stable semantics (memo §3: NP/coNP/Pi2P-hard, grounded only per T42), bipolar support semantics evaluated by the reasoning engine (memo §4.3: plain Dung has no support slot, support edges are recorded in the graph but excluded from the Framework passed to evaluate()), touching packages/decisions/src/{compile,cascade}/**, rationale.ts or cli.ts beyond a minimal read-only display hook if unavoidable
    proof                   vitest fixtures: 2 Argdown source fixtures (from @argdown/core's own ModelPlugin.spec.ts relation test + a derived undercut variant) parsed by Mole's loader match relation counts/types from @argdown/core's own parse (devDependency, MIT), Nixon diamond (symmetric attack) + one undercut example run end to end through packages/reasoning evaluate() with the expected in/out/undecided labels, existing ADR/YAML graph.ts regression tests still green
    stop                    ask Raymond before: evaluating support edges in the reasoning engine (needs a named bipolar semantics choice per memo §4.3, out of scope here), building a full Argdown grammar/PCS parser, depending on @argdown/core at runtime instead of as a dev/test-fixture-only dependency
    came from               core audit 11-01 (capture-records-schema top 1-2; plan W1)
    links                   4 log/ledger.md (every transition + its evidence)
    harness                 hermes
```
