---
state: proposed
owner:
repo: /Users/a1/Desktop/CS Code/Project/Mole
branch:
worktree:
base:
reviewer:
updated: 2026-10-29 01:38
status: ledger proposed
next: fill owner + done-when + boundary + checks + non-goals + proof + stop → ledger move <task> ready
---
```notes
T25-hand-back-verify-gate      ledger task (rules.md §3 code features)      project tasks
    goal                    One verification gate at the agent hand-back (Claude Code Stop hook, mole check --gate): the type-error delta from the TypeScript compiler (new errors vs the base commit), the related + guarding tests (T22), claims vs transcript (T24), collisions (T21), past fixes and stale notes (T11/T12) → one verdict (verified / unverified / failed) with each reason clickable, sent to the agent and shown in the panel; the in-edit loop stays with Claude Code's LSP plugins and Aider-style lint/test, Mole doesn't duplicate it
    done-when               1) mole check --gate prints the verdict + reasons as JSON and text; the Stop hook returns it to the agent; 2) M17 bench: 20 recorded hand-backs (Mole builder history replay + 6 planted bad ones), truth = a later fix commit, failing CI or a planted defect, labeled before the code → verdict agrees >= 90%, 0 'verified' on a planted defect; 3) gate p95 <= 20 s on Mole and Excalidraw; 4) failure case: tsc or the test runner missing → 'unverified: <reason>', never 'verified'; 5) npm run check passes
    status                  2026-10-29 proposed
    next                    fill owner + done-when + boundary + checks + non-goals + proof + stop → ledger move <task> ready
    pinned
    mode                    code
    boundary
    checks
    non-goals
    proof
    stop
    came from               USER 2026-10-29 06:40 'go far beyond … proper systems or dev support tools … full enterprise-grade both … ui user feats and some backend tools … compiler-in-the-loop … ideas foundations from open source … full system the end user like a junior dev or senior dev is situated in … big pic understanding' · Mole full system.md · D30
    links                   4 log/ledger.md (every transition + its evidence)
    harness                 hermes
```
