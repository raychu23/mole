---
state: proposed
owner: hermes-build
repo:
branch:
worktree:
base:
reviewer:
updated: 2026-11-04 16:47
status: ledger proposed
next: fill owner + done-when + boundary + checks + non-goals + proof + stop → ledger move <task> ready
---
```notes
T95-scip-multilang      ledger task (rules.md §3 code features)      project tasks
    goal                    D71 rank 1: read SCIP indexes (sourcegraph/scip) so Mole's map, rules and checks work beyond TypeScript (start with Python via scip-python and Go via scip-go), reusing the official SCIP protobuf schema and bindings
    done-when               prior-art (SCIP spec + bindings, who consumes SCIP) · tests first on small fixture repos indexed by the real indexers (or checked-in .scip fixtures if indexers can't install) · mole rules forbid:import works on a Python fixture · README Limits updated honestly
    status                  2026-11-04 proposed
    next                    fill owner + done-when + boundary + checks + non-goals + proof + stop → ledger move <task> ready
    pinned
    mode                    one worker
    boundary                packages/indexer (or a new packages/scip), packages/decisions rules adapter, docs
    checks                  npm run check
    non-goals               anything outside boundary
    proof                   4 log/
    stop                    hand-written parsers of other languages
    came from               D71 approved under D101, decision-triage rank 1, UX research 'TypeScript only' limit
    links                   4 log/ledger.md (every transition + its evidence)
    harness
```
