---
state: submitted
owner: mole-builder-5
repo: /Users/a1/Desktop/CS Code/Project/Mole
branch: ledger/t28-runtime-flows-from-tests
worktree: /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T28-runtime-flows-from-tests
base: 5b447f7
reviewer:
updated: 2026-10-29 07:12
status: ledger submitted
next: fresh reviewer → ledger move <task> verified --reviewer … --findings …
claimed: 2026-10-29 05:08
---
```notes
T28-runtime-flows-from-tests      ledger task (rules.md §3 code features)      project tasks
    goal                    What actually runs: record call sequences while the test suite runs (V8 coverage + OpenTelemetry spans around exported functions, AppMap-style), and add runtime edges to the context graph so the picture and the gate see calls the static graph can't resolve (dynamic dispatch, callbacks, plugin registries)
    done-when               1) mole flows record runs vitest with instrumentation and stores per-test flows; mole flows <file#Symbol> lists the tests and call paths that exercise it; 2) M20 bench: 50 call edges sampled from Mole + Excalidraw, half dynamic, truth from manual trace, labeled before the code → runtime flows recover >= 80% of the dynamic ones the static graph misses, 0 invented edges; 3) instrumentation overhead on the test suite <= 2x; 4) npm run check passes
    status                  2026-10-29 submitted      report: new packages/flows: Vite transform wraps every function body with enter/exit hooks (indexer-compatible ids, no a
    next                    fresh reviewer → ledger move <task> verified --reviewer … --findings …
    pinned
    mode                    code
    boundary                packages/flows/** (new), packages/daemon/src/cli.ts (register the subcommand with one import + one call only), tasks/T28-runtime-flows-from-tests/**
    checks                  npm run check && node packages/flows/dist/bench/m20.js
    non-goals               no PR comments/bot (D24) · no structure-map work (D23) · prototype/ rejected · no publishing or pushing · Raymond's accounts never used · no paid API or model calls from Mole code · don't edit benchmark keys after the red-tests commit (R2) · shared registries (MCP tool list, CLI usage, workspace deps) tested with toContain, never an exact set
    proof                   runs.jsonl last line with the metric + npm run check output + the red-tests commit sha dated before the first implementation commit + the fresh reviewer's verdict
    stop                    same check failure 3 rounds in a row (R3) · needs Raymond's accounts, paid API spend, people or a product decision (log it in 4 log, move on to the next task)
    came from               USER 2026-10-29 06:40 'go far beyond … proper systems or dev support tools … full enterprise-grade both … ui user feats and some backend tools … compiler-in-the-loop … ideas foundations from open source … full system the end user like a junior dev or senior dev is situated in … big pic understanding' · Mole full system.md · D30
    links                   4 log/ledger.md (every transition + its evidence)
    harness                 hermes
```
