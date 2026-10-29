// T38 bitemporal decision graph (M32). Schema is packages/temporal/src/schema.sql (btree_gist +
// EXCLUDE USING gist: maps 1:1 to PG18's `PRIMARY KEY (..., valid WITHOUT OVERLAPS)`, see that file's
// header comment). History is append-only: insertFact only INSERTs; closeFact performs exactly one
// UPDATE of an open row's upper bound (bounding its range, never rewriting its value) -- the same
// "invalidate, never delete" pattern as Graphiti's valid_at/invalid_at edges (arXiv 2501.13956).
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool, type PoolConfig } from 'pg';

export interface FactInput {
  factId: string;
  kind: 'decision' | 'tenet' | 'intent' | 'incident' | 'edge';
  attr: string;
  value: string;
  validFrom: string;
  validTo: string | null;
  source?: string;
}

export function openPool(connectionString: string, config: PoolConfig = {}): Pool {
  // small pool by default: Postgres here is shared across several builders' worktrees
  // (max_connections=100 on this machine) -- never hold more than a courteous slice of it.
  return new Pool({ connectionString, max: 15, ...config });
}

// schema.sql is a checked-in source file, not emitted by tsc: resolve it relative to the package
// root (src/schema.sql) whether this module is running from src (vitest) or dist/src (built).
const hereDir = dirname(fileURLToPath(import.meta.url));
const schemaPath = hereDir.endsWith(join('dist', 'src')) ? join(hereDir, '..', '..', 'src', 'schema.sql') : join(hereDir, 'schema.sql');
const SCHEMA_SQL = readFileSync(schemaPath, 'utf8');

export async function applySchema(pool: Pool): Promise<void> {
  await pool.query(SCHEMA_SQL);
}

/**
 * Insert one fact version. The database enforces 0 overlapping validity rows per (fact_id, attr)
 * via EXCLUDE USING gist -- this never relies on an app-level check. A call that is an exact
 * duplicate of an existing row (same fact_id, attr, value, valid bounds) is a no-op: idempotent
 * re-insertion is not the same thing as two conflicting facts, and callers (the loader, concurrent
 * writers retrying) may legitimately see the same fact twice.
 */
export async function insertFact(pool: Pool, f: FactInput): Promise<void> {
  const dup = await pool.query(
    `select 1 from fact_versions
     where fact_id = $1 and attr = $2 and value = $3
       and lower(valid) = $4::timestamptz
       and (upper(valid) is null) = ($5::timestamptz is null)
       and (upper(valid) is null or upper(valid) = $5::timestamptz)
     limit 1`,
    [f.factId, f.attr, f.value, f.validFrom, f.validTo],
  );
  if ((dup.rowCount ?? 0) > 0) return;
  await pool.query(
    `insert into fact_versions (fact_id, kind, attr, value, valid, source)
     values ($1, $2, $3, $4, tstzrange($5::timestamptz, $6::timestamptz, '[)'), $7)`,
    [f.factId, f.kind, f.attr, f.value, f.validFrom, f.validTo, f.source ?? null],
  );
}

/** Close the currently-open version of (factId, attr): bound its valid range's upper end at `at`.
 *  Exactly one UPDATE of the upper bound of the still-open row -- the value itself is never touched,
 *  and once a row's upper bound is set it is never updated again (see test/temporal.test.ts). */
export async function closeFact(pool: Pool, factId: string, attr: string, at: string): Promise<void> {
  await pool.query(
    `update fact_versions
     set valid = tstzrange(lower(valid), $3::timestamptz, '[)')
     where fact_id = $1 and attr = $2 and upper_inf(valid)`,
    [factId, attr, at],
  );
}

/** What held for (factId, attr) at the given instant (application/valid time). null = no fact yet. */
export async function asOf(pool: Pool, factId: string, attr: string, at: string): Promise<string | null> {
  const r = await pool.query(
    `select value from fact_versions
     where fact_id = $1 and attr = $2 and valid @> $3::timestamptz
     order by id desc limit 1`,
    [factId, attr, at],
  );
  return r.rows[0]?.value ?? null;
}

/** What (factId, attr) held at t1 vs t2. */
export async function diff(
  pool: Pool,
  factId: string,
  attr: string,
  t1: string,
  t2: string,
): Promise<{ from: string | null; to: string | null }> {
  const [from, to] = await Promise.all([asOf(pool, factId, attr, t1), asOf(pool, factId, attr, t2)]);
  return { from, to };
}

/**
 * decision -> scope -> code: recursive CTE over edge_versions (traces_to/supersedes/...), as-of a
 * point in time (default: now). Returns every id reachable from `rootId` following edges valid at
 * `at`, with the hop depth.
 */
export async function decisionToCode(
  pool: Pool,
  rootId: string,
  at: string = new Date().toISOString(),
  maxDepth = 8,
): Promise<Array<{ id: string; depth: number; edgeType: string }>> {
  const r = await pool.query(
    `with recursive walk(id, depth, edge_type) as (
       select $1::text, 0, ''::text
       union all
       select e.to_id, w.depth + 1, e.edge_type
       from edge_versions e
       join walk w on e.from_id = w.id
       where e.valid @> $2::timestamptz and w.depth < $3
     )
     select id, depth, edge_type from walk where depth > 0`,
    [rootId, at, maxDepth],
  );
  return r.rows;
}

export { loadDecisionsJsonl, loadMoleDecisionsGit } from './loader.js';
