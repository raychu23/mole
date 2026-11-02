---
state: ready
owner: t50-builder
repo:
branch:
worktree:
base:
reviewer:
updated: 2026-11-02 05:30
status: ledger ready
next: worker claims it → ledger move <task> running --orca | --git-worktree | --worktree PATH
---
```notes
T50-agent-surfaces      ledger task (rules.md §3 code features)      project tasks
    goal                    Make agents use the decision at the right moment, borrowing from official MCP servers, Serena and Claude Code hook docs: PreToolUse carries the governing decision's line/test evidence (as Stop already does); max_answer_chars + pagination on mole_check/mole_decisions/mole_coverage; tool annotations + outputSchema/structuredContent on all tools; caller-tunable mole_map cap; description-matched fallback for decisions without a file scope (Cursor rules). Source: Project/Mole/context/product-plan/systems/core-audit/agent-surfaces.md. Starts after T43 merges.
    done-when               1 failing tests first · 2 PreToolUse text for B3 case names the guard test + decision rule · 3 every tool output bounded + paginated · 4 MCP SDK schema validation passes for all tools · 5 M-C v3 (>= 8 tasks, 3 epochs) run after merge · 6 npm run check
    status                  2026-11-02 ready      owner t50-builder
    next                    worker claims it → ledger move <task> running --orca | --git-worktree | --worktree PATH
    pinned
    mode                    one worker
    boundary                packages/mcp/** plugins/claude-code/** + tests
    checks                  npm run check
    non-goals               no change to packages/daemon, packages/decisions, packages/coverage source (daemon-side mole_map node cap, decision-graph loader, coverage scanner stay as-is), no change to the Postgres bitemporal engine, no new MCP resources/prompts (audit item 6, lower priority, not in done-when), M-C v3 run (separate task after merge)
    proof                   packages/mcp/test/*.test.ts + plugins/claude-code/test/*.test.ts all green, a test asserting PreToolUse's B3 (.mole/decisions/0009) text contains the guard test name, tests asserting mole_check/mole_decisions/mole_coverage are bounded+paginated, a test calling every registered tool and asserting MCP SDK output-schema validation does not throw
    stop                    if the MCP SDK's own output-schema validation (safeParseAsync against outputSchema) conflicts with an existing tool's real return shape in a way that would require changing packages/decisions or packages/coverage output types (out of boundary), stop and report the conflict instead of loosening the boundary
    came from               core audit 11-01 agent-surfaces top 5; M-C v2
    links                   4 log/ledger.md (every transition + its evidence)
    harness                 hermes
```
