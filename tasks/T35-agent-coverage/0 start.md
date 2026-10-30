---
state: integrated
owner: mole-builder-8
repo: /Users/a1/Desktop/CS Code/Project/Mole
branch: ledger/t35-agent-coverage
worktree: /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T35-agent-coverage
base: 14cd0b5
reviewer: fresh-review-subagent-a18-r3
updated: 2026-10-29 23:26
status: ledger integrated
next: record outcome → ledger move <task> done --outcome … --resources … --prevents …
claimed: 2026-10-29 22:27
---
```notes
T35-agent-coverage      ledger task (rules.md §3 code features)      project tasks
    goal                    Which agents cover which code, and where nobody does (USER 10-29 15:30 'knowing which agents cover which files, to see like blast radius or weaknesses in codebase not covered'). Read every agent's session logs on this machine (Claude Code ~/.claude/projects/*.jsonl, Hermes ~/.hermes/state.db, Codex ~/.codex/sessions when present) plus git-ai notes / Agent Trace records in the repo when present; attribute each file and function to the sessions that read or edited it; join with the human seen-log (T13), guarding tests (T22, T28) and decision flags (T29). Per file: agents (harness, session, read, edited, last time), last human read, guarding tests, governing decisions, and a weak-spot reason computed from data (agent-edited + no human read since + no guarding test, or governed by a yellow/red decision). Blast radius of one session = files it edited → callers (map) + decisions + tests reached. CLI `mole coverage [file] [--session ID] [--weak] [--json]` + MCP tool mole_coverage. JSON per file: {file, agents:[{harness, session, read, edited, last}], human:{lastSeen}, tests:[], decisions:[{id, flag}], weak:{is, reasons:[]}} (T34's view reads it).
    done-when               1) M27a attribution: key = files each 10-29 builder session changed (mole-builder-3..6: commits on their ledger branches, read from git, a method independent of transcript parsing) → transcript-based 'edited by session' precision >= 0.95 and recall >= 0.95; 2) M27b weak spots on the Mole repo: a fresh reviewer recomputes 20 sampled reasons from raw data → 0 wrong; 3) M27c one-file query p95 <= 200 ms after a cached scan, full scan of this machine's logs <= 60 s; 4) failure cases: no agent logs → 'no agent sessions found in …' and exit 0; malformed log lines skipped and counted; 5) privacy: read-only, nothing leaves the machine, output has paths, tool names and times only, never message text; 6) npm run check passes
    status                  2026-10-29 integrated      merge 691a2ecdf397e44e8f2de85f6e69095d0b507c62 · combined checks exit 0 · note: npm run check on main (525/539, 75/82 fi
    next                    record outcome → ledger move <task> done --outcome … --resources … --prevents …
    pinned
    mode                    code
    boundary                packages/coverage/** (new), packages/agentstate/src + packages/memory/src + packages/history/src + packages/verify/src read-only, packages/daemon/src/cli.ts (one import + one call), packages/mcp/src (new mole_coverage tool only), tasks/T36-agent-coverage/**
    checks                  npm run check && node packages/coverage/dist/bench/m27.js
    non-goals               no paid API or model calls from Mole code (a model only behind an interface, tests use recorded fixtures) · no publishing or pushing · Raymond's accounts never used (no GitHub App registration, no Slack workspace, no marketplace) · prototype/ rejected · don't edit benchmark keys after the red-tests commit (R2) · shared registries (MCP tool list, CLI usage, workspace deps, extension package.json contributes) tested with toContain, never an exact set · never start Docker Desktop (disk ~6 GB free): local Postgres via /opt/homebrew/bin/pg_ctl in a temp dir or PGlite · kill processes by pid only, never pkill -f
    proof                   runs.jsonl last line with the metric + npm run check output + the red-tests commit dated before the first implementation commit + the fresh reviewer's verdict
    stop                    same check failure 3 rounds in a row (R3) · needs Raymond's accounts, paid API spend, people or a product decision (log it in 4 log, move on to the next task)
    came from               USER 2026-10-29 15:30 (context/product-plan/systems/full-build/ask 2026-10-29 1530.txt): 'build full system based on establisseh dopen soruce repos or big company systs or startups … why arent that stuff in the panel in vscode … which agents cover which files … blast radius … tjhe reamining stuff that dont work make it work'
    links                   4 log/ledger.md (every transition + its evidence)
    harness                 hermes
```
