---
state: running
owner: hermes-build
repo: /Users/a1/Desktop/CS Code/Project/Mole
branch: ledger/t74-steering-dials
worktree: /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T74-steering-dials
base:
reviewer:
updated: 2026-11-03 02:53
status: ledger running
next: worker finishes → ledger move <task> submitted --report … (ledger runs the checks row)
claimed: 2026-11-03 02:53
---
```notes
T74-steering-dials      ledger task (rules.md §3 code features)      project tasks
    goal                    Live agent steering: a small signal/update/query contract over the existing hooks transport so a person (or Mole) can steer a running agent: query = what is the agent doing (intent, files, decisions in play), signal = a note the agent sees on its next tool call, update = a validated change (e.g. 'stop touching X', 'decision D now superseded') that is checked before it is accepted. Built on Temporal's signal/update/query semantics, delivered via PreToolUse/UserPromptSubmit additionalContext.
    done-when               1 prior-art note (Temporal workflow signals/updates/queries docs; Claude Code hooks; LangGraph interrupts/human-in-the-loop) · 2 tests first · 3 `mole steer signal|update|query --session S` (CLI) writes to a per-session inbox; hooks deliver once; update validators reject invalid updates with a reason · 4 query returns the agent state from agentstate (T18) · 5 never blocks the agent; plugin + agentstate tests pass
    status                  2026-11-03 running      worktree /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T74-steering-dials · branch ledger/t74-steering-dials · base ?
    next                    worker finishes → ledger move <task> submitted --report … (ledger runs the checks row)
    pinned
    mode                    one worker
    boundary                packages/agentstate (steer/), plugins/claude-code/scripts (deliver), daemon cli, tests
    checks                  npm run check
    non-goals               anything outside boundary
    proof                   4 log/
    stop                    hook blocks or fails the session
    came from               D76 dials design (signal/update/query); inventory F60
    links                   4 log/ledger.md (every transition + its evidence)
    harness
```
