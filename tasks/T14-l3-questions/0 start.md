---
state: submitted
owner: mole-builder (Hermes chat)
repo: /Users/a1/Desktop/CS Code/Project/Mole
branch: ledger/t14-l3-questions
worktree: /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T14-l3-questions
base: ef51e65
reviewer:
updated: 2026-10-28 22:26
status: ledger submitted
next: fresh reviewer → ledger move <task> verified --reviewer … --findings …
claimed: 2026-10-28 22:05
---
```notes
T14-l3-questions      ledger task (rules.md §3 code features)      project Mole
    goal                    L3 questions: when a change touches symbols with notes, past fixes or your seen history, mole check adds at most 3 questions aimed at your understanding (from templates over facts T11/T12/T13 found; a model may only reword them, behind a flag, never decide them), ranked past fix > your note > a guarding test changed in the same diff
    done-when               1) <= 3 questions per change, each citing its fact with a clickable source; 2) 0 questions on a change touching nothing known; 3) a question when the change edits or deletes a guarding test of a past fix (read the test diff first); 4) M4: expected questions written into packages/questions/bench/m4-key.json BEFORE the implementation commit for B1 + B3 + 3 no-known-facts changes → the past-fix question in the top 3 for every past-fix case, 0 on the empty ones, useless share < 10%; 5) works with no model configured; 6) npm run check passes
    status                  2026-10-28 submitted      report: branch ledger/t14-l3-questions @54647b0: new @mole/questions (templates over T12 past fixes + T11 notes + guard-
    next                    fresh reviewer → ledger move <task> verified --reviewer … --findings …
    pinned
    mode                    code
    boundary                packages/questions/** (new), packages/daemon/src/cli.ts (check output only), tasks/T14-l3-questions/**
    checks                  npm run check && node packages/questions/dist/bench/m4.js
    non-goals               no PR comments/bot (D24) · no structure-map work (D23) · no wiki generator (D13) · prototype/ rejected · no publishing · don't edit benchmark keys after the red-tests commit (R2)
    proof                   runs.jsonl last line with M4 + npm run check output + red-tests commit sha
    stop                    same check failure 3 rounds in a row (loop rule R3) · a benchmark key looks wrong (log it in 4 log/key-changes.md, don't edit it) · needs Raymond's accounts or a product decision
    came from               USER 2026-10-28 21:00 'can we pls get started on building. lets say l2 l3 at least or anything before … keeping end goals checkpoints metrics benchamrs in midn as the loop goals' · D24 · tasks/loop-goals.json
    links                   4 log/ledger.md (every transition + its evidence)
    harness                 hermes
```
