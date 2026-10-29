---
state: integrated
owner: mole-builder-2 (Hermes chat)
repo: /Users/a1/Desktop/CS Code/Project/Mole
branch: ledger/t21-parallel-agent-collisions
worktree: /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T21-parallel-agent-collisions
base: 17d9862
reviewer: reviewer-T21-r1
updated: 2026-10-29 06:40
status: ledger integrated
next: record outcome → ledger move <task> done --outcome … --resources … --prevents …
claimed: 2026-10-29 01:49
---
```notes
T21-parallel-agent-collisions      ledger task (rules.md §3 code features)      project tasks
    goal                    Warn parallel agents (and you) when their work collides: using T18's agent states and the call graph, detect when one agent run edits a function that another live run read, relies on (callers/callees within 2 hops) or also edits, and when a run edits code under one of your notes or decisions; deliver the warning through the MCP tool + the Claude Code hooks from T15 (session start: who else is touching this; stop: what you changed that others depend on)
    done-when               1) mole collisions [--json] lists live-run pairs with the shared functions, the edge path between them, and which run changed what; 2) MCP tool mole_collisions + hook output; 3) M11 bench: a key written before the code over replayed parallel sessions (the two Mole builder chats of 10-28/29 + 6 planted overlap pairs) → recall >= 90%, false alarms <= 10%; 4) no warning when two runs only touch unrelated files; 5) failure case: a run whose transcript is still being written is read up to its last complete step; 6) npm run check passes
    status                  2026-10-29 integrated      merge 2e92a98 · combined checks exit 0 · note: npm run check on main 9695ca5 (incl. 2e92a98 T21 merge + key-ruling-3 tes
    next                    record outcome → ledger move <task> done --outcome … --resources … --prevents …
    pinned
    mode                    code
    boundary                packages/agentstate/** (collisions module), packages/mcp/src (new tool only), plugins/claude-code/** (hook output only, after T15 lands), tasks/T21-parallel-agent-collisions/**
    checks                  npm run check && node packages/agentstate/dist/bench/m11.js
    non-goals               no PR comments/bot (D24) · no structure-map work (D23) · prototype/ rejected · no publishing or pushing · Raymond's accounts never used · don't edit benchmark keys after the red-tests commit (R2)
    proof                   runs.jsonl last line with M11 + npm run check + red-tests commit sha
    stop                    same check failure 3 rounds in a row (R3) · needs Raymond's accounts, paid API spend or a product decision
    assumptions             builder 2, 2026-10-29 · collision = windows within 15 min + same function or <=2 DIRECTED call hops (T1 indexer) or a note hit; parent/subagent never a pair
                            hook output waits for T15 (spec in 2 insights.md); integrate after the hook lands · fc6c6dc0 vs 39d6ac07 did not overlap (79 min gap), labelled not
                            open P2 (review-1): 2-hop limit not pinned by a check · real half reads today's checkouts · ~22 s per call, no graph cache
    came from               USER 2026-10-29 01:00 'no the resume is the plan. thats why im building it dummy … be daring ambitious pls' · Resume + interview.md target bullets · loop-goals E6
    links                   4 log/ledger.md (every transition + its evidence)
    harness                 hermes
```
