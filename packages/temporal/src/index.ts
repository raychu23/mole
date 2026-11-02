// T38 bitemporal decision graph (M32), now with T47 tenant isolation. Schema is
// packages/temporal/src/schema.sql (btree_gist + EXCLUDE USING gist: maps 1:1 to PG18's
// `PRIMARY KEY (..., valid WITHOUT OVERLAPS)`, see that file's header comment). History is
// append-only: insertFact only INSERTs; closeFact performs exactly one UPDATE of an open row's
// upper bound (bounding its range, never rewriting its value) -- the same "invalidate, never
// delete" pattern as Graphiti's valid_at/invalid_at edges (edge_operations.py:715-783).
//
// T47: every table carries org_id and is scoped by Postgres RLS with FORCE (copying
// packages/server/src/db.ts's withOrgTx/mole_app pattern exactly, here as mole_temporal_app --
// see schema.sql's comment block). Callers MUST run every fact/edge/flag query through
// withOrgTx; the functions below accept a Queryable (Pool or a PoolClient already inside a
// withOrgTx callback) and never filter by org_id themselves -- RLS is the enforcement boundary,
// exactly like db.ts's nodes/relations/outbox queries.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool, type PoolClient, type PoolConfig } from 'pg';

export interface FactInput {
  orgId: string;
  factId: string;
  kind: 'decision' | 'tenet' | 'intent' | 'incident' | 'edge';
  attr: string;
  value: string;
  validFrom: string;
  validTo: string | null;
  source?: string;
}

/** Anything with pg's `.query(text, params)` shape: a Pool, or a PoolClient inside withOrgTx. */
export interface Queryable {
  query(text: string, params?: unknown[]): Promise<{ rows: any[]; rowCount: number | null }>;
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
 * Runs fn with a connection scoped (via SET LOCAL + SET ROLE, inside one transaction) to orgId,
 * so every RLS policy in schema.sql applies for the duration of fn. This is the only way
 * application code should touch fact_versions/edge_versions/contradiction_flags (T47 #1), copying
 * packages/server/src/db.ts's withOrgTx (mole_app there, mole_temporal_app here) exactly.
 */
export async function withOrgTx<T>(pool: Pool, orgId: string, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query('set local role mole_temporal_app');
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

/**
 * Insert one fact version. The database enforces 0 (valid && recorded) overlaps per
 * (org_id, fact_id, attr) via EXCLUDE USING gist -- this never relies on an app-level check (a
 * bitemporal correction legitimately inserts a second row with the SAME valid range once the old
 * row's recorded range is closed; see schema.sql and recordFact below). A call that is an exact
 * duplicate of an existing LIVE row (same fact/attr/value/valid bounds, recorded still open) is a
 * no-op: idempotent re-insertion is not the same thing as a conflicting fact.
 */
export async function insertFact(client: Queryable, f: FactInput, recordedFrom?: string): Promise<void> {
  const dup = await client.query(
    `select 1 from fact_versions
     where fact_id = $1 and attr = $2 and value = $3
       and lower(valid) = $4::timestamptz
       and (upper(valid) is null) = ($5::timestamptz is null)
       and (upper(valid) is null or upper(valid) = $5::timestamptz)
       and upper_inf(recorded)
     limit 1`,
    [f.factId, f.attr, f.value, f.validFrom, f.validTo],
  );
  if ((dup.rowCount ?? 0) > 0) return;
  // recordedFrom lets recordFact() hand in the exact clock.timestamp.now() instant it used to
  // CLOSE the conflicting row's recorded range -- Postgres's own now() is frozen to the
  // enclosing transaction's start time (every statement in one tx sees the same now()), so
  // relying on the column DEFAULT here would make this row's recorded START predate the old
  // row's just-closed recorded END within the same transaction, re-triggering the EXCLUDE.
  await client.query(
    `insert into fact_versions (org_id, fact_id, kind, attr, value, valid, recorded, source)
     values ($1, $2, $3, $4, $5, tstzrange($6::timestamptz, $7::timestamptz, '[)'),
             tstzrange(coalesce($9::timestamptz, now()), NULL, '[)'), $8)`,
    [f.orgId, f.factId, f.kind, f.attr, f.value, f.validFrom, f.validTo, f.source ?? null, recordedFrom ?? null],
  );
}

/** Close the currently-open version of (factId, attr): bound its valid range's upper end at `at`.
 *  Exactly one UPDATE of the upper bound of the still-open row -- the value itself is never touched,
 *  and once a row's upper bound is set it is never updated again (see test/temporal.test.ts). */
export async function closeFact(client: Queryable, factId: string, attr: string, at: string): Promise<void> {
  await client.query(
    `update fact_versions
     set valid = tstzrange(lower(valid), $3::timestamptz, '[)')
     where fact_id = $1 and attr = $2 and upper_inf(valid) and upper_inf(recorded)`,
    [factId, attr, at],
  );
}

/**
 * Contradiction-aware insert (core-audit #3: "make closeFact compare candidates, not just stamp
 * one row"; Graphiti's resolve_edge_contradictions, edge_operations.py:715-783; ai-memory's
 * advisory-only contradiction_lint.rs: "writes no supersession and deletes nothing"). Looks for an
 * existing LIVE row (recorded still open) for the same (org, fact_id, attr) whose valid range
 * overlaps f's and whose value differs. If found: closes that row's RECORDED range now (never its
 * value, never a DELETE), inserts f as a new row, and writes one contradiction_flags row for a
 * person to review. If no such row exists (or the value is identical -- idempotent re-insertion),
 * it is just a normal insertFact.
 */
export async function recordFact(
  client: Queryable,
  f: FactInput,
): Promise<{ invalidated: boolean; flagId: number | null }> {
  const candidates = await client.query(
    `select id, value from fact_versions
     where fact_id = $1 and attr = $2
       and upper_inf(recorded)
       and valid && tstzrange($3::timestamptz, $4::timestamptz, '[)')
     order by id desc`,
    [f.factId, f.attr, f.validFrom, f.validTo],
  );
  const conflicting = candidates.rows.find((r: { value: string }) => r.value !== f.value);
  if (!conflicting) {
    await insertFact(client, f);
    return { invalidated: false, flagId: null };
  }

  const now = new Date().toISOString();
  await client.query(
    `update fact_versions set recorded = tstzrange(lower(recorded), $2::timestamptz, '[)') where id = $1`,
    [conflicting.id, now],
  );
  await insertFact(client, f, now);
  const newRow = await client.query(
    `select id from fact_versions where fact_id = $1 and attr = $2 and value = $3 and upper_inf(recorded) order by id desc limit 1`,
    [f.factId, f.attr, f.value],
  );
  const newId = newRow.rows[0]?.id ?? null;
  const flag = await client.query(
    `insert into contradiction_flags (org_id, fact_id, attr, old_fact_version_id, new_fact_version_id, old_value, new_value)
     values ($1, $2, $3, $4, $5, $6, $7) returning id`,
    [f.orgId, f.factId, f.attr, conflicting.id, newId, conflicting.value, f.value],
  );
  return { invalidated: true, flagId: flag.rows[0]?.id ?? null };
}

export interface ContradictionFlag {
  id: number;
  factId: string;
  attr: string;
  oldFactVersionId: number;
  newFactVersionId: number;
  oldValue: string;
  newValue: string;
  detectedAt: string;
  resolved: boolean;
}

/** Durable, queryable list of open (or all) contradiction flags for a person to review -- no UI,
 *  per this task's non-goals, just a row that outlives the process that raised it. */
export async function listContradictionFlags(
  client: Queryable,
  opts: { factId?: string; onlyUnresolved?: boolean } = {},
): Promise<ContradictionFlag[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (opts.factId) {
    params.push(opts.factId);
    conditions.push(`fact_id = $${params.length}`);
  }
  if (opts.onlyUnresolved) {
    conditions.push('resolved = false');
  }
  const where = conditions.length > 0 ? `where ${conditions.join(' and ')}` : '';
  const r = await client.query(
    `select id, fact_id, attr, old_fact_version_id, new_fact_version_id, old_value, new_value, detected_at, resolved
     from contradiction_flags ${where} order by id`,
    params,
  );
  return r.rows.map((row: any) => ({
    id: row.id,
    factId: row.fact_id,
    attr: row.attr,
    oldFactVersionId: row.old_fact_version_id,
    newFactVersionId: row.new_fact_version_id,
    oldValue: row.old_value,
    newValue: row.new_value,
    detectedAt: row.detected_at,
    resolved: row.resolved,
  }));
}

/** What held for (factId, attr) at the given instant (application/valid time), among LIVE rows
 *  (recorded still open) -- the current belief, same contract as before T47. null = no fact yet. */
export async function asOf(client: Queryable, factId: string, attr: string, at: string): Promise<string | null> {
  const r = await client.query(
    `select value from fact_versions
     where fact_id = $1 and attr = $2 and valid @> $3::timestamptz and upper_inf(recorded)
     order by id desc limit 1`,
    [factId, attr, at],
  );
  return r.rows[0]?.value ?? null;
}

/**
 * What did we believe (factId, attr) held at `validAt` (application time), as recorded/known at
 * `recordedAt` (system time) -- the second bitemporal axis (core-audit #2: "schema.sql already has
 * recorded and writes it; asOf/diff/decisionToCode never read it"; XTDB's as-of-system-time vs.
 * the default as-best-known, docs.xtdb.com/about/time-in-xtdb). null = nothing was known yet.
 */
export async function knownAt(
  client: Queryable,
  factId: string,
  attr: string,
  validAt: string,
  recordedAt: string,
): Promise<string | null> {
  const r = await client.query(
    `select value from fact_versions
     where fact_id = $1 and attr = $2
       and valid @> $3::timestamptz
       and recorded @> $4::timestamptz
     order by id desc limit 1`,
    [factId, attr, validAt, recordedAt],
  );
  return r.rows[0]?.value ?? null;
}

/** What (factId, attr) held at t1 vs t2 (both application/valid time, current belief). */
export async function diff(
  client: Queryable,
  factId: string,
  attr: string,
  t1: string,
  t2: string,
): Promise<{ from: string | null; to: string | null }> {
  const [from, to] = await Promise.all([asOf(client, factId, attr, t1), asOf(client, factId, attr, t2)]);
  return { from, to };
}

/**
 * decision -> scope -> code: recursive CTE over edge_versions (traces_to/supersedes/...), as-of a
 * point in time (default: now). Returns every id reachable from `rootId` following edges valid at
 * `at`, with the hop depth.
 */
export async function decisionToCode(
  client: Queryable,
  rootId: string,
  at: string = new Date().toISOString(),
  maxDepth = 8,
): Promise<Array<{ id: string; depth: number; edgeType: string }>> {
  const r = await client.query(
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
