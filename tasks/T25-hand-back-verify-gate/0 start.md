---
state: running
owner: mole-builder-10
repo: /Users/a1/Desktop/CS Code/Project/Mole
branch: ledger/t25-hand-back-verify-gate
worktree: /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T25-hand-back-verify-gate
base: d312d66
reviewer:
updated: 2026-10-29 15:45
status: ledger running
next: worker finishes → ledger move <task> submitted --report … (ledger runs the checks row)
claimed: 2026-10-29 15:45
---
```notes
T25-hand-back-verify-gate      ledger task (rules.md §3 code features)      project tasks
    goal                    One verification gate at the agent hand-back (Claude Code Stop hook, mole check --gate): the type-error delta from the TypeScript compiler (new errors vs the base commit), the related + guarding tests (T22), claims vs transcript (T24), collisions (T21), past fixes and stale notes (T11/T12) → one verdict (verified / unverified / failed) with each reason clickable, sent to the agent and shown in the panel; the in-edit loop stays with Claude Code's LSP plugins and Aider-style lint/test, Mole doesn't duplicate it
    done-when               1) mole check --gate prints the verdict + reasons as JSON and text; the Stop hook returns it to the agent; 2) M17 bench: 20 recorded hand-backs (Mole builder history replay + 6 planted bad ones), truth = a later fix commit, failing CI or a planted defect, labeled before the code → verdict agrees >= 90%, 0 'verified' on a planted defect; 3) gate p95 <= 20 s on Mole and Excalidraw; 4) failure case: tsc or the test runner missing → 'unverified: <reason>', never 'verified'; 5) npm run check passes
    status                  2026-10-29 running      worktree /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T25-hand-back-verify-gate · branch ledger/t25-hand-back-verify
    next                    worker finishes → ledger move <task> submitted --report … (ledger runs the checks row)
    pinned
    mode                    code
    boundary                packages/verify/src/gate/** + packages/verify/bench/m17*, packages/daemon/src/cli.ts (register the subcommand with one import + one call only), packages/mcp/src (new mole_gate tool only), plugins/claude-code/** (Stop hook), tasks/T25-hand-back-verify-gate/**
    checks                  npm run check && node packages/verify/dist/bench/m17.js
    non-goals               no PR comments/bot (D24) · no structure-map work (D23) · prototype/ rejected · no publishing or pushing · Raymond's accounts never used · no paid API or model calls from Mole code · don't edit benchmark keys after the red-tests commit (R2) · shared registries (MCP tool list, CLI usage, workspace deps) tested with toContain, never an exact set
    proof                   runs.jsonl last line with the metric + npm run check output + the red-tests commit sha dated before the first implementation commit + the fresh reviewer's verdict
    stop                    same check failure 3 rounds in a row (R3) · needs Raymond's accounts, paid API spend, people or a product decision (log it in 4 log, move on to the next task)
    came from               USER 2026-10-29 06:40 'go far beyond … proper systems or dev support tools … full enterprise-grade both … ui user feats and some backend tools … compiler-in-the-loop … ideas foundations from open source … full system the end user like a junior dev or senior dev is situated in … big pic understanding' · Mole full system.md · D30
    links                   4 log/ledger.md (every transition + its evidence)
    harness                 hermes
```
