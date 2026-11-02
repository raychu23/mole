---
state: proposed
owner: t45-builder
repo: Project/Mole
branch: t45-wire-prcheck-into-server-checkrun
worktree: Project/Mole-worktrees/T45-wire-prcheck-into-server-checkrun
base: main
reviewer: unassigned
updated: 2026-11-01 18:01
status: ledger proposed
next: fill owner + done-when + boundary + checks + non-goals + proof + stop → ledger move <task> ready
---
```notes
T45-wire-prcheck-into-server-checkrun      ledger task (rules.md §3 code features)      project Mole
    goal                    packages/server/src/checkrun.ts's live per-push check-run hardcodes conclusion:'success' (line 46) and never calls prCheck's governed/content-anchor result; wire prCheck (packages/decisions) into the server's live conclusion so a real content-anchor match (T32) actually surfaces instead of being discarded before the check run is written.
    done-when               1 checkrun.ts calls prCheck (or its governed/content-anchor computation) instead of (or alongside) getGoverningDecisions' file-count-only check · 2 conclusion is 'neutral' when nothing governs, and a real signal (not hardcoded 'success') when a content-anchor match fires, consistent with Mole's own 'flags, not gates' rule (a warning-shaped annotation, not a hard failure) · 3 existing checkrun tests updated + new test: a content-anchor match on a real diff changes the computed result, not just file counts · 4 npm run check green
    status                  2026-11-01 proposed
    next                    fill owner + done-when + boundary + checks + non-goals + proof + stop → ledger move <task> ready
    pinned
    mode                    one worker
    boundary                packages/server/src/checkrun.ts + its tests
    checks                  npm run check
    non-goals               no change to packages/decisions/prCheck itself (it already does the real work) · not a new gating/blocking policy -- still flags, not gates
    proof                   before/after checkrun.ts output on the same diff that m2-conflict/cases_with_mole.json already shows prCheck flagging (e.g. dev-adr003-violate) · npm run check
    stop                    if wiring prCheck into the live push path needs a product decision about which of prCheck's many outputs belong in a GitHub check-run body, stop and ask rather than guessing the UX
    came from               T44-conflict-check-bench (M2 bench), context/product-plan/systems/metrics-proof/m2-conflict/4 log/mole-capability-and-gap.md
    links                   4 log/ledger.md (every transition + its evidence)
    harness                 hermes
```
