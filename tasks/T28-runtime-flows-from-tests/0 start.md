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
T28-runtime-flows-from-tests      ledger task (rules.md §3 code features)      project tasks
    goal                    What actually runs: record call sequences while the test suite runs (V8 coverage + OpenTelemetry spans around exported functions, AppMap-style), and add runtime edges to the context graph so the picture and the gate see calls the static graph can't resolve (dynamic dispatch, callbacks, plugin registries)
    done-when               1) mole flows record runs vitest with instrumentation and stores per-test flows; mole flows <file#Symbol> lists the tests and call paths that exercise it; 2) M20 bench: 50 call edges sampled from Mole + Excalidraw, half dynamic, truth from manual trace, labeled before the code → runtime flows recover >= 80% of the dynamic ones the static graph misses, 0 invented edges; 3) instrumentation overhead on the test suite <= 2x; 4) npm run check passes
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
