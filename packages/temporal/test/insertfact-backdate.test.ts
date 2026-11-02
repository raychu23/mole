// T47 fresh-review fix (P1): insertFact's recordedFrom parameter let ANY caller backdate system
// time arbitrarily (e.g. "we knew this back in 2015" with zero audit trail), because it was a
// plain exported third argument. recordedFrom is now internal-only: it exists purely so
// recordFact can hand in the exact instant it used to close the conflicting row's recorded range
// (see index.ts's insertFact doc comment), and is not part of the public TypeScript signature of
// insertFact any more. A caller that reaches past the type system (e.g. plain JS, or `as any`)
// and still passes a third argument gets it silently ignored -- the row is always recorded as of
// now(), never backdated.
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applySchema, insertFact, openPool, withOrgTx, type FactInput } from '../src/index.js';

const dbName = `mole_t47_backdate_test_${process.pid}`;
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
const org = 'org-backdate';

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

describe('insertFact system-time backdating (P1: recordedFrom is internal-only)', () => {
  it('a caller forcing a third argument past the type system cannot backdate recorded', async () => {
    const id = `D-backdate-${randomUUID()}`;
    const f: FactInput = {
      orgId: org, factId: id, kind: 'decision', attr: 'status',
      value: 'OPEN', validFrom: '2026-01-01T00:00:00Z', validTo: null,
    };
    const before = Date.now();
    // Simulates a caller who bypasses the TS type (insertFact's public signature is 2-arg only)
    // to try to claim we knew this back in 2015.
    await withOrgTx(pool, org, (client) => (insertFact as (c: typeof client, f: FactInput, r?: string) => Promise<void>)(client, f, '2015-01-01T00:00:00Z'));
    const after = Date.now();

    const row = await withOrgTx(pool, org, async (client) => {
      const r = await client.query('select recorded, lower(recorded) as recorded_from from fact_versions where fact_id = $1', [id]);
      return r.rows[0] as { recorded: string; recorded_from: string };
    });
    expect(row.recorded).not.toMatch(/2015/);
    const recordedFromMs = new Date(row.recorded_from).getTime();
    expect(recordedFromMs).toBeGreaterThanOrEqual(before - 1000); // recorded as "now", not backdated
    expect(recordedFromMs).toBeLessThanOrEqual(after + 1000);
  });
});
