```notes
ledger (newest last, nothing deleted)
    2026-10-29 01:07      new → proposed      Export the agent runs T18 reconstructs as real LangGraph checkpoints, written with LangGraph.js's SQLite checkpointer (@langchain/langgraph-checkpoint-sqlite), 
    2026-10-29 01:07      proposed → ready      owner mole-builder-2 (Hermes chat)
    2026-10-29 01:37      ready → running      worktree /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T20-langgraph-checkpoint-export · branch ledger/t20-langgraph-checkpoint-export · base 24cf82c
    2026-10-29 01:49      running → submitted      report: branch ledger/t20-langgraph-checkpoint-export @18faa26 (red 626a462): packages/agentstate/src/langgraph.ts exports runs via @langchain/langgraph-checkpoint-sqlite SqliteSaver.put (1 thread/run, 1 checkpoint/step,
    2026-10-29 01:49      checks ran: npm run check && node packages/agentstate/dist/bench/m10.js in /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T20-langgraph-checkpoint-export → exit 0 ((Use `node --trace-warnings ...` to show where the warning was created))
    2026-10-29 01:57      submitted → verified      reviewer reviewer-T20-r1 · findings: P0 none, P1 none. P2: (1) re-export deleteThread silently drops user forks in that thread, (2) relies on protected SqliteSaver.setup() via cast, (3) key is a 15-run sample (reviewer p
    2026-10-29 01:57      checks ran: npm run check && node packages/agentstate/dist/bench/m10.js in /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T20-langgraph-checkpoint-export → exit 0 ((Use `node --trace-warnings ...` to show where the warning was created))
    2026-10-29 02:29      verified → integrated      merge b2e2851 · combined checks exit 0 · note: npm run check && node packages/agentstate/dist/bench/m10.js on main b2e2851 → 150/150, M10 round-trip 100% (15/15), fork 3/3, empty 2/2
    2026-10-29 02:29      combined checks ran: npm run check && node packages/agentstate/dist/bench/m10.js in /Users/a1/Desktop/CS Code/Project/Mole → exit 0 ((Use `node --trace-warnings ...` to show where the warning was created))
```
