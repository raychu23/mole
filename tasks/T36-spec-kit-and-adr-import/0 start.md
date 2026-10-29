---
state: blocked
owner: mole-builder-10
repo: /Users/a1/Desktop/CS Code/Project/Mole
branch: ledger/t36-spec-kit-and-adr-import
worktree: /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T36-spec-kit-and-adr-import
base: dec0f95
reviewer:
updated: 2026-10-29 16:28
status: ledger blocked
next: decision owner unblocks → ledger move <task> ready --note …
claimed: 2026-10-29 15:45
---
```notes
T36-spec-kit-and-adr-import      ledger task (rules.md §3 code features)      project tasks
    goal                    Read decisions where teams already keep them, nothing new to learn (USER 10-29 'highly integrate'; 3C1 741 'either: give structured docs format (like big tech) or allow them easily plug own syst'; D37). Import GitHub spec-kit (.specify/memory/constitution.md principles → tenets; specs/NNN-*/spec.md, plan.md, research.md decisions + rationale → decisions anchored to the code paths they name), MADR / adr-tools / log4brains ADR folders, and KEP-style status + replaces fields, into Mole's graph (T29) so flags, rules, hover and the view work on them unchanged; plus a spec-kit extension or hook that runs `mole check` after /speckit.implement so the agent sees which decisions its change touched. Research input: context/product-plan/systems/specs-vs-decisions/spec-kit.json when present.
    done-when               1) M29a: key hand-labelled before code from 3 public repos (one using spec-kit, two with ADR folders; pinned shas): every record file found (recall 100%), title/status/date/deciders/supersedes mapped >= 95% exact; 2) M29b: records naming code paths get anchors, and flags on them (code changed after the record's date → yellow) match the key >= 95%; 3) the spec-kit hook runs in a fixture spec-kit project and prints the decisions touched; 4) failure case: malformed front matter → that record skipped with a reason, the others still load; 5) npm run check passes
    status                  2026-10-29 blocked      cause: T36's own work is done and verified green (M29 bench: recall 100%, fields 100%, anchored-flags 100%, packages/dec
    next                    decision owner unblocks → ledger move <task> ready --note …
    pinned
    mode                    code
    boundary                packages/decisions/src/import/** (new) + packages/decisions/bench/m29*, packages/decisions/src/graph.ts (register importers: one call), integrations/spec-kit/** (new), packages/daemon/src/cli.ts (one flag), tasks/T37-spec-kit-and-adr-import/**
    checks                  npm run check && node packages/decisions/dist/bench/m29.js
    non-goals               no paid API or model calls from Mole code (a model only behind an interface, tests use recorded fixtures) · no publishing or pushing · Raymond's accounts never used (no GitHub App registration, no Slack workspace, no marketplace) · prototype/ rejected · don't edit benchmark keys after the red-tests commit (R2) · shared registries (MCP tool list, CLI usage, workspace deps, extension package.json contributes) tested with toContain, never an exact set · never start Docker Desktop (disk ~6 GB free): local Postgres via /opt/homebrew/bin/pg_ctl in a temp dir or PGlite · kill processes by pid only, never pkill -f
    proof                   runs.jsonl last line with the metric + npm run check output + the red-tests commit dated before the first implementation commit + the fresh reviewer's verdict
    stop                    same check failure 3 rounds in a row (R3) · needs Raymond's accounts, paid API spend, people or a product decision (log it in 4 log, move on to the next task)
    came from               USER 2026-10-29 15:30 (context/product-plan/systems/full-build/ask 2026-10-29 1530.txt): 'build full system based on establisseh dopen soruce repos or big company systs or startups … why arent that stuff in the panel in vscode … which agents cover which files … blast radius … tjhe reamining stuff that dont work make it work'
    links                   4 log/ledger.md (every transition + its evidence)
    harness                 hermes
```
