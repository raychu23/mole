---
state: submitted
owner: mole-builder (Hermes chat)
repo: /Users/a1/Desktop/CS Code/Project/Mole
branch: ledger/t12-l2-why-and-past-fixes
worktree: /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T12-l2-why-and-past-fixes
base: 1a003c5
reviewer:
updated: 2026-10-28 21:43
status: ledger submitted
next: fresh reviewer → ledger move <task> verified --reviewer … --findings …
claimed: 2026-10-28 21:13
---
```notes
T12-l2-why-and-past-fixes      ledger task (rules.md §3 code features)      project Mole
    goal                    L2 the why + what broke before: for a change (commit, diff or working tree) mole check finds, per edited hunk, the past fix commits that last wrote those lines (git blame on the parent, -U0 hunks, fix rule configurable) and returns for each: the fix's reason (subject + body, linked task file or .mole note when one names it), the guarding tests (test files that fix commit touched or that reference the symbol), and a clickable source (sha + file:line)
    done-when               1) mole check <sha|--diff file|--worktree> [--json] prints, per hunk, past fixes with reason + guarding tests + source; 2) M2 on tasks' benchmark B1 (context/product-plan/systems/tool-trials/keys/m8-key.json) scored by that key's own rule: >= 4 of 5 on R1-R5 and R6 = 1; 3) on the planted regression B3 (fixtures/planted-m8.diff applied to Mole) it names 9e19c51, the reason (editing counts as use; an index never counts idle) and the daemon idle test; 4) B2 recall: every change past-fix-overlap.json counts as touching a fix gets >= 1 past fix; 5) M5: p95 < 2 s per change on the excalidraw clone, 0 model calls; 6) failure/empty case: a change to brand-new lines or a repo with no fix commits prints 'no past fixes on these lines', exit 0; 7) npm run check passes
    status                  2026-10-28 submitted      report: branch ledger/t12-l2-why-and-past-fixes @24f8d0d: @mole/history check() + mole check CLI, red 8297d8a before imp
    next                    fresh reviewer → ledger move <task> verified --reviewer … --findings …
    pinned
    mode                    code
    boundary                packages/history/** (new), packages/daemon/src/cli.ts (new subcommands only), workspace wiring, tasks/T12-l2-why-and-past-fixes/**
    checks                  npm run check && node packages/history/dist/bench/m2.js
    non-goals               no PR comments/bot (D24) · no structure-map work (D23) · no wiki generator (D13) · prototype/ rejected · no publishing · don't edit benchmark keys after the red-tests commit (R2)
    proof                   runs.jsonl last line with M2 (per case) + M5 + npm run check output + red-tests commit sha
    stop                    same check failure 3 rounds in a row (loop rule R3) · a benchmark key looks wrong (log it in 4 log/key-changes.md, don't edit it) · needs Raymond's accounts or a product decision
    came from               USER 2026-10-28 21:00 'can we pls get started on building. lets say l2 l3 at least or anything before … keeping end goals checkpoints metrics benchamrs in midn as the loop goals' · D24 · tasks/loop-goals.json
    links                   4 log/ledger.md (every transition + its evidence)
    harness                 hermes
```
