// Postgres pool + schema migrations + RLS (R0 prior-art.md §6: non-owner FORCE ROW LEVEL
// SECURITY role, org_id on every tenant table, SET LOCAL app.current_org_id per request).
//
// T104 db-migrations: migrations are now run through node-pg-migrate (see migrations/ and
// docs/db-migrations.md for why it was picked over graphile-migrate/Kysely/umzug, and the
// rollback policy). runMigrations() keeps its original `(pool) => Promise<void>` signature —
// every existing caller (index.ts, bench/m25.ts, every *.spec.ts under test/) is unaffected —
// and still takes the same session advisory lock (727001) around the whole operation, now
// wrapping node-pg-migrate's own run instead of raw `client.query(SCHEMA_SQL)`.
import pg, { type ClientBase } from 'pg';
import { runner } from 'node-pg-migrate';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export type Pool = pg.Pool;

export function createPool(connectionString: string): Pool {
  return new pg.Pool({ connectionString, max: 10 });
}

export async function closePool(pool: Pool): Promise<void> {
  await pool.end();
}

// Resolve packages/server/migrations regardless of whether this module is running as
// compiled dist/src/db.js (migrations/ is two levels up) or directly as src/db.ts under
// vitest's ESM TS loader (migrations/ is one level up) — see docs/db-migrations.md.
const here = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR_CANDIDATES = [join(here, '..', 'migrations'), join(here, '..', '..', 'migrations')];
export const MIGRATIONS_DIR = MIGRATIONS_DIR_CANDIDATES.find((p) => existsSync(p)) ?? MIGRATIONS_DIR_CANDIDATES[0]!;

const SCHEMA_NAME_RE = /^[a-z_][a-z0-9_]*$/;

function assertValidSchemaName(schema: string): void {
  if (!SCHEMA_NAME_RE.test(schema)) {
    throw new Error(`invalid Postgres schema name: ${JSON.stringify(schema)}`);
  }
}

/** Creates (idempotently) a non-owner role used for every RLS-scoped request/job connection,
 * and grants it on the given schema (default 'public', the only schema a real deploy uses —
 * non-public schemas are a test-isolation-only feature, see createIsolatedTestPool below). */
async function ensureAppRole(client: pg.PoolClient | ClientBase, schema: string): Promise<void> {
  assertValidSchemaName(schema);
  await client.query(`
    do $$ begin
      if not exists (select from pg_roles where rolname = 'mole_app') then
        create role mole_app login;
      end if;
    end $$;
  `);
  await client.query(`grant usage on schema ${schema} to mole_app`);
  await client.query(`grant all on all tables in schema ${schema} to mole_app`);
  await client.query(`grant usage, select on all sequences in schema ${schema} to mole_app`);
  await client.query(`alter default privileges in schema ${schema} grant all on tables to mole_app`);
}

export interface RunMigrationsOptions {
  /** Postgres schema migrations run against and tables land in. Defaults to 'public' (every
   * real deploy). A non-default value is for test isolation only (createIsolatedTestPool). */
  schema?: string;
}

export async function runMigrations(pool: Pool, options: RunMigrationsOptions = {}): Promise<void> {
  const schema = options.schema ?? 'public';
  assertValidSchemaName(schema);
  // Multiple test files/processes can call this concurrently against one DB; take a session
  // advisory lock so node-pg-migrate's own run (and ensureAppRole's grants) never race another
  // caller's. node-pg-migrate has its own advisory-lock mechanism (PG_MIGRATE_LOCK_ID) too, but
  // ensureAppRole must run under the SAME lock as the migration (it also mutates shared state),
  // so noLock:true on the runner call and one lock held for the whole function, as before T104.
  const client = await pool.connect();
  try {
    await client.query('select pg_advisory_lock(727001)');
    await runner({
      dbClient: client as unknown as ClientBase,
      dir: MIGRATIONS_DIR,
      direction: 'up',
      migrationsTable: 'pgmigrations',
      migrationsSchema: schema,
      schema,
      createSchema: true,
      createMigrationsSchema: true,
      noLock: true,
      log: () => undefined,
      logger: { info: () => undefined, warn: () => undefined, error: () => undefined },
    });
    await ensureAppRole(client, schema);
  } finally {
    await client.query('select pg_advisory_unlock(727001)').catch(() => undefined);
    client.release();
  }
}

/** Appends a libpq `options=-c search_path=...` parameter to a Postgres connection string, so
 * EVERY connection pg opens against it (the whole point of a Pool) defaults to that schema
 * first, `public` second — without changing createPool's signature or any call site. Used only
 * by createIsolatedTestPool below; a real deploy always migrates/serves against 'public'. */
export function withSearchPathSchema(connectionString: string, schema: string): string {
  assertValidSchemaName(schema);
  const sep = connectionString.includes('?') ? '&' : '?';
  return `${connectionString}${sep}options=${encodeURIComponent(`-c search_path=${schema},public`)}`;
}

/**
 * T104 db-migrations: fixes the documented test-isolation bug (docs/server-slo.md "Found, not
 * fixed": outbox.spec's relay selects rows across ALL orgs with no schema scoping, so when
 * another test file in the same long-lived database leaves an undelivered outbox row behind,
 * outbox.spec's "relayed exactly once" assertion sees it too and fails 2-or-3 vs 1 on a rerun).
 * Gives one test FILE its own Postgres schema: creates it, migrates into it (tables + RLS
 * policies + the pgmigrations tracking table all land inside, via runMigrations({schema})),
 * and returns a pool whose connections always default their search_path there first. Call
 * dropIsolatedTestSchema in afterAll to clean up. baseConnectionString must NOT already carry
 * an `options` query param (it will be overwritten).
 */
export async function createIsolatedTestPool(baseConnectionString: string, schema: string): Promise<Pool> {
  assertValidSchemaName(schema);
  const admin = new pg.Pool({ connectionString: baseConnectionString, max: 1 });
  try {
    await admin.query(`create schema if not exists "${schema}"`);
  } finally {
    await admin.end();
  }
  const pool = createPool(withSearchPathSchema(baseConnectionString, schema));
  await runMigrations(pool, { schema });
  return pool;
}

/** Drops a schema created by createIsolatedTestPool. Call with the pool already closed. */
export async function dropIsolatedTestSchema(baseConnectionString: string, schema: string): Promise<void> {
  assertValidSchemaName(schema);
  const admin = new pg.Pool({ connectionString: baseConnectionString, max: 1 });
  try {
    await admin.query(`drop schema if exists "${schema}" cascade`);
  } finally {
    await admin.end();
  }
}

/**
 * Runs fn with a connection scoped (via SET LOCAL + SET ROLE, inside one transaction) to
 * orgId, so every RLS policy above applies for the duration of fn. This is the only way
 * server code should ever touch nodes/relations/outbox (R0 §6 "automated WHERE").
 */
export async function withOrgTx<T>(pool: Pool, orgId: string, fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query('set local role mole_app');
    await client.query('select set_config($1, $2, true)', ['app.current_org_id', orgId]);
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (e) {
    await client.query('rollback').catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }
}

/** Read-only variant: same org scoping, no transaction mutation implied beyond SET LOCAL. */
export async function withOrgRead<T>(pool: Pool, orgId: string, fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  return withOrgTx(pool, orgId, fn);
}
