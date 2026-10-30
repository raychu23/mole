# Mole for Claude Code

Agent-memory plugins (claude-mem, ai-memory, Copilot Memory) carry what the agent did forward to the
next agent. This plugin runs the other direction: it carries the **PEOPLE's decisions** (`.mole/tenets.md`,
`.mole/decisions/*.md`) to the agent, and reports the agent's effect on them back to the person — the
center of Mole (D31: tenets → decisions → exceptions → code/tests/incidents/people, shown where the
developer already works).

## Hooks

- **SessionStart** — the decisions and tenets governing the files in play (uncommitted edits + the last
  3 commits), each as a rule to follow with its current flag (red/yellow/green/grey) and its owner
  (`approver:`), plus your existing notes on those files and any parallel-run collisions. Falls back to
  `(weak spots from T35: not available yet)` until T35 (agent coverage) lands; shows weak spots inline
  once it does.
- **PreToolUse** (`Edit`/`Write`) — when the file you are about to edit is governed by a decision, adds
  that decision's rule once per session (never twice, never a block: it only ever adds context next to
  the tool result, same as every other Mole hook).
- **Stop** — the decisions your session's diff touched (with their new flag), any decision-rule
  violations the diff introduced (T27 `mole rules`, citing the decision id), then the existing past
  fixes, questions, claims and parallel-run collisions.

Same content is available from the MCP server (`mole_check` / `mole_decisions`, both with a `files`
argument) so Codex, Cursor and any other MCP-capable harness gets the same decisions-first context, not
only Claude Code.

A hook never fails your session: on any error it exits 0 and prints nothing.
