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
T51-capture-cli-dedupe      ledger task (rules.md §3 code features)      project tasks
    goal                    adr-tools-style record workflow (mole decision new / supersede / link writing both sides atomically) + Graphiti-style deterministic fuzzy dedupe (exact + MinHash/LSH, no LLM stage) for multi-source records. Source: Project/Mole/context/product-plan/systems/core-audit/capture-records-schema.md top 3-4.
    done-when               1 failing tests first · 2 supersede updates both records in one write · 3 near-duplicate imports flagged, not merged silently · 4 npm run check
    status                  2026-11-01 proposed
    next                    fill owner + done-when + boundary + checks + non-goals + proof + stop → ledger move <task> ready
    pinned
    mode                    one worker
    boundary                packages/decisions/src/cli.ts + new capture/** + tests
    checks                  npm run check
    non-goals
    proof
    stop
    came from               core audit 11-01
    links                   4 log/ledger.md (every transition + its evidence)
    harness                 hermes
```
