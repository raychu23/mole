---
state: proposed
owner: hermes-build
repo:
branch:
worktree:
base:
reviewer:
updated: 2026-11-02 19:26
status: ledger proposed
next: fill owner + done-when + boundary + checks + non-goals + proof + stop → ledger move <task> ready
---
```notes
T60-phase-priorities      ledger task (rules.md §3 code features)      project tasks
    goal                    Tenets reranked as priorities shift from launch to scale (backlog value-order; human graph 11-01 'phase' + Le-Brun tenets in descending priority; Bench-Capon value-based AF already in packages/reasoning engine.ts:31-51): .mole/priorities.md lists phases (name + from date) each with an ordered tenet list; an argument declares the tenet it serves with a #tenet-N tag on its definition line; mole priorities [--at DATE | --phase P] evaluates the decision graph under that phase's order (audience) and mole priorities --compare A B lists decisions/arguments whose state differs, each with the attack that succeeds in one phase and fails in the other and the two tenets compared.
    done-when               1 tests first (red) · 2 no priorities file / no tags = labels identical to today (Dung, no audience) · 3 --compare explains every changed label with the flipped attack + both tenets + both phases' ranks · 4 --at picks the phase whose from date is the latest <= DATE; unknown phase/tenet, duplicate rank, a date before every phase refused with file:line · 5 replay on a real ADR as records (two tenets, launch vs scale) shows one decision flip, explained · 6 npm run check
    status                  2026-11-02 proposed
    next                    fill owner + done-when + boundary + checks + non-goals + proof + stop → ledger move <task> ready
    pinned
    mode                    one worker
    boundary                packages/decisions/src/priorities.ts (new), argdown/framework.ts (optional value from #tenet tag), decisions cli.ts + index.ts, one line in packages/daemon/src/cli.ts, tests
    checks                  npm run check
    non-goals               inferring the order from past decisions (A3, separate, needs held-out human labels) · floors (safety/legal never traded) · UI · changing approved records
    proof                   4 log/replay.txt
    stop                    any label change when no priorities file exists
    came from               Hermes chat 11-02 'get started building ... one by one'; backlog value-order; resume B1 'tenets reranked as priorities shift from launch to scale'
    links                   4 log/ledger.md (every transition + its evidence)
    harness
```
