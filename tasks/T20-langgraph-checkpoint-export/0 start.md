---
state: submitted
owner: mole-builder-2 (Hermes chat)
repo: /Users/a1/Desktop/CS Code/Project/Mole
branch: ledger/t20-langgraph-checkpoint-export
worktree: /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T20-langgraph-checkpoint-export
base: 24cf82c
reviewer:
updated: 2026-10-29 01:49
status: ledger submitted
next: fresh reviewer → ledger move <task> verified --reviewer … --findings …
claimed: 2026-10-29 01:37
---
```notes
T20-langgraph-checkpoint-export      ledger task (rules.md §3 code features)      project tasks
    goal                    Export the agent runs T18 reconstructs as real LangGraph checkpoints, written with LangGraph.js's SQLite checkpointer (@langchain/langgraph-checkpoint-sqlite), so any run can be opened, replayed or forked with LangGraph's own tooling (getStateHistory, time travel, LangGraph Studio) and compared across runs
    done-when               1) mole run <id> --export langgraph <file.sqlite> writes one thread per run, one checkpoint per step, parent links, values = {context version, files read, tried, changed}; 2) M10 round-trip: for every run in the B5 sample, LangGraph's getStateHistory on the exported file returns the same steps in the same order with equal values (100%); 3) a fork test: fork from a mid-run checkpoint with LangGraph's API works on the exported file; 4) failure case: a run with 0 steps exports an empty thread with a note, no crash; 5) npm run check passes
    status                  2026-10-29 submitted      report: branch ledger/t20-langgraph-checkpoint-export @18faa26 (red 626a462): packages/agentstate/src/langgraph.ts expor
    next                    fresh reviewer → ledger move <task> verified --reviewer … --findings …
    pinned
    mode                    code
    boundary                packages/agentstate/** (export module only), package.json workspace deps (@langchain/langgraph, @langchain/langgraph-checkpoint-sqlite), tasks/T20-langgraph-checkpoint-export/**
    checks                  npm run check && node packages/agentstate/dist/bench/m10.js
    non-goals               no PR comments/bot (D24) · no structure-map work (D23) · prototype/ rejected · no publishing or pushing · Raymond's accounts never used · don't edit benchmark keys after the red-tests commit (R2)
    proof                   runs.jsonl last line with M10 + npm run check + red-tests commit sha
    stop                    same check failure 3 rounds in a row (R3) · needs Raymond's accounts, paid API spend or a product decision
    came from               USER 2026-10-29 01:00 'no the resume is the plan. thats why im building it dummy … be daring ambitious pls' · Resume + interview.md target bullets · loop-goals E6
    links                   4 log/ledger.md (every transition + its evidence)
    harness                 hermes
```
