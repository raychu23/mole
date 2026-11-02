---
state: running
owner: t43-builder
repo: /Users/a1/Desktop/CS Code/Project/Mole
branch: ledger/t43-full-rationale-records
worktree: /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T43-full-rationale-records
base: 9eb8fad
reviewer:
updated: 2026-11-01 20:41
status: ledger running
next: worker finishes → ledger move <task> submitted --report … (ledger runs the checks row)
claimed: 2026-11-01 17:51
---
```notes
T43-full-rationale-records      ledger task (rules.md §3 code features)      project tasks
    goal                    Agent-facing decision output (MCP tools, hook text, .mole/decisions records, T36 ADR import) carries the full Decision + Rationale/Context + Consequences text, not only the 240-char summaryOf() list summary. Evidence: M-B v2 full-rationale records 18/22 correct vs 1/22 (prelim-11-01/mb-why/v2/results.md); v1 thin records 0.083.
    done-when               1 failing tests first: an imported ADR with a 1,500-char rationale reaches the MCP get/why tool and hook output intact (sections named) · 2 summaryOf stays for list/compact views only · 3 output size bounded by a documented budget with section-aware truncation (never mid-Decision) · 4 re-run M-B dev B arm with records produced by the PRODUCT importer (not hand-made v2) → CORRECT within 1 of v2 hand-made 9/12 · 5 npm run check passes
    status                  2026-11-01 running      changes requested: fresh reviewer FAIL: P0 sectionsOf dropped unmatched sibling sections (adr001 Discussion/Risks, adr00
    next                    worker finishes → ledger move <task> submitted --report … (ledger runs the checks row)
    pinned
    mode                    one worker
    boundary                packages/decisions/** packages/mcp/** packages/daemon/** (hook text) + their tests; read-only elsewhere
    checks                  npm run check
    non-goals               no change to reasoning engine, temporal store, server
    proof                   runs.jsonl last line with the M-B dev B-arm count + npm run check output + the red-tests commit dated before the first implementation commit
    stop                    same check failure 3 rounds in a row · needs Raymond's accounts, paid API spend, people or a product decision (log it in 4 log, move on)
    came from               Mole chat 11-01 M-B v2 result; USER 'make sure core code of project still even better'
    links                   4 log/ledger.md (every transition + its evidence)
    harness                 hermes
```
