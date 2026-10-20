# Start building Mole in a new chat

> ON HOLD 2026-10-19: Raymond paused the handoff. The prototype/ demo is rejected and the UI is being redefined as more than a sidebar (context/1 takeaways §13). Do not start T2; T1 (engine) waits for his go.

Paste this into a fresh agent (Hermes, Claude Code or Codex) opened on `/Users/a1/Desktop/CS Code/Project/Mole`:

```text
You are building Mole, task T1 (M0 engine spike).
1. Read AGENTS.md, then context/0 start.md and context/1 takeaways.md (Mole startup packet).
2. Read tasks/T1-m0-engine-spike/0 start.md: goal, done-when, boundary, checks, non-goals, proof, stop. That file is the contract.
3. Background only if needed: context/product-plan/Sequence.html (build order, feature table) and context/product-plan/systems/plan.json (backend, review fixes).
4. Claim it: cd "/Users/a1/Desktop/CS Code" && python3 systems/ledger --root Project/Mole --no-orca move tasks/T1-m0-engine-spike running --owner <your name> --git-worktree
   Work only in that worktree. Setup: npm install. Check: npm run check (build + vitest; passes on main as of 2026-10-19).
5. Do not use prototype/ (rejected).
6. Fixture repo (read-only): ~/.hermes/hermes-agent/ui-tui (362 .ts/.tsx files under src).
7. Hand in: python3 systems/ledger --root Project/Mole --no-orca move tasks/T1-m0-engine-spike submitted --report "<diff summary>" --checks-result "npm run check → <result>"
   A different agent reviews (never review your own task).
Raymond may not be watching: make reasonable choices, state assumptions, stop on the task's stop rows.
```

## Build order (from context/product-plan/Sequence.html §6)

| task | milestone | state |
|---|---|---|
| T1-m0-engine-spike | M0 engine + indexer | ready |
| T2-m1-per-file-map | M1 daemon + VS Code per-file map + mole_map | proposed (after T1) |
| — | M1.5 learner + token go/no-go gate | create after T2 |
| — | M2 anchors, bootstrap, layered canvas + drift, import diagrams | later |
| — | M3 edit + propagate, explanations, badges | later |
| — | M4 Claude plugin, MCP tools, hooks, agent panel, LangGraph flows | later |
| — | M5 activity capture + coverage map | later |
| — | M6 CI shared graph + PR architecture diff | later |

Board: `cd "/Users/a1/Desktop/CS Code" && python3 systems/ledger --root Project/Mole --no-orca board`
