state: built, needs review
owner: wave-i-agent-i1
repo: /Users/a1/Desktop/CS Code/Project/Mole
branch: ledger/t104-db-migrations
worktree: /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T104-db-migrations
base: 1046d1a
status: built, not yet reviewed or integrated
next: adversarial review (sdlc 4-verify/4-adversarial-review), then ledger integrate
---
```notes
T104-db-migrations     wave I task I1 (backend; docs/server-slo.md "Found, not fixed": unversioned
                        migrations, test isolation)
    goal                adopt an established Postgres+TypeScript migration tool (node-pg-migrate,
                        over graphile-migrate/Kysely's migrator/umzug, see docs/db-migrations.md),
                        convert the current ad-hoc schema into a baseline migration that is a
                        no-op on an existing database and builds the identical schema on an empty
                        one (pg_dump --schema-only proof), wire `mole-server migrate` + keep the
                        existing on-start call behind the existing advisory lock, document
                        rollback policy (roll-forward only). Also fix the documented outbox.spec
                        test-isolation bug (schema per test file via a connection-string
                        search_path trick) so the suite passes rerun against one Postgres.
    done-when           docs/db-migrations.md (baseline on empty vs existing: identical
                          pg_dump --schema-only; migration applied once after 2 calls; 2
                          concurrent processes apply once) + outbox.spec.ts passing 3x in a row
                          against one shared database + full packages/server suite green 3x in a
                          row against one shared database (72/72, 20/20 files) + npx tsc -b clean
    status              2026-11-05 built on branch ledger/t104-db-migrations, NOT merged/reviewed.
                        npx tsc -b packages/server packages/decisions packages/temporal clean.
    boundary            packages/server/migrations/** (new), packages/server/src/{db,cli}.ts,
                        packages/server/package.json, packages/server/test/{migrations,outbox}
                        .spec.ts, docs/{db-migrations.md (new),server-slo.md},
                        tasks/T104-db-migrations/**
    non-goals           no real GitHub App, no Docker, no paid API, no Raymond accounts, no
                        second real migration beyond the baseline (nothing needed one yet), no
                        fix for the separate pg-boss cross-test-file contention (docs/server-
                        slo.md item 5, unrelated, pre-existing on byte-for-byte unmodified main)
    found-not-fixed     a real pre-existing latent bug surfaced while building the schema-
                        isolation test fix: the baseline SQL's RLS-policy-existence checks
                        (`select from pg_policies where tablename=... `) never filtered by
                        schemaname, so once public.outbox had a policy, no OTHER schema ever got
                        it created (FORCE ROW LEVEL SECURITY + 0 policies = default-deny). Fixed
                        as part of this task (filter by current_schema()) since it blocked the
                        test-isolation work outright -- see docs/db-migrations.md.
    came from           Wave I brief I1 (briefs/G-wave.md), Raymond 11-05 03:45 "keep going ...
                        new tasks from established goals, end user, recruiter/backend, deep
                        research, run overnight"
    links               docs/db-migrations.md (full prior-art + proofs + rollback policy)
                        docs/server-slo.md "Found, not fixed" #3 + test-isolation item
                        tasks/T104-db-migrations/4 log/{red,green}.txt
    harness             hermes
```
