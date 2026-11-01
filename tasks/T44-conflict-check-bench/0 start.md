---
state: proposed
owner:
repo:
branch:
worktree:
base:
reviewer:
updated: 2026-11-01 17:49
status: ledger proposed
next: fill owner + done-when + boundary + checks + non-goals + proof + stop → ledger move <task> ready
---
```notes
T44-conflict-check-bench      ledger task (rules.md §3 code features)      project tasks
    goal                    M2 resume metric: does Mole flag changes that break an approved team decision? precision/recall/false-alarm rate + $/tokens/p95 ms per check vs LLM reviewer with same decisions, RAG review, linter rules, no check, on a frozen labelled set (Backstage ADRs + Rust RFC decisions).
    done-when               1 prior-art.md (>=5 dated primary sources: SWR-Bench, code-review benchmarks, ADR/architecture conformance checking, LLM-judge cost papers) · 2 protocol + labels frozen and hashed before any arm runs, ~60 changes half breaking · 3 Mole arm uses only shipped code (packages/decisions scope/guard + packages/reasoning), gaps implemented as a reviewed product change, not bench-only glue · 4 all arms run, results.json/results.md with Wilson/bootstrap CIs, cost + latency, loss-first · 5 held-out split untouched while tuning
    status                  2026-11-01 proposed
    next                    fill owner + done-when + boundary + checks + non-goals + proof + stop → ledger move <task> ready
    pinned
    mode                    one worker
    boundary                context/product-plan/systems/metrics-proof/m2-conflict/** + any product change in its own ledger task
    checks                  npm run check
    non-goals
    proof
    stop
    came from               D92/§5 test standards + verifier metrics 11-01.md; USER 11-01 'do whatever needed next'
    links                   4 log/ledger.md (every transition + its evidence)
    harness                 hermes
```
