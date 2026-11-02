// T47 second-review fix: recordFact must handle a retroactive change whose valid range overlaps
// MORE THAN ONE still-live version at once (standard SQL:2011 `UPDATE ... FOR PORTION OF`
// semantics / XTDB's multi-version `put`, docs.xtdb.com/about/time-in-xtdb). Before this fix
// recordFact picked exactly one conflicting row via `.find()`; a second overlapping live row
// stayed live and the final insert hit fact_versions_no_overlap (EXCLUDE USING gist) with a raw
// 23P01 escaping -- nothing written, no flag raised. See src/index.ts recordFact's doc comment.
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  applySchema,
  asOf,
  insertFact,
  knownAt,
  listContradictionFlags,
  openPool,
  recordFact,
  withOrgTx,
  type FactInput,
} from '../src/index.js';

const dbName = `mole_t47_multiversion_test_${process.pid}`;
const adminUrl = process.env.MOLE_T38_TEST_PG ?? 'postgres://localhost/postgres';

async function withAdmin<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const c = new Client({ connectionString: adminUrl });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

let pool: ReturnType<typeof openPool>;
const org = 'org-multiversion';

beforeAll(async () => {
  await withAdmin(async (c) => {
    await c.query(`DROP DATABASE IF EXISTS ${dbName}`);
    await c.query(`CREATE DATABASE ${dbName}`);
  });
  pool = openPool(adminUrl.replace(/\/[^/]*$/, `/${dbName}`));
  await applySchema(pool);
}, 30_000);

afterAll(async () => {
  await pool.end();
  await withAdmin(async (c) => {
    await c.query(`DROP DATABASE IF EXISTS ${dbName}`);
  });
});

async function liveRows(factId: string) {
  return withOrgTx(pool, org, async (client) => {
    const r = await client.query(
      'select value, lower(valid) as valid_from, upper(valid) as valid_to from fact_versions where fact_id = $1 and upper_inf(recorded) order by valid_from',
      [factId],
    );
    return r.rows as Array<{ value: string; valid_from: string; valid_to: string | null }>;
  });
}

describe('recordFact: retroactive change spanning multiple live versions (SQL:2011 FOR PORTION OF)', () => {
  it('spans exactly 2 live versions: closes both, re-inserts the one real leftover, flags only the correction', async () => {
    const id = `D-span2-${randomUUID()}`;
    const base: FactInput = { orgId: org, factId: id, kind: 'decision', attr: 'status', value: 'OPEN', validFrom: '2026-01-01T00:00:00Z', validTo: null };
    await withOrgTx(pool, org, (client) => insertFact(client, base));
    // Forward world change: now OPEN [Jan1,Mar1) and DECIDED [Mar1,inf) are both live.
    await withOrgTx(pool, org, (client) => recordFact(client, { ...base, value: 'DECIDED', validFrom: '2026-03-01T00:00:00Z' }));
    expect(await liveRows(id)).toHaveLength(2);
    const recordedBeforeCorrection = new Date().toISOString();
    await new Promise((resolve) => setTimeout(resolve, 25));

    // Retroactive: REJECTED actually started Feb1 (inside OPEN's window) with no end -- overlaps
    // BOTH live rows at once.
    const result = await withOrgTx(pool, org, (client) =>
      recordFact(client, { ...base, value: 'REJECTED', validFrom: '2026-02-01T00:00:00Z', validTo: null }),
    );
    expect(result.invalidated).toBe(true);
    expect(result.flagId).not.toBeNull();

    // asOf: before the retroactive window untouched, inside/after now REJECTED.
    expect(await withOrgTx(pool, org, (client) => asOf(client, id, 'status', '2026-01-15T00:00:00Z'))).toBe('OPEN');
    expect(await withOrgTx(pool, org, (client) => asOf(client, id, 'status', '2026-02-15T00:00:00Z'))).toBe('REJECTED');
    expect(await withOrgTx(pool, org, (client) => asOf(client, id, 'status', '2026-04-01T00:00:00Z'))).toBe('REJECTED');

    // Exactly one flag: the DECIDED row (same-or-earlier validFrom than f -> correction). The
    // OPEN row is a pure forward trim (f starts strictly after OPEN's own validFrom, and leaves
    // no leftover-after reverting back to OPEN) -> no flag for it.
    const flags = await withOrgTx(pool, org, (client) => listContradictionFlags(client, { factId: id }));
    expect(flags).toHaveLength(1);
    expect(flags[0]!.oldValue).toBe('DECIDED');
    expect(flags[0]!.newValue).toBe('REJECTED');

    // Final live rows: OPEN's leftover-before [Jan1,Feb1) + REJECTED [Feb1,inf). DECIDED is fully
    // consumed, no leftover.
    const rows = await liveRows(id);
    expect(rows.map((r) => r.value)).toEqual(['OPEN', 'REJECTED']);

    // knownAt: before this call we believed DECIDED held at Apr1; after, REJECTED.
    expect(await withOrgTx(pool, org, (client) => knownAt(client, id, 'status', '2026-04-01T00:00:00Z', recordedBeforeCorrection))).toBe('DECIDED');
    expect(await withOrgTx(pool, org, (client) => knownAt(client, id, 'status', '2026-04-01T00:00:00Z', new Date().toISOString()))).toBe('REJECTED');
  });

  it('spans exactly 3 live versions: closes all three, flags the two true corrections, no flag on the forward trim', async () => {
    const id = `D-span3-${randomUUID()}`;
    const base: FactInput = { orgId: org, factId: id, kind: 'decision', attr: 'status', value: 'A', validFrom: '2026-01-01T00:00:00Z', validTo: null };
    await withOrgTx(pool, org, (client) => insertFact(client, base));
    await withOrgTx(pool, org, (client) => recordFact(client, { ...base, value: 'B', validFrom: '2026-02-01T00:00:00Z' }));
    await withOrgTx(pool, org, (client) => recordFact(client, { ...base, value: 'C', validFrom: '2026-03-01T00:00:00Z' }));
    // Now live: A [Jan1,Feb1), B [Feb1,Mar1), C [Mar1,inf).
    expect(await liveRows(id)).toHaveLength(3);

    const result = await withOrgTx(pool, org, (client) =>
      recordFact(client, { ...base, value: 'D', validFrom: '2026-01-15T00:00:00Z', validTo: null }),
    );
    expect(result.invalidated).toBe(true);

    const flags = await withOrgTx(pool, org, (client) => listContradictionFlags(client, { factId: id }));
    expect(flags).toHaveLength(2); // B and C are corrections; A is a pure forward trim
    expect(flags.map((f) => f.oldValue).sort()).toEqual(['B', 'C']);
    flags.forEach((f) => expect(f.newValue).toBe('D'));

    expect(await withOrgTx(pool, org, (client) => asOf(client, id, 'status', '2026-01-10T00:00:00Z'))).toBe('A');
    expect(await withOrgTx(pool, org, (client) => asOf(client, id, 'status', '2026-01-20T00:00:00Z'))).toBe('D');
    expect(await withOrgTx(pool, org, (client) => asOf(client, id, 'status', '2026-02-15T00:00:00Z'))).toBe('D');
    expect(await withOrgTx(pool, org, (client) => asOf(client, id, 'status', '2026-04-01T00:00:00Z'))).toBe('D');

    const rows = await liveRows(id);
    expect(rows.map((r) => r.value)).toEqual(['A', 'D']); // A leftover-before + D; B, C fully consumed
  });

  it('new range strictly inside one version: splits it into 3 pieces (before/new/after), flagged as a correction', async () => {
    const id = `D-split3-${randomUUID()}`;
    const base: FactInput = { orgId: org, factId: id, kind: 'incident', attr: 'severity', value: 'LOW', validFrom: '2026-01-01T00:00:00Z', validTo: '2026-12-01T00:00:00Z' };
    await withOrgTx(pool, org, (client) => insertFact(client, base));
    expect(await liveRows(id)).toHaveLength(1);

    const result = await withOrgTx(pool, org, (client) =>
      recordFact(client, { ...base, value: 'HIGH', validFrom: '2026-03-01T00:00:00Z', validTo: '2026-06-01T00:00:00Z' }),
    );
    // Reverts back to LOW after Jun1 -- not a pure forward change, must be flagged.
    expect(result.invalidated).toBe(true);
    expect(result.flagId).not.toBeNull();

    const flags = await withOrgTx(pool, org, (client) => listContradictionFlags(client, { factId: id }));
    expect(flags).toHaveLength(1);
    expect(flags[0]!.oldValue).toBe('LOW');
    expect(flags[0]!.newValue).toBe('HIGH');

    expect(await withOrgTx(pool, org, (client) => asOf(client, id, 'severity', '2026-02-01T00:00:00Z'))).toBe('LOW');
    expect(await withOrgTx(pool, org, (client) => asOf(client, id, 'severity', '2026-04-01T00:00:00Z'))).toBe('HIGH');
    expect(await withOrgTx(pool, org, (client) => asOf(client, id, 'severity', '2026-08-01T00:00:00Z'))).toBe('LOW');
    expect(await withOrgTx(pool, org, (client) => asOf(client, id, 'severity', '2027-01-01T00:00:00Z'))).toBe(null);

    const rows = await liveRows(id);
    expect(rows.map((r) => r.value)).toEqual(['LOW', 'HIGH', 'LOW']);
  });

  it('equal-value re-assert is still idempotent (no-op) even after the multi-version rewrite', async () => {
    const id = `D-eq-${randomUUID()}`;
    const f: FactInput = { orgId: org, factId: id, kind: 'decision', attr: 'status', value: 'OPEN', validFrom: '2026-01-01T00:00:00Z', validTo: null };
    await withOrgTx(pool, org, (client) => insertFact(client, f));
    const result = await withOrgTx(pool, org, (client) => recordFact(client, f));
    expect(result.invalidated).toBe(false);
    expect(result.flagId).toBeNull();
    expect(await liveRows(id)).toHaveLength(1);
    const flags = await withOrgTx(pool, org, (client) => listContradictionFlags(client, { factId: id }));
    expect(flags).toHaveLength(0);
  });
});
