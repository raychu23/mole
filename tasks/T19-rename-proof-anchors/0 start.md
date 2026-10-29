---
state: ready
owner: mole-builder-2 (Hermes chat)
repo: /Users/a1/Desktop/CS Code/Project/Mole
branch:
worktree:
base:
reviewer:
updated: 2026-10-29 01:07
status: ledger ready
next: worker claims it → ledger move <task> running --orca | --git-worktree | --worktree PATH
---
```notes
T19-rename-proof-anchors      ledger task (rules.md §3 code features)      project tasks
    goal                    Make note and memory anchors survive renames: when a function, method or class is renamed (or renamed + moved), re-attach its notes, seen history and past-fix links by matching the normalized body hash and call-graph neighbors, instead of marking them deleted/orphaned (T13 found 'renamed symbol shows deleted')
    done-when               1) mole memory and mole since report 'renamed: old → new' and keep the note fresh when only the name changed; 2) M9 bench: every rename found in the Mole repo and the Excalidraw clone history (git log -M + TS symbol diff), key written before the code → >= 95% re-anchored to the right symbol, 0 wrong re-anchors; 3) ambiguous case (two candidates with the same body) → stays orphaned and lists both candidates, never guesses; 4) failure case: a rename plus a body edit above a similarity threshold is reported as 'renamed + changed' (stale), not silently fresh; 5) npm run check passes
    status                  2026-10-29 ready      owner mole-builder-2 (Hermes chat)
    next                    worker claims it → ledger move <task> running --orca | --git-worktree | --worktree PATH
    pinned
    mode                    code
    boundary                packages/memory/** (anchor + re-anchor only), tasks/T19-rename-proof-anchors/**
    checks                  npm run check && node packages/memory/dist/bench/m9.js
    non-goals               no PR comments/bot (D24) · no structure-map work (D23) · prototype/ rejected · no publishing or pushing · Raymond's accounts never used · don't edit benchmark keys after the red-tests commit (R2)
    proof                   runs.jsonl last line with M9 + npm run check + red-tests commit sha
    stop                    same check failure 3 rounds in a row (R3) · needs Raymond's accounts, paid API spend or a product decision
    came from               USER 2026-10-29 01:00 'no the resume is the plan. thats why im building it dummy … be daring ambitious pls' · Resume + interview.md target bullets · loop-goals E6
    links                   4 log/ledger.md (every transition + its evidence)
    harness                 hermes
```
