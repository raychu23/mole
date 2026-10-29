# T33 key-changes log (R2)

## 2026-10-29 — fixture file-path collision in `bench/fixtures.ts::buildFixtureRepo`

**Reason for the change:** the RLS permission-leak test (`test/rls.spec.ts`) builds two
independent fixture repos (`rls-a`, `rls-b`) via `buildFixtureRepo`, which generated the
SAME decision id (`d0`) and SAME file path (`src/file0.ts`) for every org, since the
generator didn't vary either by org id. Querying "does org-b see org-a's decision on
`src/file0.ts`" then returned org-b's **own, legitimate** `d0`/`src/file0.ts` row (RLS was
correctly scoping to org-b's own rows) — a false "leak" caused by a naming collision in the
test fixture, not a leak of another org's data. Evidence/reproducer: running the test before
the fix failed with `expected 1 to be 0`, and inspecting the returned row showed
`org_id = 'rls-b'`, i.e. it was org-b's own record, not org-a's.

**Change:** `buildFixtureRepo` now names generated files/decisions
`src/${orgId}-file${i}.ts` / id `${orgId}-d${i}` instead of `src/file${i}.ts` / `d${i}`, so
two orgs' fixture repos never collide on id or path. The M25 bench's own `key.json` (org
ids, delivery count, duplicate rate, permission-leak scenario shape) is unchanged — only the
generator's internal naming collided, not the frozen acceptance numbers.

**Ruling:** self-approved as a bug-fix to the fixture generator (not a loosening of any
acceptance threshold — R7 untouched), since the alternative (leaving the collision) would
make the leak test structurally unable to ever distinguish "RLS blocked a real cross-org
read" from "the viewer happens to have an identically-named record of their own". Logged
here per R2 instead of silently editing frozen fixture code.
