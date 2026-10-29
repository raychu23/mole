---
state: running
owner: mole-builder (Hermes chat)
repo: /Users/a1/Desktop/CS Code/Project/Mole
branch: ledger/t11-l2-memory-notes
worktree: /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T11-l2-memory-notes
base: bdeff14
reviewer:
updated: 2026-10-28 21:39
status: ledger running
next: worker finishes → ledger move <task> submitted --report … (ledger runs the checks row)
claimed: 2026-10-28 21:13
---
```notes
T11-l2-memory-notes      ledger task (rules.md §3 code features)      project Mole
    goal                    L2 memory store: your notes on code as repo files (.mole/notes/*.md, YAML front matter: symbol qualifiedName, normalized-body hash, author, written date; body = plain words), anchored to symbols not lines, with a stale flag when the code under a note changes
    done-when               1) mole note add <file#Symbol> "text" writes .mole/notes/<slug>.md; mole memory [--json] lists every note with fresh | stale | moved | orphaned; 2) stale when the symbol's normalized body (whitespace + comments stripped) differs from the hash at writing; whitespace/comment-only edits stay fresh; 3) a file move or rename keeps the note attached (moved, re-anchored by qualifiedName tail + body hash); a deleted symbol → orphaned, never silently dropped; 4) M1 bench (packages/memory/bench): notes placed on symbols before replayed real commits of the Mole repo (and excalidraw clone if present) → recall 100%, false flags <= 5%, written to tasks/T11-l2-memory-notes/4 log/runs.jsonl; 5) failure case: a note whose YAML is malformed is reported with file:line, not crash; 6) npm run check passes
    status                  2026-10-28 running      changes requested: P1-1 deleted symbol reported moved* to an unrelated same-named symbol in another file (locate() re-an
    next                    worker finishes → ledger move <task> submitted --report … (ledger runs the checks row)
    pinned
    mode                    code
    boundary                packages/memory/** (new), packages/daemon/src/cli.ts (new subcommands only), packages/core/src/schema.ts (additive types only), tsconfig/package.json workspace wiring, tasks/T11-l2-memory-notes/**
    checks                  npm run check && node packages/memory/dist/bench/m1.js
    non-goals               no PR comments/bot (D24) · no structure-map work (D23) · no wiki generator (D13) · prototype/ rejected · no publishing · don't edit benchmark keys after the red-tests commit (R2)
    proof                   runs.jsonl last line with M1 values at target + npm run check output + the red-tests commit sha dated before the first implementation commit
    stop                    same check failure 3 rounds in a row (loop rule R3) · a benchmark key looks wrong (log it in 4 log/key-changes.md, don't edit it) · needs Raymond's accounts or a product decision
    came from               USER 2026-10-28 21:00 'can we pls get started on building. lets say l2 l3 at least or anything before … keeping end goals checkpoints metrics benchamrs in midn as the loop goals' · D24 · tasks/loop-goals.json
    links                   4 log/ledger.md (every transition + its evidence)
    harness                 hermes
```
