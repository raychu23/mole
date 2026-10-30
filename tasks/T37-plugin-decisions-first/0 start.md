---
state: verified
owner: mole-builder-8
repo: /Users/a1/Desktop/CS Code/Project/Mole
branch: ledger/t37-plugin-decisions-first
worktree: /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T37-plugin-decisions-first
base: fb2399e
reviewer: fresh-review-subagent-a18-r1
updated: 2026-10-29 21:54
status: ledger verified
next: merge → ledger move <task> integrated --merge … (ledger reruns checks in the repo)
claimed: 2026-10-29 21:15
---
```notes
T37-plugin-decisions-first      ledger task (rules.md §3 code features)      project tasks
    goal                    Make the agent plugin serve the decisions, not just notes (USER 10-29 15:30 'plugins are ours right how are they inque exactly whats the pt … aligngin all apsects … decision based senior dev human centered'). Agent-memory plugins (claude-mem, ai-memory, Copilot Memory) carry what the agent did for the next agent; Mole's plugin carries the PEOPLE's decisions to the agent and the agent's effect on them back to the person. SessionStart: the decisions + tenets governing the files in play (from the prompt, the branch diff and open files), each as a rule to follow with its flag and owner, plus weak spots from T35 when present. PreToolUse on Edit/Write: when the edit touches lines a decision governs, add that decision once (no block). Stop: decisions the session's diff touched with their new flags, decision-rule violations (T27), then the existing past fixes, questions, claims and collisions. Same content from the MCP server (mole_check / mole_decisions with a files argument) so Codex, Cursor and Hermes get it too.
    done-when               1) M31a: 10 replayed sessions from this repo (the 10-29 builder chats' first prompts + their diffs) where the agent edited decision-governed files → SessionStart lists the governing decisions 10/10, within 1,500 characters, p95 <= 2 s; 2) M31b: 5 planted rule violations in replayed diffs → Stop reports 5/5 with the decision id, silent on 5 clean diffs; 3) PreToolUse adds a decision at most once per session per decision, never blocks; 4) a hook never fails a session: errors → exit 0, nothing printed; 5) claude plugin validate passes; npm run check passes
    status                  2026-10-29 verified      reviewer fresh-review-subagent-a18-r1 · findings: No P0. P1: mole_decisions/mole_check 'files' MCP arg has no direct uni
    next                    merge → ledger move <task> integrated --merge … (ledger reruns checks in the repo)
    pinned
    mode                    code
    boundary                plugins/claude-code/** (hooks.json, scripts, test), packages/mcp/src (files argument on mole_check / mole_decisions only), packages/decisions/src read-only, tasks/T37-plugin-decisions-first/**
    checks                  npm run check && node plugins/claude-code/test/m31.mjs
    non-goals               no paid API or model calls from Mole code (a model only behind an interface, tests use recorded fixtures) · no publishing or pushing · Raymond's accounts never used (no GitHub App registration, no Slack workspace, no marketplace) · prototype/ rejected · don't edit benchmark keys after the red-tests commit (R2) · shared registries (MCP tool list, CLI usage, workspace deps, extension package.json contributes) tested with toContain, never an exact set · never start Docker Desktop (disk ~6 GB free): local Postgres via /opt/homebrew/bin/pg_ctl in a temp dir or PGlite · kill processes by pid only, never pkill -f
    proof                   runs.jsonl last line with the metric + npm run check output + the red-tests commit dated before the first implementation commit + the fresh reviewer's verdict
    stop                    same check failure 3 rounds in a row (R3) · needs Raymond's accounts, paid API spend, people or a product decision (log it in 4 log, move on to the next task)
    came from               USER 2026-10-29 15:30 (context/product-plan/systems/full-build/ask 2026-10-29 1530.txt): 'build full system based on establisseh dopen soruce repos or big company systs or startups … why arent that stuff in the panel in vscode … which agents cover which files … blast radius … tjhe reamining stuff that dont work make it work'
    links                   4 log/ledger.md (every transition + its evidence)
    harness                 hermes
```
