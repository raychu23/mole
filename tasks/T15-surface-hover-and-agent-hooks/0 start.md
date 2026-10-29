---
state: ready
owner: mole-builder (Hermes chat)
repo: /Users/a1/Desktop/CS Code/Project/Mole
branch:
worktree:
base:
reviewer:
updated: 2026-10-28 21:11
status: ledger ready
next: worker claims it → ledger move <task> running --orca | --git-worktree | --worktree PATH
---
```notes
T15-surface-hover-and-agent-hooks      ledger task (rules.md §3 code features)      project Mole
    goal                    Show it where you already look: VS Code hover + gutter mark on lines a change touched (past fix, your note, stale flag, the <= 3 questions), a 'since you last looked' list in the panel, an MCP tool mole_check for agents, and a Claude Code plugin (SessionStart: your notes for the files in play; Stop: mole check on the session's diff)
    done-when               1) hover on a touched line shows the past fix reason + test + source, opening the commit/file on click; 2) panel lists mole since; 3) MCP tool mole_check returns the same JSON as the CLI; 4) a Claude Code plugin folder (plugins/claude-code/) with SessionStart + Stop hooks, tested by running the hook scripts on a fixture session diff; 5) T9-style clean-profile selftest passes with the hover; 6) failure case: daemon not running → hover shows nothing, no error popups; 7) npm run check passes
    status                  2026-10-28 ready      owner mole-builder (Hermes chat)
    next                    worker claims it → ledger move <task> running --orca | --git-worktree | --worktree PATH
    pinned
    mode                    code
    boundary                apps/vscode/**, packages/mcp/**, plugins/claude-code/** (new), tasks/T15-surface-hover-and-agent-hooks/**
    checks                  npm run check
    non-goals               no PR comments/bot (D24) · no structure-map work (D23) · no wiki generator (D13) · prototype/ rejected · no publishing · don't edit benchmark keys after the red-tests commit (R2)
    proof                   clean-profile selftest log + hook script run output + npm run check output
    stop                    same check failure 3 rounds in a row (loop rule R3) · a benchmark key looks wrong (log it in 4 log/key-changes.md, don't edit it) · needs Raymond's accounts or a product decision
    came from               USER 2026-10-28 21:00 'can we pls get started on building. lets say l2 l3 at least or anything before … keeping end goals checkpoints metrics benchamrs in midn as the loop goals' · D24 · tasks/loop-goals.json
    links                   4 log/ledger.md (every transition + its evidence)
    harness                 hermes
```
