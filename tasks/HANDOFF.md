# Start building Mole in a new chat

## Every builder chat has a main file (2026-10-29)

Raymond, 10-29: "is thre a page managing all the different executing worker agents active or upcoming. and also for each to have their own main file at least with sections including a main info/handoff, progress timeline, further work".

- Before launch, the launching chat adds the agent to `context/agents/registry.json` (chat id, ledger owner name, job, queue) and runs `python3 context/agents/build_agents.py`. The script fails if a running, submitted, verified or blocked task has an owner missing from the registry.
- The script writes `context/agents/<id>-<name>.md`. Sections 1-7 (main info + handoff, progress timeline, results, further work, needs you, helpers, Raymond's messages) are rebuilt from the Hermes chat store, the ledger and `tasks/loop_status.py`.
- As the builder, write your own notes under `## Handoff notes` at each checkpoint and before you stop: what you did, what's next and anything odd. The script keeps that part.
- Raymond sees every agent on `context/product-plan/Agents.html` and in the "Who's building" table of `0 Start here.html`. A task still marked 'running' after its chat stops shows as stale there.
- Next builder: a4 (`context/agents/a4-mole-builder-3.md`, waiting on D32) takes over T15, merges T21, then prepares T17.

## Now (2026-10-28 21:10): build loop for L1–L3 (T11–T15)

Raymond, 10-28: "can we pls get started on building. lets say l2 l3 at least or anything before … keeping end goals checkpoints metrics benchamrs in midn as the loop goals, which the twitter articles describes". His note 3C1 line 672: "verificatn: sure thing u tell it to do actually done". The center is your understanding kept current as agents change code (D24, `context/product-plan/Mole start to finish.md`, "Your focus").

Prompt for a fresh builder chat opened on `/Users/a1/Desktop/CS Code/Project/Mole`:

```text
You are the Mole builder. Build T11–T15 through the ledger, as loops with goals you can't move.
1. Read AGENTS.md, context/0 start.md, context/1 takeaways.md (startup packet). Then tasks/loop-goals.json: end goals E1–E4, metrics M1–M5 with targets, benchmarks B1–B4, the task graph, checkpoints C1–C5, loop rules R1–R7, never-list. Run python3 tasks/loop_status.py.
2. Load skills: ledger, ledger-task-workflow, test-driven-development, verify-pyramid, code-work.
3. Order (graph): T11 and T12 in parallel (each in its own ledger worktree, one subagent each) → T13 and T14 → T15. Each task's contract is tasks/<T>/0 start.md (goal, done-when, boundary, checks, non-goals, proof, stop).
4. Per task, the loop (R1–R7):
   a. claim: cd "/Users/a1/Desktop/CS Code" && python3 systems/ledger --root Project/Mole --no-orca move tasks/<T> running --owner mole-builder --git-worktree
   b. FIRST commit = the check: bench script + key (dated now) + failing tests; nothing else. Benchmarks under context/ are in the main checkout only (/Users/a1/Desktop/CS Code/Project/Mole/context/...): copy what the bench needs into the package's bench/ in this commit.
   c. produce → run the checks → correct → repeat until green; append each run to tasks/<T>/4 log/runs.jsonl as {"time","commit","cmd","exit","metrics":{"M1":...}}; max 6 rounds; same failure 3 rounds → ledger blocked.
   d. never edit the keys/tests from step b (R2); log a needed change in tasks/<T>/4 log/key-changes.md.
   e. hand in: ledger move <T> submitted --report … --checks-result "<cmd> → <last runs.jsonl line>".
   f. review by a FRESH subagent (delegate_task with only the contract + the diff, not your transcript): test diff first, then code, P0–P2 with a reproducer each; it runs ledger move <T> verified --reviewer <its id> … or back to running with findings. Max 2 review rounds.
   g. integrate: ledger move <T> integrated --merge <sha> --checks-result "npm run check on main → …".
5. Checkpoints: after C2 and after C3, write tasks/loop-report.md (each metric's latest value vs target, what missed, what's next) and run python3 tasks/loop_status.py. C4: run mole check on Mole's last 13 changes and add the result to the report.
6. Never: PR comments/bot, structure-map work, a wiki generator, prototype/, publishing or pushing, Raymond's accounts. Don't touch context/product-plan/*.md pages (the planning chat owns them); report through tasks/ only.
7. Raymond may not be watching: make reasonable choices, state assumptions in the task's 0 start.md, stop on the task's stop rows. Final answer: 5 lines max = each task's state + metric vs target, and the path tasks/loop-report.md.
```

Live status: `python3 tasks/loop_status.py` · board: `cd "/Users/a1/Desktop/CS Code" && python3 systems/ledger --root Project/Mole --no-orca board`

## Earlier (2026-10-19): T1–T10, done or integrated

> 2026-10-19: T1 (engine, no UI) is GO. prototype/ is rejected; don't use it. The UI is an always-on ~half-screen split panel, not a sidebar; what else it covers is still open (context/1 takeaways §13), so T2 waits for T1 and for that answer.

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
| T2-m1-per-file-map | M1 daemon + wide map panel following the open file + mole_map | proposed (after T1) |
| — | M1.5 learner + token go/no-go gate | create after T2 |
| — | M2 anchors, bootstrap, layered canvas + drift, import diagrams | later |
| — | M3 edit + propagate, explanations, badges | later |
| — | M4 Claude plugin, MCP tools, hooks, agent panel, LangGraph flows | later |
| — | M5 activity capture + coverage map | later |
| — | M6 CI shared graph + PR architecture diff | later |

Board: `cd "/Users/a1/Desktop/CS Code" && python3 systems/ledger --root Project/Mole --no-orca board`
