---
state: verified
owner: mole-builder (Hermes chat)
repo: /Users/a1/Desktop/CS Code/Project/Mole
branch: ledger/t13-l1-since-you-last-looked
worktree: /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T13-l1-since-you-last-looked
base: b91c6a9
reviewer: reviewer-T13-r1
updated: 2026-10-28 22:29
status: ledger verified
next: merge → ledger move <task> integrated --merge … (ledger reruns checks in the repo)
claimed: 2026-10-28 22:05
---
```notes
T13-l1-since-you-last-looked      ledger task (rules.md §3 code features)      project Mole
    goal                    L1 observe, personal: record what you've looked at (VS Code: a symbol visible in the editor >= 5 s, hovered, or noted) into .mole/local/seen.jsonl (gitignored, never leaves the machine), and mole since lists the symbols you saw whose normalized body changed after your last look, with the commit, author and agent (Co-authored-by trailer when present) that changed them
    done-when               1) seen events written by the extension (apps/vscode) with a setting to turn it off; 2) mole since [--json] lists exactly the seen-then-changed symbols, newest first, grouped by file; unseen symbols never listed; looking again clears an entry; 3) M3 fixture (5 seen + 2 unseen symbols, commits change 3 seen + 2 unseen) → precision 100%, recall 100%; 4) failure case: no seen log yet → 'nothing seen yet' with how to start, exit 0; 5) .mole/local/ added to .gitignore; 6) npm run check passes
    status                  2026-10-28 verified      reviewer reviewer-T13-r1 · findings: P2-1 torn last line in seen.jsonl swallows the next appended look (appendSeen doesn
    next                    merge → ledger move <task> integrated --merge … (ledger reruns checks in the repo)
    pinned
    mode                    code
    boundary                packages/memory/** (seen + since, reusing T11's anchor), apps/vscode/src (seen events + setting only), packages/daemon/src/cli.ts (since subcommand), .gitignore, tasks/T13-l1-since-you-last-looked/**
    checks                  npm run check && node packages/memory/dist/bench/m3.js
    non-goals               no PR comments/bot (D24) · no structure-map work (D23) · no wiki generator (D13) · prototype/ rejected · no publishing · don't edit benchmark keys after the red-tests commit (R2)
    proof                   runs.jsonl last line with M3 + npm run check output + red-tests commit sha
    stop                    same check failure 3 rounds in a row (loop rule R3) · a benchmark key looks wrong (log it in 4 log/key-changes.md, don't edit it) · needs Raymond's accounts or a product decision
    came from               USER 2026-10-28 21:00 'can we pls get started on building. lets say l2 l3 at least or anything before … keeping end goals checkpoints metrics benchamrs in midn as the loop goals' · D24 · tasks/loop-goals.json
    links                   4 log/ledger.md (every transition + its evidence)
    harness                 hermes
```
