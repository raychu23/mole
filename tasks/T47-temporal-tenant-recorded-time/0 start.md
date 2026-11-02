---
state: ready
owner: t47-builder
repo:
branch:
worktree:
base:
reviewer:
updated: 2026-11-01 20:42
status: ledger ready
next: worker claims it → ledger move <task> running --orca | --git-worktree | --worktree PATH
---
```notes
T47-temporal-tenant-recorded-time      ledger task (rules.md §3 code features)      project tasks
    goal                    Finish the temporal store's half-built parts with proven designs: (1) org_id on fact_versions/edge_versions + EXCLUDE constraint + RLS with FORCE, copying packages/server/src/db.ts's existing pattern (Graphiti group_id precedent); (2) a knownAt/as-of-recorded query so 'what did we believe on date X' works (SQL:2011 system time / XTDB bitemporal); (3) contradiction handling: a new conflicting fact invalidates (never deletes) the old one and raises a flag for a person (Graphiti resolve_edge_contradictions, ai-memory advisory flags). Source: Project/Mole/context/product-plan/systems/core-audit/storage-time-memory.md
    done-when               1 failing tests first · 2 org A and org B both using D1 never see each other's facts (test as non-owner role) · 3 asOf(valid) x knownAt(recorded) 2x2 tests incl. a late correction · 4 conflicting load produces invalidation + flag, history intact · 5 migration for existing rows documented · 6 npm run check
    status                  2026-11-01 ready      owner t47-builder
    next                    worker claims it → ledger move <task> running --orca | --git-worktree | --worktree PATH
    pinned
    mode                    one worker
    boundary                packages/temporal/** + tests
    checks                  npm run check
    non-goals               no PG18 native WITHOUT OVERLAPS migration path (stay on btree_gist EXCLUDE, local PG is 16) · no UI for the contradiction flag, just a durable row a person can query · no change to decisionToCode/diff/loader call signatures beyond adding org_id where required · no cross-org query API
    proof                   failing-tests commit hash before implementation commit + npm run check output + org-isolation test run as non-owner role
    stop                    same check failure 3 rounds in a row · needs a schema decision only Raymond can make (log it, move to next task)
    came from               core audit 11-01 (storage-time-memory top 3)
    links                   4 log/ledger.md (every transition + its evidence)
    harness                 hermes
```
