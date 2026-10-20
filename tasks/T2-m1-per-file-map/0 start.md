---
state: proposed
owner: unclaimed
repo: /Users/a1/Desktop/CS Code/Project/Mole
branch:
worktree:
base:
reviewer:
updated: 2026-10-19 17:31
status: ledger proposed
next: fill owner + done-when + boundary + checks + non-goals + proof + stop → ledger move <task> ready
---
```notes
T2-m1-per-file-map      ledger task (rules.md §3 code features)      project tasks
    goal                    First user-visible Mole: a VS Code sidebar map that follows the open file, served by a single-writer daemon (plan M1, offerings F0.2 F1.1 F1.3 F1.9). Starts after T1 lands
    done-when               1) packages/daemon: one process per repo (lock in git common dir), JSON-RPC over a local socket, only writer of the SQLite graph from T1, fails open. 2) apps/vscode: [UI SURFACE PENDING, see hold] webview; onDidChangeActiveTextEditor debounced ~120 ms, ignores non-file schemes; shows the ranked neighbourhood (<=25 nodes, rest grouped '+N more'); click node opens file:line; impact view highlights callers. 3) CLI + MCP mole_map(path|symbol) return the same neighbourhood as compact text. 4) measured on the ui-tui fixture: warm file switch -> render p95 <=150 ms, no LLM call; a shared node moves less than a set distance over 10 switches. FAILURE CASES: daemon down -> sidebar shows 'index unavailable', no crash; file outside the index -> 'not indexed' state
    hold                    ON HOLD 2026-10-19 · USER: Mole UI is more than a sidebar (wide always-on panel beside code?) → rewrite goal + done-when after the UI decision (context/1 takeaways §13)
    status                  2026-10-19 proposed
    next                    fill owner + done-when + boundary + checks + non-goals + proof + stop → ledger move <task> ready
    pinned
    mode                    code
    boundary                packages/daemon/** · packages/mcp/** · apps/vscode/** · packages/core/** (additions) · root workspace config
    checks                  npm run check
    non-goals               roadmap/curated layers, drift, propagation, LLM explanations, Claude plugin hooks (M2-M4); do not edit prototype/
    proof                   latency numbers in generated data/m1-latency.json + screenshot of the sidebar on the fixture + npm run check
    stop                    after M1, run the M1.5 learner + token check before any M2 work (plan gate); ask Raymond before choosing a layout engine other than elkjs
    came from               Project/Mole/tasks/T1-m0-engine-spike
    links                   4 log/ledger.md (every transition + its evidence)
    harness                 any
```
