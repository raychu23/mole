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
T49-verifier-wiring      ledger task (rules.md §3 code features)      project tasks
    goal                    Borrow mature verifier mechanics: wire Mole's existing dependency-cruiser rules engine (rules/check.ts) into prCheck + cascade; paginate check-run annotations past 50 (reviewdog); baseline/shrink-only mode for new rules (dependency-cruiser --baseline); token budget + chunking + fallback for the cascade LLM tier (PR-Agent); Semgrep-style rule fixtures (semgrep --test discipline) for anchors. Source: Project/Mole/context/product-plan/systems/core-audit/verifier.md. Starts after T46 merges.
    done-when               1 failing tests first · 2 an import: rule violation reaches prCheck output · 3 120 annotations all delivered · 4 baseline hides pre-existing violations only · 5 cascade never exceeds its token budget on a 5k-line diff · 6 re-run M2 v2 dev, held-out once · 7 npm run check
    status                  2026-11-01 proposed
    next                    fill owner + done-when + boundary + checks + non-goals + proof + stop → ledger move <task> ready
    pinned
    mode                    one worker
    boundary                packages/decisions/src/{check,rules,cascade}/** + tests
    checks                  npm run check
    non-goals
    proof
    stop
    came from               core audit 11-01 verifier top 5
    links                   4 log/ledger.md (every transition + its evidence)
    harness                 hermes
```
