---
state: ready
owner: mole-agent-states (Hermes chat)
repo: /Users/a1/Desktop/CS Code/Project/Mole
branch:
worktree:
base:
reviewer:
updated: 2026-10-29 00:12
status: ledger ready
next: worker claims it → ledger move <task> running --orca | --git-worktree | --worktree PATH
---
```notes
T18-agent-states      ledger task (rules.md §3 code features)      project tasks
    goal                    Agent states for observe + verify: read agent runs that already exist on this Mac (Hermes ~/.hermes/state.db, Claude Code ~/.claude/projects/*.jsonl, Codex ~/.codex/sessions/**/*.jsonl; LangGraph checkpointer tables and OpenTelemetry GenAI spans when a project has them) into one state graph per run, stored in LangGraph's checkpoint shape (thread_id, checkpoint_id, parent_checkpoint_id, values) with OpenTelemetry GenAI operation names (invoke_agent, execute_tool, plan). Each checkpoint records the context the agent had (files read; git sha + hash of .mole/, AGENTS.md, CLAUDE.md), what it tried (commands, tests, fixes + result) and what it changed (files, symbols, commits). From that: 'already tried' that survives compaction, 'ran on stale context', and per function 'which agent runs touched this and in what state'
    done-when               1) mole runs [--json] lists runs from the 3 local sources with harness, cwd, start, steps, compactions; mole run <id> [--json] prints the state graph (steps, subagent fan-out + merge, compaction points) and emits LangGraph-shaped checkpoints; 2) mole tried <run|file#Symbol> lists commands/tests/fixes already tried with their outcome, including ones before a compaction (3C1 line 289: 'the agent forgets which fix it already tried, so it tries it again'); MCP tool mole_tried returns the same JSON; 3) every checkpoint records its context version; mole run flags steps that relied on a note T11 now marks stale or changed; 4) mole agents <file#Symbol> lists the runs and steps that edited it, newest first; 5) M6 attribution: >= 95% of file edits in agent-made commits of the Mole repo (T1-T15 history) link to a run step; 6) M7 tried-recall: a key written BEFORE the implementation by a separate subagent, over the 7 Hermes sessions + 4 Claude Code transcripts that contain a compaction, listing commands/tests tried before each compaction → recall 100%, wrong items <= 5%; 7) failure/empty case: a missing or unreadable source is listed as skipped with the reason, exit 0; sources are opened read-only; 8) privacy: run data and any key that quotes chat text live in .mole/local/ (gitignored); commit only counts + the key's sha256 in tasks/T18-agent-states/4 log/; 9) npm run check passes
    status                  2026-10-29 ready      owner mole-agent-states (Hermes chat)
    next                    worker claims it → ledger move <task> running --orca | --git-worktree | --worktree PATH
    pinned
    mode                    code
    boundary                packages/agentstate/** (new), packages/daemon/src/cli.ts (register subcommands with one import + one call only), packages/mcp/src (new mole_tried tool only), .gitignore, tasks/T18-agent-states/**
    checks                  npm run check && node packages/agentstate/dist/bench/m6.js && node packages/agentstate/dist/bench/m7.js
    non-goals               no capture hooks of its own (read existing transcripts; Entire, SpecStory, git-ai, Agent Trace and claude-mem become adapters later) · no LangGraph runtime needed to read (shape-compatible only) · no UI (T15 shows it) · never commit transcript text · no PR comments/bot (D24) · no structure-map work (D23) · prototype/ rejected · no publishing · don't edit benchmark keys after the red-tests commit (R2)
    proof                   runs.jsonl last line with M6 + M7 + npm run check output + the red-tests commit sha dated before the first implementation commit
    stop                    same check failure 3 rounds in a row (R3) · a source format is undocumented and ambiguous (log it, skip that source) · needs Raymond's accounts or a product decision
    assumptions             worker 2026-10-29, Raymond not watching · M7 key = every session with a compaction on 10-29: 9 Hermes + 1 Claude Code (the 10-28 "7 + 4" doesn't reproduce, 4 log/key.md)
                            M6 population = non-merge commits bbb385d^..767f129 (scaffold → T18 base), all agent-made · 542 file edits in 179 commits
                            outside the boundary, needed: root tsconfig.json + package-lock.json (new package) · daemon + mcp package.json/tsconfig.json (depend on @mole/agentstate)
                            · packages/mcp/test/mcp.test.ts 1 line toEqual(['mole_map']) → toContain (same line T15 writes)
                            checkpoint values.tried = what that step tried (LangGraph append channel), not cumulative: long runs stay small
                            mole agents <file#Symbol> = edit steps whose new text lands in the symbol's current body · commit steps count for file targets only
                            M6 bench changed once by key ruling 1 (fresh reviewer, 4 log/key-ruling-1.md): `git commit -q` prints no sha
    came from               USER 2026-10-28 22:10 'werent we supposed to include as part of the observe and verify aspects of the project include stuff like langraph all that agent states as a way to mange context verisoning all that.' + 3C1 lines 171, 177, 232, 289-293, 431-433, 465 · correction of D24/D26
    links                   4 log/ledger.md (every transition + its evidence)
    harness                 hermes
```
