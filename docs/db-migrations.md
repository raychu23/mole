## Summary
Mole's Postgres schema is now versioned with node-pg-migrate instead of ad-hoc
`create table if not exists`. A baseline migration reproduces the exact pre-T104 schema, is a
verified no-op on a database that already has it, and `runMigrations(pool)` keeps its old
signature so every existing caller is unchanged. Also fixed the test-isolation bug that made
`outbox.spec.ts` flake on a rerun against a shared database. Open: no real rollback tooling
(roll-forward only, by design, see below); only one migration exists so far.

## Why node-pg-migrate (prior art, fetched 2026-11-05)
- **node-pg-migrate** (github.com/salsita/node-pg-migrate, npm 9.0.0 published ~3 months ago
  per npmjs.com, 886k weekly downloads, 91 dependents, MIT, actively maintained by 3 current
  maintainers): plain SQL or JS/TS `up`/`down` migrations, a `migrate` CLI and a programmatic
  `runner()` API, its own Postgres advisory-lock concurrency guard, Postgres-only (also
  CockroachDB). Chosen: fits this package's existing stack exactly (TypeScript + `pg`, no new
  query-builder layer), and was the stack @mole/server's own original goal doc already named
  (`tasks/HANDOFF.md` T33 queue: "pg + node-pg-migrate").
- **graphile-migrate** (github.com/graphile/migrate, ~835-840 stars, MIT): roll-forward-only
  (matches this task's own rollback policy, see below) but built for the PostGraphile
  ecosystem specifically, requires a second "shadow" database for its `watch` dev loop, and its
  2.0 line was still release-candidate-only as of 2026-10 (bytebase.com/blog/top-open-source-
  postgres-migration-tools, Oct 2026 update). Mole doesn't use PostGraphile; not worth the
  shadow-DB requirement for nothing.
- **Kysely's migrator**: would mean adopting Kysely as the query-building layer across
  `packages/server` — a much larger change than this task's scope; `@mole/server` uses `pg`
  directly throughout (`db.ts`, `webhook.ts`, `outbox.ts`, ...) and there's no other reason in
  this wave to introduce a query builder.
- **umzug** (~600k weekly downloads per pkgpulse.com 2026 roundup, used internally by
  Sequelize): general-purpose, not Postgres-specific — no built-in CLI, no built-in Postgres
  advisory-lock concurrency guard (would have to hand-roll the exact same locking this task
  already needs `pg`'s `pg_advisory_lock` for). node-pg-migrate gives the same programmatic
  `up`/`down` migration shape with that machinery already built in.

## What changed (file:line)
- `packages/server/migrations/1699000000000_baseline.ts` (new): one migration whose SQL is
  byte-for-byte the old `db.ts` `SCHEMA_SQL` (every statement `if not exists` /
  `add column if not exists`), so running it via node-pg-migrate is a no-op wherever that
  schema already exists and builds it from nothing where it doesn't. `export const down = false`
  — rollback policy is roll-forward only (see "Rollback policy" below).
- `packages/server/src/db.ts`: `runMigrations(pool, options?: { schema? })` now runs the
  migration via node-pg-migrate's `runner()` (passed an already-connected `PoolClient` as
  `dbClient`, `noLock: true` since the function still takes its own `pg_advisory_lock(727001)`
  around the whole operation exactly as before — `ensureAppRole`'s grants must run under that
  same lock too). The function's signature stays `(pool) => Promise<void>` for every existing
  caller (`index.ts:110`, `bench/m25.ts:32`, 13 `*.spec.ts` files) — none of them changed.
  New exports: `MIGRATIONS_DIR`, `withSearchPathSchema()`, `createIsolatedTestPool()`,
  `dropIsolatedTestSchema()` (test-isolation helpers, see below; a real deploy never touches
  these, `schema` always defaults to `'public'`).
- `packages/server/src/cli.ts` (new): `mole-server migrate` — `node dist/src/cli.js migrate`
  reads `DATABASE_URL`, calls `runMigrations`. `package.json`'s `bin.mole-server` +
  `scripts.migrate` wire it up. `buildApp()` in `index.ts` already called `runMigrations(pool)`
  on every start (T33, unchanged) behind the same lock; this CLI is for a standalone
  pre-deploy migrate step (the same pattern node-pg-migrate's own CLI / Rails / Flyway use),
  not a replacement for the on-start call.
- `packages/server/migrations/1699000000000_baseline.ts`'s RLS-policy `DO` block: a real,
  pre-existing bug surfaced by building the schema-isolation test fix (see next item) — the
  `if not exists (select from pg_policies where tablename = 'outbox' and ...)` checks never
  filtered by `schemaname`, so once `public.outbox` had the `outbox_org_isolation` policy, this
  block treated EVERY OTHER SCHEMA's `outbox` table as "already has the policy" too and never
  created it there. A schema with `FORCE ROW LEVEL SECURITY` and zero policies default-denies
  all access — looks exactly like "RLS is broken" (`new row violates row-level security
  policy`) for any non-bypassrls role (`mole_app`), even though the table, grants and
  `app.current_org_id` setting were all correct. Fixed by filtering on
  `schemaname = current_schema()` (search_path is always exactly the migration's target schema
  while it runs). This was latent in the original code the whole time — it just never showed
  up because the original code only ever migrated into `public`.
- `packages/server/package.json`: `node-pg-migrate` moved from `devDependencies` to
  `dependencies` (it's required at server runtime now, not just in tests/build), `bin` +
  `migrate` script added.
- `packages/server/test/migrations.spec.ts` (new, 3 tests): baseline-on-empty vs baseline-on-
  pre-existing-legacy-schema produce byte-identical `pg_dump --schema-only` output; a migration
  already applied is never re-applied (`pgmigrations` has exactly 1 row after 2 calls); two
  concurrent `runMigrations` calls against one fresh database apply the baseline exactly once
  (advisory-lock serialized).
- `packages/server/test/outbox.spec.ts`: both `describe` blocks now use
  `createIsolatedTestPool`/`dropIsolatedTestSchema` instead of the shared `public` schema (see
  "Test isolation fix" below).

## Baseline proof (empty vs pre-existing database)
Ran by hand (and asserted in `migrations.spec.ts`'s first test):
1. `createdb mole_t104_smoke` (nothing in it) → `runMigrations(pool)` → 8 tables incl.
   `pgmigrations`.
2. `createdb mole_t104_preexisting` → hand-built the EXACT pre-T104 ad-hoc schema (no
   `pgmigrations` table, this task's "a database Mole already shipped before T104") →
   `runMigrations(pool)` on it: succeeds, no error, no duplicate-DDL.
3. `pg_dump --schema-only --no-owner --no-privileges` on both, diffed after stripping
   pg_dump 17's per-run random `\restrict`/`\unrestrict` tokens (a security feature, not
   schema content): **identical**.

## Concurrent-start proof
Two `Pool`s against one empty database, `Promise.all([runMigrations(p1), runMigrations(p2)])`:
`select count(*) from pgmigrations` is 1 afterward (advisory lock 727001 serializes them, same
mechanism as before T104, now wrapping node-pg-migrate's run instead of raw SQL).

## Test isolation fix (docs/server-slo.md "Found, not fixed" #3→ now a separate item)
Reproduced the documented bug first, on byte-for-byte unmodified pre-T104 code: ran
`outbox.spec.ts` alone against a database another (unrelated) spec file had already run
against — "a written notification is eventually relayed exactly once" failed `2` or `3` vs `1`,
because `relayOutboxOnce`/`relayOutboxOnceDetailed` have no org filter (correct for production:
a real deploy relays every org's pending rows) and the `public.outbox` table is shared by every
spec file in the suite. Any undelivered row left behind by `webhook.spec`, `index.spec`,
`crash-restart.spec`, etc. got relayed here too.

Fix: give each `outbox.spec.ts` describe block its OWN Postgres schema
(`createIsolatedTestPool(dbUrl, schemaName)` in `db.ts`): creates the schema, migrates into it
(tables + RLS policies + `pgmigrations` all land inside), and returns a `Pool` whose every
connection defaults its `search_path` there first via a `?options=-c search_path=...`
connection-string parameter — standard libpq behavior, applies per-connection with zero changes
to `createPool`'s signature or to `relayOutboxOnce`'s query logic. `dropIsolatedTestSchema` in
`afterAll` drops it. No other spec file's rows are ever visible to this schema, so re-running
`outbox.spec.ts` alone against the SAME database (no fresh DB needed) now passes every time —
verified 3 runs in a row.

Verified the fix didn't regress anything else: the full `packages/server` suite (72 tests, 20
files) run with `--pool=forks --poolOptions.forks.maxForks=2` against ONE shared database,
**3 times in a row, all green** (one unrelated flake seen once in a 4-fork run —
`metrics.spec.ts`'s in-process OTel counter assertion under heavy fork concurrency — passes
reliably alone and at `maxForks=2`; it is not a database-state issue and `metrics.ts`/
`outbox.ts` were not touched by this fix, see `tasks/T104-db-migrations/4 log/green.txt`).

## Rollback policy
Roll-forward only, same policy graphile-migrate documents and justifies (dropFORWARD-only is
also node-pg-migrate's own recommended default for anything beyond trivial `down`s): a bad
migration is fixed by writing and applying a NEW forward migration that corrects it, never by
running `down` against a database that may already have data depending on the new shape.
`1699000000000_baseline.ts` sets `export const down = false` to make this explicit and
mechanically enforced (node-pg-migrate refuses a `down` run against a migration whose `down` is
`false`). A future migration that MUST be reversible (e.g. a column rename behind a feature
flag) should still write a real `down`, scoped to that one migration — "roll-forward only" is
this project's default, not an absolute rule against ever writing a `down`.

## NOT RUN
- No second real migration was written (nothing beyond the baseline needed it yet) — the
  concurrent-starts / no-op / pg_dump-diff tests above are the proof that the MACHINERY works,
  not evidence of a second schema change being migrated successfully end-to-end in production.
- `mole-server migrate`'s `bin` entry was smoke-tested via `node dist/src/cli.js migrate`
  directly (works, see above); `npm link`/global-install of the bin was NOT exercised (no
  publish, per the never-list).
