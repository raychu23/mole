// T47 red tests (R1): a knownAt (recorded/system-time) query alongside the existing asOf
// (valid/application-time) query -- the audit's gap #2 ("schema.sql already has recorded and
// writes it; asOf/diff/decisionToCode never read it"). The 2x2 matrix from the done-when: asOf
// (valid) x knownAt (recorded), including a late correction where the two axes disagree.
//
// Borrows XTDB's distinction (docs.xtdb.com/about/time-in-xtdb): "as of system-time" vs. the
// default "as best known" -- knownAt here is the former, asOf alone remains the latter.
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applySchema, asOf, closeFact, insertFact, knownAt, openPool, recordFact, withOrgTx, type FactInput } from '../src/index.js';

const dbName = `mole_t47_bitemp_test_${process.pid}`;
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
const org = 'org-bitemp';

/** System-time reads in tests come from the DB clock, like recordFact's own default: a Node clock that lags
 *  Postgres made knownAt(recordedBefore) look before the row existed (flaky under load, T47/T50 merge check). */
async function dbNow(): Promise<string> {
  return withOrgTx(pool, org, async (c) =>
    ((await c.query(`SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS t`)).rows[0] as { t: string }).t,
  );
}

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

describe('knownAt (recorded/system time) vs asOf (valid/application time) -- 2x2 incl. a late correction', () => {
  it('a late correction changes what knownAt(recordedAt=now) returns without changing what was known back then', async () => {
    const id = `D-late-${randomUUID()}`;
    const f: FactInput = {
      orgId: org,
      factId: id,
      kind: 'decision',
      attr: 'status',
      value: 'OPEN',
      validFrom: '2026-01-01T00:00:00Z',
      validTo: null,
    };
    // Day 1: we record (system time) that the decision was OPEN starting Jan 1 (application time).
    await withOrgTx(pool, org, (client) => insertFact(client, f));
    const recordedDay1 = await dbNow();

    // Day 5: new information arrives -- the decision was actually DECIDED the whole time (a late
    // correction of a *past* belief, not a new event). recordFact must invalidate the old row
    // (never delete it) and the correction is recorded now, not backdated.
    await withOrgTx(pool, org, (client) =>
      recordFact(client, { ...f, value: 'DECIDED' }),
    );
    const recordedDay5 = await dbNow();

    // asOf(valid): what we currently believe held on Jan 1 -- the corrected value.
    const currentBelief = await withOrgTx(pool, org, (client) => asOf(client, id, 'status', '2026-01-02T00:00:00Z'));
    expect(currentBelief).toBe('DECIDED');

    // knownAt(valid=Jan 2, recordedAt=day 1): what we believed on day 1, before the correction.
    const believedOnDay1 = await withOrgTx(pool, org, (client) =>
      knownAt(client, id, 'status', '2026-01-02T00:00:00Z', recordedDay1),
    );
    expect(believedOnDay1).toBe('OPEN');

    // knownAt(valid=Jan 2, recordedAt=day 5): after the correction landed.
    const believedOnDay5 = await withOrgTx(pool, org, (client) =>
      knownAt(client, id, 'status', '2026-01-02T00:00:00Z', recordedDay5),
    );
    expect(believedOnDay5).toBe('DECIDED');

    // History intact: the OPEN row still exists, just no longer the live belief.
    const historyRows = await withOrgTx(pool, org, async (client) => {
      const r = await client.query('select value from fact_versions where fact_id = $1 order by id', [id]);
      return r.rows.map((row: { value: string }) => row.value);
    });
    expect(historyRows).toContain('OPEN');
    expect(historyRows).toContain('DECIDED');
  });

  it('asOf still answers plain application-time questions once a fact is closed normally', async () => {
    const id = `D-asof-${randomUUID()}`;
    await withOrgTx(pool, org, (client) =>
      insertFact(client, {
        orgId: org,
        factId: id,
        kind: 'decision',
        attr: 'status',
        value: 'OPEN',
        validFrom: '2026-03-01T00:00:00Z',
        validTo: null,
      }),
    );
    await withOrgTx(pool, org, (client) => closeFact(client, id, 'status', '2026-03-05T00:00:00Z'));
    await withOrgTx(pool, org, (client) =>
      insertFact(client, {
        orgId: org,
        factId: id,
        kind: 'decision',
        attr: 'status',
        value: 'REPLACED',
        validFrom: '2026-03-05T00:00:00Z',
        validTo: null,
      }),
    );
    const before = await withOrgTx(pool, org, (client) => asOf(client, id, 'status', '2026-03-02T00:00:00Z'));
    const after = await withOrgTx(pool, org, (client) => asOf(client, id, 'status', '2026-03-10T00:00:00Z'));
    expect(before).toBe('OPEN');
    expect(after).toBe('REPLACED');
  });
});
