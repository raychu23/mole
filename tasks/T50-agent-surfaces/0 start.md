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
T50-agent-surfaces      ledger task (rules.md §3 code features)      project tasks
    goal                    Make agents use the decision at the right moment, borrowing from official MCP servers, Serena and Claude Code hook docs: PreToolUse carries the governing decision's line/test evidence (as Stop already does); max_answer_chars + pagination on mole_check/mole_decisions/mole_coverage; tool annotations + outputSchema/structuredContent on all tools; caller-tunable mole_map cap; description-matched fallback for decisions without a file scope (Cursor rules). Source: Project/Mole/context/product-plan/systems/core-audit/agent-surfaces.md. Starts after T43 merges.
    done-when               1 failing tests first · 2 PreToolUse text for B3 case names the guard test + decision rule · 3 every tool output bounded + paginated · 4 MCP SDK schema validation passes for all tools · 5 M-C v3 (>= 8 tasks, 3 epochs) run after merge · 6 npm run check
    status                  2026-11-01 proposed
    next                    fill owner + done-when + boundary + checks + non-goals + proof + stop → ledger move <task> ready
    pinned
    mode                    one worker
    boundary                packages/mcp/** plugins/claude-code/** + tests
    checks                  npm run check
    non-goals
    proof
    stop
    came from               core audit 11-01 agent-surfaces top 5; M-C v2
    links                   4 log/ledger.md (every transition + its evidence)
    harness                 hermes
```
