---
state: integrated
owner: t49-builder
repo: /Users/a1/Desktop/CS Code/Project/Mole
branch: ledger/t49-verifier-wiring
worktree: /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T49-verifier-wiring
base: b9c2eda
reviewer: reviewer-T49-r1 (deleg_969e97b1 task 1) + parent fix
updated: 2026-11-01 23:30
status: ledger integrated
next: record outcome → ledger move <task> done --outcome … --resources … --prevents …
claimed: 2026-11-01 21:11
---
```notes
T49-verifier-wiring      ledger task (rules.md §3 code features)      project tasks
    goal                    Borrow mature verifier mechanics: wire Mole's existing dependency-cruiser rules engine (rules/check.ts) into prCheck + cascade; paginate check-run annotations past 50 (reviewdog); baseline/shrink-only mode for new rules (dependency-cruiser --baseline); token budget + chunking + fallback for the cascade LLM tier (PR-Agent); Semgrep-style rule fixtures (semgrep --test discipline) for anchors. Source: Project/Mole/context/product-plan/systems/core-audit/verifier.md. Starts after T46 merges.
    done-when               1 failing tests first, 2 import/call rule violation reaches prCheck governed + cascadeCheck zero-llm tier, 3 cascade batches all escalating decisions for one change into ONE LLM call carrying only governing decisions' text + diff chunked to governed hunks, 4 cascade emits a routing output (decision ids that govern a change, zero-LLM: scope+anchors+rules, no LLM call), 5 re-run M2 v2 dev to tune, held-out run ONCE at the end with v2/run scripts, report Mole-routed check vs llm-reviewer vs RAG (recall/FA/cost/p95/routing accuracy), 6 npm run check
    status                  2026-11-01 integrated      merge e1a5f5b · combined checks exit 0 · note: npm run check on main e1a5f5b exit 0
    next                    record outcome → ledger move <task> done --outcome … --resources … --prevents …
    pinned
    mode                    one worker
    boundary                packages/decisions/src/{check,rules,cascade}/** + tests (not rationale.ts, not cli.ts decisions(), not packages/server)
    checks                  npm run check
    non-goals               annotation pagination (#2), baseline/shrink-only mode (#3), semgrep-style fixtures (#5) from verifier.md -- out of scope for T49, left for follow-on tasks
    proof                   context/product-plan/systems/metrics-proof/m2-conflict/v2/run/ held-out results + routing accuracy
    stop                    if held-out recall/cost regresses vs T46 cascade baseline without a clear fix, report and stop rather than keep tuning on held-out
    came from               core audit 11-01 verifier top 5
    links                   4 log/ledger.md (every transition + its evidence)
    harness                 hermes
```
