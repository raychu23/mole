```notes
ledger (newest last, nothing deleted)
    2026-11-01 20:41      new → proposed      Finish the temporal store's half-built parts with proven designs: (1) org_id on fact_versions/edge_versions + EXCLUDE constraint + RLS with FORCE, copying packa
    2026-11-01 20:42      proposed → ready      owner t47-builder
    2026-11-01 20:42      ready → running      worktree /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T47-temporal-tenant-recorded-time · branch ledger/t47-temporal-tenant-recorded-time · base 278b176
    2026-11-01 20:57      running → submitted      report: Red-tests commit 2bd444d (3 new test files: org-isolation, bitemporal-knownat, contradiction, fail to typecheck against old src/index.ts) before implementation commit 1103c9a (org_id/RLS/withOrgTx, knownAt, recor
    2026-11-01 20:57      checks ran: npm run check in /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T47-temporal-tenant-recorded-time → exit 0 ((Use `node --trace-warnings ...` to show where the warning was created))
    2026-11-01 21:14      submitted → running      changes requested: Fresh review: NOT VERIFIED. P0 recordFact conflates world change (forward valid-time change, no overlap in belief) with correction (retroactive overlap) -- always closes recorded and flags, so a normal
```
