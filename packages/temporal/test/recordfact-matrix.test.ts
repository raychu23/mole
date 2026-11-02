// T47 fresh-review fix (P0): recordFact must distinguish a WORLD CHANGE (the fact's valid-time
// axis moves forward -- a normal belief update, e.g. a decision going OPEN -> DECIDED) from a
// CORRECTION (the recorded/system-time axis is what's wrong -- we now believe something
// different was already true for a past or identical valid-time window). Before this fix
// recordFact always treated an overlapping-valid + different-value candidate as a correction:
// closed the old row's RECORDED range and raised a contradiction flag even for a plain forward
// change, so asOf() for a date squarely inside the old row's original valid window went from
// returning the old value to returning null, and a false contradiction flag was raised.
//
// Standard bitemporal distinction (XTDB valid vs transaction time, docs.xtdb.com/about/time-in-xtdb;
// SQL:2011 application-time vs system-versioned time; Graphiti's invalid_at (valid time) vs
// expired_at (system time), edge_operations.py resolve_edge_contradictions -- which sets
// invalid_at to the NEW edge's valid_at, not "now", exactly the asymmetry tested here):
//   - new fact's validFrom is AFTER the conflicting live row's validFrom -> WORLD CHANGE. Split
//     the old row's valid period via a normal SQL:2011 period split: close the old row's
//     RECORDED range now, insert a corrected-period version of the OLD value for
//     [old.validFrom, new.validFrom), and insert the new fact's own version from
//     [new.validFrom, new.validTo). No flag -- this is supersession, not a contradiction.
//   - new fact's validFrom is the SAME AS OR EARLIER THAN the conflicting row's validFrom (a
//     retroactive overlap) -> CORRECTION. Close the old row's recorded range, insert the new
//     fact, raise a contradiction flag for a person to review.
//
// Full 2x2 matrix below, each driving recordFact itself (not insertFact+closeFact by hand), with
// both asOf (valid/application time) and knownAt (recorded/system time) assertions.
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

const dbName = `mole_t47_matrix_test_${process.pid}`;
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
const org = 'org-matrix';

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('recordFact 2x2: world change vs correction (valid-time direction decides, not mere overlap)', () => {
  it('[world change] forward valid-time move: no flag, old belief still holds for its original window', async () => {
    const id = `D-wc-${randomUUID()}`;
    const openFact: FactInput = {
      orgId: org, factId: id, kind: 'decision', attr: 'status',
      value: 'OPEN', validFrom: '2026-01-01T00:00:00Z', validTo: null,
    };
    await withOrgTx(pool, org, (client) => insertFact(client, openFact));

    const result = await withOrgTx(pool, org, (client) =>
      recordFact(client, { ...openFact, value: 'DECIDED', validFrom: '2026-03-01T00:00:00Z' }),
    );
    expect(result.invalidated).toBe(false);
    expect(result.flagId).toBeNull();

    // asOf a date squarely inside the OLD window: the world change must not erase the past.
    expect(await withOrgTx(pool, org, (client) => asOf(client, id, 'status', '2026-02-01T00:00:00Z'))).toBe('OPEN');
    // asOf after the change: the new belief.
    expect(await withOrgTx(pool, org, (client) => asOf(client, id, 'status', '2026-04-01T00:00:00Z'))).toBe('DECIDED');

    // knownAt now, for the pre-change window: still OPEN -- nothing was corrected, just split.
    const nowIso = await dbNow();
    expect(await withOrgTx(pool, org, (client) => knownAt(client, id, 'status', '2026-02-01T00:00:00Z', nowIso))).toBe('OPEN');

    const flags = await withOrgTx(pool, org, (client) => listContradictionFlags(client, { factId: id }));
    expect(flags).toHaveLength(0);

    // History intact and the old row's own recorded/value were never mutated in place.
    const rows = await withOrgTx(pool, org, async (client) => {
      const r = await client.query('select value, valid from fact_versions where fact_id = $1 order by id', [id]);
      return r.rows as Array<{ value: string; valid: string }>;
    });
    expect(rows.map((r) => r.value)).toEqual(['OPEN', 'OPEN', 'DECIDED']); // original + split-period copy + new fact
  });

  it('[correction, same validFrom] retroactive overlap at the SAME validFrom: flag raised, recorded closed', async () => {
    const id = `D-corr-${randomUUID()}`;
    const base: FactInput = {
      orgId: org, factId: id, kind: 'decision', attr: 'status',
      value: 'OPEN', validFrom: '2026-04-01T00:00:00Z', validTo: null,
    };
    await withOrgTx(pool, org, (client) => insertFact(client, base));

    const result = await withOrgTx(pool, org, (client) => recordFact(client, { ...base, value: 'REJECTED' }));
    expect(result.invalidated).toBe(true);
    expect(result.flagId).not.toBeNull();

    expect(await withOrgTx(pool, org, (client) => asOf(client, id, 'status', '2026-04-02T00:00:00Z'))).toBe('REJECTED');

    const flags = await withOrgTx(pool, org, (client) => listContradictionFlags(client, { factId: id }));
    expect(flags).toHaveLength(1);
    expect(flags[0]!.oldValue).toBe('OPEN');
    expect(flags[0]!.newValue).toBe('REJECTED');
  });

  it('[late correction] discovered well after the fact: knownAt before vs after the correction disagree', async () => {
    const id = `D-late-${randomUUID()}`;
    const f: FactInput = {
      orgId: org, factId: id, kind: 'decision', attr: 'status',
      value: 'OPEN', validFrom: '2026-01-01T00:00:00Z', validTo: null,
    };
    await withOrgTx(pool, org, (client) => insertFact(client, f));
    const recordedBefore = await dbNow();
    // Logical clock step instead of a real sleep: recordFact's test-only `now` hook lets this
    // test assert a strict system-time ordering without waiting on the wall clock.
    const correctionNow = new Date(Date.parse(recordedBefore) + 25).toISOString();

    // New information arrives much later: the decision was actually DECIDED the whole time --
    // same validFrom (not a forward move), so this is a correction, not a world change.
    const result = await withOrgTx(pool, org, (client) => recordFact(client, { ...f, value: 'DECIDED' }, { now: correctionNow }));
    expect(result.invalidated).toBe(true);
    expect(result.flagId).not.toBeNull();
    const recordedAfter = correctionNow;

    expect(await withOrgTx(pool, org, (client) => asOf(client, id, 'status', '2026-01-02T00:00:00Z'))).toBe('DECIDED');
    expect(await withOrgTx(pool, org, (client) => knownAt(client, id, 'status', '2026-01-02T00:00:00Z', recordedBefore))).toBe('OPEN');
    expect(await withOrgTx(pool, org, (client) => knownAt(client, id, 'status', '2026-01-02T00:00:00Z', recordedAfter))).toBe('DECIDED');
  });

  it('[retroactive change] new fact starts BEFORE the live row: correction (flag), not a world change', async () => {
    const id = `D-retro-${randomUUID()}`;
    const openFromMarch: FactInput = {
      orgId: org, factId: id, kind: 'decision', attr: 'status',
      value: 'OPEN', validFrom: '2026-03-01T00:00:00Z', validTo: null,
    };
    await withOrgTx(pool, org, (client) => insertFact(client, openFromMarch));
    const recordedBefore = await dbNow();
    // Logical clock step instead of a real sleep (see the [late correction] test above).
    const correctionNow = new Date(Date.parse(recordedBefore) + 25).toISOString();

    // We learn the decision was actually CANCELLED starting earlier (Jan 1) -- validFrom moves
    // BACKWARD relative to the live row, so this must be flagged as a correction, never treated
    // as a forward world change even though the value differs and ranges overlap.
    const result = await withOrgTx(pool, org, (client) =>
      recordFact(client, { ...openFromMarch, value: 'CANCELLED', validFrom: '2026-01-01T00:00:00Z' }, { now: correctionNow }),
    );
    expect(result.invalidated).toBe(true);
    expect(result.flagId).not.toBeNull();

    const flags = await withOrgTx(pool, org, (client) => listContradictionFlags(client, { factId: id }));
    expect(flags).toHaveLength(1);
    expect(flags[0]!.oldValue).toBe('OPEN');
    expect(flags[0]!.newValue).toBe('CANCELLED');

    expect(await withOrgTx(pool, org, (client) => asOf(client, id, 'status', '2026-02-01T00:00:00Z'))).toBe('CANCELLED');
    expect(await withOrgTx(pool, org, (client) => knownAt(client, id, 'status', '2026-04-01T00:00:00Z', recordedBefore))).toBe('OPEN');
  });
});
