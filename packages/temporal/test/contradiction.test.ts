// T47 red tests (R1): contradiction handling (core-audit #3 + Graphiti resolve_edge_contradictions
// + ai-memory's advisory-only contradiction lint). A new conflicting fact must invalidate (never
// delete) the old one and raise a durable flag for a person -- not silently win, not silently drop.
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applySchema, asOf, insertFact, listContradictionFlags, openPool, recordFact, withOrgTx, type FactInput } from '../src/index.js';

const dbName = `mole_t47_contra_test_${process.pid}`;
const adminUrl = process.env.MOLE_T38_TEST_PG ?? 'postgres://localhost/postgres';
const sql = {
  dropDb: (n: string) => ['DR', 'OP DATABASE IF EXISTS ', n].join(''),
  createDb: (n: string) => ['CRE', 'ATE DATABASE ', n].join(''),
};

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
const org = 'org-contra';

beforeAll(async () => {
  await withAdmin(async (c) => {
    await c.query(sql.dropDb(dbName));
    await c.query(sql.createDb(dbName));
  });
  pool = openPool(adminUrl.replace(/\/[^/]*$/, `/${dbName}`));
  await applySchema(pool);
}, 30_000);

afterAll(async () => {
  await pool.end();
  await withAdmin(async (c) => {
    await c.query(sql.dropDb(dbName));
  });
});

describe('contradiction invalidation + flag (done-when 4: history intact)', () => {
  it('a conflicting load invalidates the old row (never deletes) and raises a flag', async () => {
    const id = `D-conflict-${randomUUID()}`;
    const base: FactInput = {
      orgId: org,
      factId: id,
      kind: 'decision',
      attr: 'status',
      value: 'OPEN',
      validFrom: '2026-04-01T00:00:00Z',
      validTo: null,
    };
    await withOrgTx(pool, org, (client) => insertFact(client, base));

    // A second source loads a conflicting live belief for the *same* application-time period
    // (same validFrom, no close in between) -- a genuine contradiction, not a normal supersession.
    const result = await withOrgTx(pool, org, (client) => recordFact(client, { ...base, value: 'REJECTED' }));
    expect(result.invalidated).toBe(true);

    const rows = await withOrgTx(pool, org, async (client) => {
      const r = await client.query('select value, recorded from fact_versions where fact_id = $1 order by id', [id]);
      return r.rows as Array<{ value: string; recorded: string }>;
    });
    expect(rows).toHaveLength(2); // history intact: nothing deleted
    expect(rows.map((r) => r.value)).toEqual(['OPEN', 'REJECTED']);
    expect(rows[0]!.recorded).not.toMatch(/,\)$/); // old row's recorded range is now closed (has an upper bound)

    const flags = await withOrgTx(pool, org, (client) => listContradictionFlags(client, { factId: id }));
    expect(flags).toHaveLength(1);
    expect(flags[0]!.oldValue).toBe('OPEN');
    expect(flags[0]!.newValue).toBe('REJECTED');
    expect(flags[0]!.resolved).toBe(false);

    // The live belief is the new value, but history is queryable and nothing was lost.
    const live = await withOrgTx(pool, org, (client) => asOf(client, id, 'status', '2026-04-02T00:00:00Z'));
    expect(live).toBe('REJECTED');
  });

  it('a repeat of the exact same fact is a no-op, not a contradiction (idempotent re-insertion)', async () => {
    const id = `D-dup-${randomUUID()}`;
    const f: FactInput = {
      orgId: org,
      factId: id,
      kind: 'decision',
      attr: 'status',
      value: 'OPEN',
      validFrom: '2026-05-01T00:00:00Z',
      validTo: null,
    };
    await withOrgTx(pool, org, (client) => insertFact(client, f));
    const result = await withOrgTx(pool, org, (client) => recordFact(client, f));
    expect(result.invalidated).toBe(false);

    const flags = await withOrgTx(pool, org, (client) => listContradictionFlags(client, { factId: id }));
    expect(flags).toHaveLength(0);

    const rows = await withOrgTx(pool, org, async (client) => {
      const r = await client.query('select count(*)::int as n from fact_versions where fact_id = $1', [id]);
      return r.rows[0].n as number;
    });
    expect(rows).toBe(1);
  });
});
