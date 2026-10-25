---
state: proposed
owner:
repo:
branch:
worktree:
base:
reviewer:
updated: 2026-10-25 18:21
status: ledger proposed
next: fill owner + done-when + boundary + checks + non-goals + proof + stop → ledger move <task> ready
---
```notes
T7-map-callsite-lines      ledger task (rules.md §3 code features)      project tasks
    goal                    Fix the map's file:line evidence for callers and callees: show the CALL-SITE line (edge evidence, already stored in edges.path/line) instead of the neighbour function's declaration line, so the line a user or agent clicks/reads is where the call happens
    done-when               1) formatNeighborhood and the panel click target use edge evidence line for caller/callee/import neighbours (declaration line kept for own definitions); 2) when a caller has several call sites, the first call line is shown and '+N more sites' is available in the JSON; 3) daemon + core tests cover it (fixture with a function called twice in one caller); 4) excalidraw check: for shouldResizeFromCenter the map lines equal grep -n 'shouldResizeFromCenter(' lines; 5) npm run check passes; CLI==MCP output equality test still passes
    status                  2026-10-25 proposed
    next                    fill owner + done-when + boundary + checks + non-goals + proof + stop → ledger move <task> ready
    pinned
    mode                    code
    boundary                packages/core/src/neighborhood.ts, packages/daemon/src (query), packages/mcp, apps/vscode webview click target, their tests
    checks                  npm run check
    non-goals               no new node kinds, no layout change, no indexer schema change
    proof                   map output vs grep -n on excalidraw + npm run check
    stop                    needs an indexer schema change
    came from               T6 transcript: C-M07-r1 reported the map's line numbers as stale (they are the caller's declaration lines, :432/:563/:11096, while the calls are at :507/:696/:11192)
    links                   4 log/ledger.md (every transition + its evidence)
    harness                 any
```
