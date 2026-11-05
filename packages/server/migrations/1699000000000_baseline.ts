// T104 db-migrations: baseline migration for node-pg-migrate (prior-art: see
// tasks/T104-db-migrations/4 log/prior-art.md — node-pg-migrate chosen over graphile-migrate
// (PostGraphile-specific, roll-forward-only, needs a second "shadow" database), Kysely's
// migrator (would require adopting Kysely as the query layer, a much bigger change than this
// task's scope) and umzug (general-purpose, no Postgres-specific CLI/locking built in).
//
// This migration's SQL is EXACTLY db.ts's old SCHEMA_SQL (every statement already
// `if not exists` / `if not exists`-column-add), so running it via node-pg-migrate is a
// verified no-op on a database that already has this schema (idempotent-by-construction,
// see test/migrations.spec.ts "baseline is a no-op on an existing database") and builds the
// identical schema from nothing on an empty database (test/migrations.spec.ts "baseline on
// an empty database produces the same pg_dump --schema-only as an existing one").
//
// Rollback policy (see docs/db-migrations.md): roll-forward only, same policy graphile-migrate
// documents ("in ten years of API development I've never run [a rollback] in production") —
// `down` is intentionally `false`. A bad migration is fixed by writing and applying a NEW
// forward migration, never by reverting this file's SQL in place.
import type { MigrationBuilder } from 'node-pg-migrate';

export const shorthands = undefined;

const BASELINE_SQL = `
create table if not exists orgs (
  id text primary key,
  name text not null
);

create table if not exists deliveries (
  delivery_id text not null,
  org_id text not null,
  event text not null,
  commit_sha text,
  received_at timestamptz not null default now(),
  primary key (delivery_id)
);

create table if not exists index_rebuild_log (
  id bigserial primary key,
  org_id text not null,
  commit_sha text not null,
  rebuilt_at timestamptz not null default now()
);

create table if not exists nodes (
  id text not null,
  org_id text not null,
  kind text not null, -- tenet | decision | exception | code | test | person | agent
  title text not null,
  file_path text,
  commit_sha text,
  owner text, -- CODEOWNERS/front-matter owner for this node, persisted by rebuild.ts so
              -- questions.ts routeQuestion can resolve "records first, else CODEOWNERS owner"
              -- (review round 1 P0 #2) without re-parsing CODEOWNERS on every read.
  primary key (org_id, id)
);
alter table nodes enable row level security;
alter table nodes force row level security;
-- Migration for pre-existing tables created before the owner column existed.
alter table nodes add column if not exists owner text;

create table if not exists relations (
  org_id text not null,
  from_id text not null,
  to_id text not null,
  type text not null,
  primary key (org_id, from_id, to_id, type)
);
alter table relations enable row level security;
alter table relations force row level security;

create table if not exists outbox (
  id bigserial primary key,
  org_id text not null,
  kind text not null,
  ref text,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  delivered_at timestamptz
);
alter table outbox enable row level security;
alter table outbox force row level security;
create unique index if not exists outbox_org_kind_ref_uniq on outbox (org_id, kind, ref) where ref is not null;
-- T98 server-slo: retry-with-backoff + dead-letter for the outbox relay (R0 server-slo
-- prior-art.md GitHub webhook best practices + pg-boss's own retry/deadLetter pattern,
-- applied here too since relayOutboxOnce is a *separate* failure domain from the pg-boss
-- queue -- a transient fake/real-GitHub-API failure must not retry in a hot loop forever,
-- and a permanently-failing row must stop being re-selected every relay tick.
alter table outbox add column if not exists attempts int not null default 0;
alter table outbox add column if not exists next_attempt_at timestamptz not null default now();
alter table outbox add column if not exists last_error text;
alter table outbox add column if not exists dead_letter boolean not null default false;

create table if not exists questions_log (
  id bigserial primary key,
  org_id text not null,
  file_path text not null,
  owner text not null,
  via text not null,
  created_at timestamptz not null default now()
);

-- T104 db-migrations: the pg_policies existence checks below used to filter by tablename
-- only, with no schemaname condition. That is harmless as long as every deploy only ever
-- used the 'public' schema (true before this task) -- but it means that once public.outbox
-- (etc.) has the policy, this block treats it as "already exists" for EVERY OTHER SCHEMA
-- too and never creates it there, so a schema-isolated test database's RLS-forced tables end
-- up with ZERO policies -- i.e. default-deny -- which looks exactly like "the row-level
-- security feature is broken" (a plain insert as a non-bypassrls role fails with "new row
-- violates row-level security policy") when it is really "the migration silently skipped
-- creating the policy outside of 'public'". Filtering by schemaname = current_schema()
-- (search_path is always exactly the target schema while this migration runs, see db.ts's
-- runMigrations) makes this correct for every schema, public included.
do $$ begin
  if not exists (select from pg_policies where schemaname = current_schema() and tablename = 'nodes' and policyname = 'nodes_org_isolation') then
    create policy nodes_org_isolation on nodes
      using (org_id = current_setting('app.current_org_id', true))
      with check (org_id = current_setting('app.current_org_id', true));
  end if;
  if not exists (select from pg_policies where schemaname = current_schema() and tablename = 'relations' and policyname = 'relations_org_isolation') then
    create policy relations_org_isolation on relations
      using (org_id = current_setting('app.current_org_id', true))
      with check (org_id = current_setting('app.current_org_id', true));
  end if;
  if not exists (select from pg_policies where schemaname = current_schema() and tablename = 'outbox' and policyname = 'outbox_org_isolation') then
    create policy outbox_org_isolation on outbox
      using (org_id = current_setting('app.current_org_id', true))
      with check (org_id = current_setting('app.current_org_id', true));
  end if;
end $$;
`;

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(BASELINE_SQL);
}

// Roll-forward only (see header comment + docs/db-migrations.md).
export const down = false;
