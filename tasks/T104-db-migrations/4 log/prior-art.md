## Summary
node-pg-migrate chosen over graphile-migrate / Kysely's migrator / umzug for Mole's Postgres
migration tool. Full comparison + citations live in docs/db-migrations.md "Why node-pg-migrate"
(this file just indexes the sources fetched, newest first).

- bytebase.com/blog/top-open-source-postgres-migration-tools (fetched 2026-11-05, dated through
  Oct 2026 updates): graphile-migrate 2.0 still RC-only as of Oct 2026, ~835-840 stars,
  roll-forward-only, two-database (shadow DB) dev loop requirement; node-pg-migrate ~1,500
  stars per this source's count.
- npmjs.com/package/node-pg-migrate (fetched 2026-11-05): 9.0.0, 886,090 weekly downloads,
  91 dependents, MIT, 3 active maintainers (Christopher Quadflieg, Breno A., Omar Diab),
  requires Node >=20.11 (this repo runs Node 22) and Postgres >=13.
- npm.io/package/graphile-migrate + github.com/graphile/migrate via trendshift.io (fetched
  2026-11-05): confirms the shadow-DB `watch` workflow and roll-forward philosophy ("in ten
  years of API development I've never run [a rollback] in production" -- the same policy this
  task adopts for the baseline migration).
- pkgpulse.com/guides/best-database-migration-tools-nodejs-2026 (fetched 2026-11-05): umzug
  ~600k weekly downloads, used internally by Sequelize, framework-agnostic `up`/`down` JS
  modules with no Postgres-specific CLI or advisory-lock concurrency guard built in (would have
  to hand-roll the exact locking node-pg-migrate already provides).
- tasks/HANDOFF.md (this repo, T33-team-server's original goal line, 2026-10-29): "pg +
  node-pg-migrate" was already the stack @mole/server's own build task named before this
  wave -- corroborating evidence this choice fits the existing codebase, not new research
  picking an unfamiliar tool.
