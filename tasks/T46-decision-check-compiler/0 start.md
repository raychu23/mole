---
state: proposed
owner:
repo:
branch:
worktree:
base:
reviewer:
updated: 2026-11-01 19:48
status: ledger proposed
next: fill owner + done-when + boundary + checks + non-goals + proof + stop → ledger move <task> ready
---
```notes
T46-decision-check-compiler      ledger task (rules.md §3 code features)      project tasks
    goal                    Make Mole's zero-LLM conflict check catch what an LLM reviewer catches at a fraction of the cost: (1) compile-at-capture: when a decision is recorded/imported, a model drafts machine checks for it (content anchors, scope globs, dependency-cruiser forbidden rules, Semgrep patterns, guard-test links) that a person approves; stored with the decision · (2) cascade at check time: zero-LLM rules run on every change; only changes that touch a governed scope but match no rule decisively escalate to one LLM call with that single decision (FrugalGPT-style cascade). Evidence: T44 m2-conflict/results.md Mole recall 0.50 (8/15 Backstage ADRs have no anchors) vs LLM reviewer 1.00 at $0.0048/5.3 s.
    done-when               1 prior-art note (ADR-violation detection arXiv 2602.07609, LLM-generated Semgrep/ArchUnit rules, FrugalGPT cascades arXiv 2305.05176, dependency-cruiser) in tasks/T46*/4 log/prior-art.md · 2 failing tests first · 3 compiled checks stored + versioned with the decision, approve/reject flow in CLI + MCP · 4 cascade API returns verdict + which tier decided + tokens used · 5 on T44 dev cases: recall >= LLM reviewer's minus 1 case, false alarms <= LLM's, mean cost/check <= 25% of LLM reviewer (held-out untouched) · 6 npm run check green
    status                  2026-11-01 proposed
    next                    fill owner + done-when + boundary + checks + non-goals + proof + stop → ledger move <task> ready
    pinned
    mode                    one worker
    boundary                packages/decisions/** packages/verify/** packages/mcp/** + tests
    checks                  npm run check
    non-goals               no server/checkrun change (T45) · no reasoning engine change
    proof
    stop
    came from               T44 result 11-01; USER 'make it good perform well on the robust industry recognized tests'
    links                   4 log/ledger.md (every transition + its evidence)
    harness                 hermes
```
