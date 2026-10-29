---
state: ready
owner: mole-builder-8
repo: /Users/a1/Desktop/CS Code/Project/Mole
branch:
worktree:
base:
reviewer:
updated: 2026-10-29 15:39
status: ledger ready
next: worker claims it → ledger move <task> running --orca | --git-worktree | --worktree PATH
---
```notes
T23-decision-traces-intake      ledger task (rules.md §3 code features)      project tasks
    goal                    Agents interrogate, people write (nuanced.dev, Ayman Nadeem 10-28: AI-generated specs get approved passively; Raymond 10-29: 'similar to my sort of gronded vision'; D38). When a PR, agent session or thread changes code governed by decisions, or a person writes a new record, Mole gathers the evidence (diff hunks, linked PR or issue, transcript excerpts with ids, past fixes, tests) and asks the author up to 3 pointed questions + assumption checks on the person's own text (no alternatives considered, scope not anchored to code, contradicts tenet X, cites code that has changed since). Shown in the VS Code view (T34) and the PR check (T32). Mole never writes the why: a model, if enabled, may only phrase questions over facts code found (R6); the default path is deterministic. Replaces the earlier 'model extracts and drafts records' plan
    done-when               1) M30a: key from Mole's own .mole/decisions + their commits, plus 10 seeded flawed records (labelled before code): assumption checks catch >= 9/10 seeded flaws with <= 1 false flag on the 10 real records, 2) M30b: every evidence item links to a real commit, file:line or transcript id (precision 100%, checked by script), 3) a test asserts no generated text ever lands in a record's why/context/consequences fields, 4) questions: useless share <= 10% judged by a fresh reviewer against the key's written rule (like M4), 5) failure case: nothing governs the change → silent, 6) npm run check passes
    status                  2026-10-29 ready      owner mole-builder-8
    next                    worker claims it → ledger move <task> running --orca | --git-worktree | --worktree PATH
    pinned
    mode                    code
    boundary                packages/intake/** (new), packages/questions/src + packages/decisions/src + packages/history/src read-only, packages/daemon/src/cli.ts (one import + one call), packages/mcp/src (new mole_interrogate tool only), tasks/T23-decision-traces-intake/**
    checks                  npm run check && node packages/intake/dist/bench/m30.js
    non-goals               no paid API or model calls from Mole code (a model only behind an interface, tests use recorded fixtures) · no publishing or pushing · Raymond's accounts never used (no GitHub App registration, no Slack workspace, no marketplace) · prototype/ rejected · don't edit benchmark keys after the red-tests commit (R2) · shared registries (MCP tool list, CLI usage, workspace deps, extension package.json contributes) tested with toContain, never an exact set · never start Docker Desktop (disk ~6 GB free): local Postgres via /opt/homebrew/bin/pg_ctl in a temp dir or PGlite · kill processes by pid only, never pkill -f
    proof                   runs.jsonl last line with the metric + npm run check output + the red-tests commit dated before the first implementation commit + the fresh reviewer's verdict
    stop                    same check failure 3 rounds in a row (R3) · needs Raymond's accounts, paid API spend, people or a product decision (log it in 4 log, move on to the next task)
    came from               USER 2026-10-29 06:15 pasted vertical-AI chat ('does this info add anything useful … critically understand and expand') · Vertical AI chat, checked.md · D29
    links                   4 log/ledger.md (every transition + its evidence)
    harness                 hermes
```
