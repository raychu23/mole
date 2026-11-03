---
state: integrated
owner: hermes-build
repo: /Users/a1/Desktop/CS Code/Project/Mole
branch: ledger/t61-reasoning-mcp-tools
worktree: /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T61-reasoning-mcp-tools
base:
reviewer: hermes-subagents deleg_ef4c137c (FAIL, fixed) + deleg_cdaae854 PASS (fresh, claude-sonnet-5)
updated: 2026-11-02 22:39
status: ledger integrated
next: record outcome → ledger move <task> done --outcome … --resources … --prevents …
claimed: 2026-11-02 22:08
---
```notes
T61-reasoning-mcp-tools      ledger task (rules.md §3 code features)      project tasks
    goal                    Expose the built reasoning features to agents as read-only MCP tools (backlog reasoning-surfaces, harness half): mole_priorities (evaluate a phase or compare two, T60), mole_incident_suggest (revival candidates for an incident, T58, no accept), mole_proposals_compare (compare proposal worktrees vs baseline, T56). Same JSON as the CLIs, annotations readOnlyHint true, outputSchema.
    done-when               1 tests first (red) · 2 each tool's structuredContent equals the matching library call on the same temp repo · 3 listed as read-only in tool-annotations-schema.test.ts and passes it · 4 invalid input (unknown phase / incident / path) returns isError with the library's message, never throws · 5 nothing written to the repo (git status + mtime of .mole unchanged) · 6 npm run check
    status                  2026-11-02 integrated      merge 6113b6e + ab13f55 lock (main check 1016 pass, /Users/a1/.hermes/cache/scratch/mole-build/main-check-t61.txt) · com
    next                    record outcome → ledger move <task> done --outcome … --resources … --prevents …
    pinned
    mode                    one worker
    boundary                packages/mcp/src/reasoning-tools.ts (new), server.ts one register line, package.json/tsconfig dep on @mole/proposals, tests
    checks                  npm run check
    non-goals               accept/dismiss/create (writes; stay CLI, a person's act) · VS Code panel (next task) · new reasoning logic
    proof                   4 log/mcp-replay.txt (real stdio client listing + calling the 3 tools on the T60/T58 replay repos)
    stop                    any tool that writes, or any output differing from the library call
    came from               Hermes chat 11-02 'yes do rest whatever. needed as planned'; backlog reasoning-surfaces; B1 'surfaced in the IDE and agent harness'
    links                   4 log/ledger.md (every transition + its evidence)
    harness
```
