// T104 db-migrations.
//
// node-pg-migrate adoption proof: a baseline migration (migrations/1699000000000_baseline.ts)
// that is a no-op on a database that already has this schema (the pre-T104 world: db.ts's old
// runMigrations ran idempotent `create table if not exists` + ad-hoc `alter table ... add
// column if not exists` with no version tracking) and builds the identical schema from an
// empty database. Proved here by pg_dump --schema-only comparison, same technique used
// manually while building this task (tasks/T104-db-migrations/4 log/runs.jsonl).
import { afterAll, describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import pg from 'pg';
import { createPool, runMigrations, closePool } from '../src/db.js';

const execFileAsync = promisify(execFile);

const BASE_DB_URL = process.env.M25_DATABASE_URL;
// Use two throwaway databases on the same Postgres instance/role as M25_DATABASE_URL's own
// database (createdb/dropdb need a connectable admin database, not the one being created).
function adminUrl(): string {
  const u = new URL(BASE_DB_URL!);
  u.pathname = '/postgres';
  return u.toString();
}
function dbUrlFor(name: string): string {
  const u = new URL(BASE_DB_URL!);
  u.pathname = `/${name}`;
  return u.toString();
}

const EMPTY_DB = `mole_t104_baseline_empty_${Date.now()}`;
const PREEXISTING_DB = `mole_t104_baseline_pre_${Date.now()}`;

// The exact pre-T104 ad-hoc schema (db.ts's old SCHEMA_SQL, minus the later `alter table
// outbox add column ...` retry/backoff columns and `nodes.owner`/RLS-policy DO block, which
// are themselves migrations-for-pre-existing-tables patterns already baked into baseline's SQL
// and so are exercised by this same no-op property) — i.e. "a database Mole already shipped
// before T104", built with plain SQL, no node-pg-migrate, no pgmigrations table.
const LEGACY_SCHEMA_SQL = `
create table orgs (id text primary key, name text not null);
create table deliveries (delivery_id text primary key, org_id text not null, event text not null, commit_sha text, received_at timestamptz not null default now());
create table index_rebuild_log (id bigserial primary key, org_id text not null, commit_sha text not null, rebuilt_at timestamptz not null default now());
create table nodes (id text not null, org_id text not null, kind text not null, title text not null, file_path text, commit_sha text, primary key (org_id, id));
alter table nodes enable row level security;
alter table nodes force row level security;
create table relations (org_id text not null, from_id text not null, to_id text not null, type text not null, primary key (org_id, from_id, to_id, type));
alter table relations enable row level security;
alter table relations force row level security;
create table outbox (id bigserial primary key, org_id text not null, kind text not null, ref text, payload jsonb not null, created_at timestamptz not null default now(), delivered_at timestamptz);
alter table outbox enable row level security;
alter table outbox force row level security;
create unique index outbox_org_kind_ref_uniq on outbox (org_id, kind, ref) where ref is not null;
create table questions_log (id bigserial primary key, org_id text not null, file_path text not null, owner text not null, via text not null, created_at timestamptz not null default now());
`;

async function dumpSchema(dbName: string): Promise<string> {
  const { stdout } = await execFileAsync('pg_dump', [
    '-h', new URL(BASE_DB_URL!).searchParams.get('host') ?? 'localhost',
    '-p', new URL(BASE_DB_URL!).port || '5432',
    '--schema-only',
    '--no-owner',
    '--no-privileges',
    '-d', dbName,
  ]);
  // pg_dump 17+ emits a per-run random \restrict/\unrestrict token pair (security feature,
  // not schema content) — strip those two lines before comparing.
  return stdout
    .split('\n')
    .filter((line) => !line.startsWith('\\restrict') && !line.startsWith('\\unrestrict'))
    .join('\n');
}

describe('T104 baseline migration (node-pg-migrate)', () => {
  afterAll(async () => {
    if (!BASE_DB_URL) return;
    const admin = new pg.Pool({ connectionString: adminUrl() });
    await admin.query(`drop database if exists ${EMPTY_DB}`).catch(() => undefined);
    await admin.query(`drop database if exists ${PREEXISTING_DB}`).catch(() => undefined);
    await admin.end();
  });

  it.runIf(!!BASE_DB_URL)(
    'baseline builds the schema from empty AND is a no-op on an existing (pre-T104) database — identical pg_dump --schema-only',
    async () => {
      const admin = new pg.Pool({ connectionString: adminUrl() });
      await admin.query(`create database ${EMPTY_DB}`);
      await admin.query(`create database ${PREEXISTING_DB}`);
      await admin.end();

      // Pre-existing DB: build the legacy (pre-T104, no pgmigrations) schema by hand first.
      const legacyPool = new pg.Pool({ connectionString: dbUrlFor(PREEXISTING_DB) });
      await legacyPool.query(LEGACY_SCHEMA_SQL);
      await legacyPool.end();

      // Empty DB: nothing but the baseline migration.
      const emptyPool = createPool(dbUrlFor(EMPTY_DB));
      await runMigrations(emptyPool);
      await closePool(emptyPool);

      // Pre-existing DB: baseline must be a no-op that still ends in the identical schema
      // (it detects the tables already exist via plain `if not exists`/`add column if not
      // exists` and marks itself applied via pgmigrations — no error, no duplicate DDL).
      const preexistingPool = createPool(dbUrlFor(PREEXISTING_DB));
      await runMigrations(preexistingPool);
      await closePool(preexistingPool);

      const [emptySchema, preexistingSchema] = await Promise.all([dumpSchema(EMPTY_DB), dumpSchema(PREEXISTING_DB)]);
      expect(preexistingSchema).toBe(emptySchema);
    },
    30_000
  );

  it.runIf(!!BASE_DB_URL)(
    'a migration already applied is never re-applied: pgmigrations has exactly one row after two runMigrations calls',
    async () => {
      const dbUrl = dbUrlFor(EMPTY_DB);
      const pool = createPool(dbUrl);
      await runMigrations(pool); // already ran once above in this db; running again must stay a no-op
      await runMigrations(pool);
      const rows = await pool.query('select name from pgmigrations');
      expect(rows.rows.length).toBe(1);
      expect(rows.rows[0].name).toContain('baseline');
      await closePool(pool);
    },
    30_000
  );

  it.runIf(!!BASE_DB_URL)(
    'two concurrent processes starting at once apply the baseline migration exactly once (advisory-lock serialized)',
    async () => {
      const admin = new pg.Pool({ connectionString: adminUrl() });
      const dbName = `mole_t104_concurrent_${Date.now()}`;
      await admin.query(`create database ${dbName}`);
      await admin.end();
      try {
        const dbUrl = dbUrlFor(dbName);
        const p1 = createPool(dbUrl);
        const p2 = createPool(dbUrl);
        await Promise.all([runMigrations(p1), runMigrations(p2)]);
        const rows = await p1.query('select count(*)::int as c from pgmigrations');
        expect(rows.rows[0].c).toBe(1);
        await closePool(p1);
        await closePool(p2);
      } finally {
        const admin2 = new pg.Pool({ connectionString: adminUrl() });
        await admin2.query(`drop database if exists ${dbName}`).catch(() => undefined);
        await admin2.end();
      }
    },
    60_000
  );
});
