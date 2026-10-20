---
state: integrated
owner: unclaimed
repo: /Users/a1/Desktop/CS Code/Project/Mole
branch: ledger/t1-m0-engine-spike
worktree: /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T1-m0-engine-spike
base: 8fbfaf0
reviewer: subagent sa-0-3db232ad (independent, fresh context)
updated: 2026-10-19 23:54
status: ledger integrated
next: record outcome → ledger move <task> done --outcome … --resources … --prevents …
claimed: 2026-10-19 18:02
---
```notes
T1-m0-engine-spike      ledger task (rules.md §3 code features)      project tasks
    goal                    Pick Mole's TypeScript graph engine by measurement and land packages/indexer that writes the Mole graph schema (packages/core) into SQLite for a real TS repo (plan M0, offerings F0.1 + F0.4)
    done-when               1) packages/indexer indexes the fixture ~/.hermes/hermes-agent/ui-tui (362 TS files, read-only) into SQLite via node:sqlite; every current-layer node and edge has file:line@commit (core missingEvidence() returns []). 2) generated data/m0-engine-report.json compares TS Compiler API / scip-typescript, tree-sitter, and CodeGraph (benchmark only) on >=200 sampled call edges stratified barrel re-export / path alias / method call / dynamic: precision + recall vs the TS language service, full index time, 1-file incremental update time, install size, extension-host Node needs. 3) vitest fixture tests for barrel re-export, path alias, method call; FAILURE CASES: a file with a syntax error is stored as status partial and indexing continues; an empty src dir gives 0 nodes and no error. 4) recommendation with numbers written to context/product-plan/systems/plan.json decision P2 (stays PROPOSED until Raymond accepts)
    status                  2026-10-19 integrated      merge 603966f merge of ledger/t1-m0-engine-spike into main, npm run check 16 tests pass · combined checks exit 0
    next                    record outcome → ledger move <task> done --outcome … --resources … --prevents …
    pinned
    mode                    code
    boundary                packages/indexer/** (new) · packages/core/** (schema additions only) · generated data/m0-* · root package.json + package-lock.json for MIT/Apache deps · context/product-plan/systems/plan.json P2 entry only
    checks                  npm run check
    non-goals               no daemon, VS Code extension, UI, roadmap layer, LangGraph, MCP server; do not use or copy prototype/ (USER 2026-10-19: rejected, "horrible"); never write into the ui-tui fixture repo; no GPL/noncommercial deps (GitNexus, Serena)
    proof                   generated data/m0-engine-report.json + npm run check output (vitest incl. the 2 failure cases) + a 10-line summary in context/product-plan/0 start.md change log
    stop                    stop and report if best engine recall on static calls < 0.9, full index of the fixture > 5 min, or a needed dep is not MIT/Apache; ask Raymond before changing the core schema shape (fields other than additions); Raymond may not be watching: make reasonable choices and state assumptions
    came from               Project/Mole/context/product-plan (plan v3 + Sequence.html, chat 20261015_064949_38dbe5)
    links                   4 log/ledger.md (every transition + its evidence)
    harness                 any (Hermes/Claude Code/Codex)
```
