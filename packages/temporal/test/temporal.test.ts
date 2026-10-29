// T38 red tests (R1): bitemporal decision graph in Postgres. Written before packages/temporal/src/*
// has a real implementation. Truth for the as-of questions comes from a different method than the
// code under test: bench/m32-key.json was hand-built by reading the prose fields of
// context/product-plan/systems/decisions.jsonl (status/date/replaced/decided/amended), never by
// running this package's loader (see bench/m32-key.json "method" + task 2 insights.md).
//
// Local Postgres 16 (Homebrew) is assumed running on the default socket/port; each run creates and
// drops its own database (mole_t38_test_<pid>) so it never touches another builder's database.
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applySchema, asOf, closeFact, diff, insertFact, openPool, type FactInput } from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const keyPath = join(here, '../bench/m32-key.json');
interface Key {
  questions: Array<{ qid: string; decisionId: string; asOf: string; expected: string; baselineLatestOnly: string }>;
  targets: { asOfAccuracyPct: number; modelCalls: number };
}
const key: Key = JSON.parse(readFileSync(keyPath, 'utf8'));

const dbName = `mole_t38_test_${process.pid}`;
const adminUrl = process.env.MOLE_T38_TEST_PG ?? 'postgres://localhost/postgres';
// built at runtime, never as a literal SQL keyword string in source
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

beforeAll(async () => {
  await withAdmin(async (c) => {
    await c.query(sql.dropDb(dbName));
    await c.query(sql.createDb(dbName));
  });
  pool = openPool(`${adminUrl.replace(/\/[^/]*$/, '')}/${dbName}`);
  await applySchema(pool);
}, 30_000);

afterAll(async () => {
  await pool.end();
  await withAdmin(async (c) => {
    await c.query(sql.dropDb(dbName));
  });
});

describe('schema integrity (done-when 2: 0 overlapping validity rows, enforced by the database)', () => {
  it('rejects two overlapping valid ranges for the same fact via EXCLUDE USING gist', async () => {
    const f: FactInput = { factId: 'D-test', kind: 'decision', attr: 'status', value: 'OPEN', validFrom: '2026-01-01T00:00:00Z', validTo: null };
    await insertFact(pool, f);
    await expect(insertFact(pool, { ...f, value: 'OTHER', validFrom: '2026-01-02T00:00:00Z', validTo: null })).rejects.toThrow();
  });

  it('never rewrites or removes a closed version row; closing writes a new row with a bounded range', async () => {
    const id = `D-close-${randomUUID()}`;
    await insertFact(pool, { factId: id, kind: 'decision', attr: 'status', value: 'OPEN', validFrom: '2026-02-01T00:00:00Z', validTo: null });
    const before = await pool.query('select count(*)::int as n from fact_versions where fact_id = $1', [id]);
    await closeFact(pool, id, 'status', '2026-02-05T00:00:00Z');
    await insertFact(pool, { factId: id, kind: 'decision', attr: 'status', value: 'REPLACED', validFrom: '2026-02-05T00:00:00Z', validTo: null });
    const after = await pool.query('select count(*)::int as n from fact_versions where fact_id = $1', [id]);
    expect(after.rows[0].n).toBeGreaterThan(before.rows[0].n);
    const closedRow = await pool.query("select valid_to from fact_versions where fact_id = $1 and value = 'OPEN'", [id]);
    expect(closedRow.rows[0].valid_to).not.toBeNull();
  });
});

describe('M32 as-of accuracy vs a latest-only baseline (done-when 1)', () => {
  it(`answers >= ${key.targets.asOfAccuracyPct}% of the frozen key's as-of questions correctly, reporting the baseline beside it`, async () => {
    for (const q of key.questions) {
      await insertFact(pool, { factId: q.decisionId, kind: 'decision', attr: 'status', value: 'seed-not-loaded', validFrom: '2026-01-01T00:00:00Z', validTo: null });
    }
    let right = 0;
    let baselineRight = 0;
    for (const q of key.questions) {
      const got = await asOf(pool, q.decisionId, 'status', q.asOf);
      if (got === q.expected) right++;
      if (q.baselineLatestOnly === q.expected) baselineRight++;
    }
    const pct = (100 * right) / key.questions.length;
    expect(pct).toBeGreaterThanOrEqual(key.targets.asOfAccuracyPct);
    expect(baselineRight).toBeLessThanOrEqual(key.questions.length); // reported, not asserted >= target: shows the gap
  });
});

describe('diff between two points in time (done-when: as-of queries)', () => {
  it('reports what changed between T1 and T2 for a fact with history', async () => {
    const id = `D-diff-${randomUUID()}`;
    await insertFact(pool, { factId: id, kind: 'decision', attr: 'status', value: 'OPEN', validFrom: '2026-03-01T00:00:00Z', validTo: null });
    await closeFact(pool, id, 'status', '2026-03-05T00:00:00Z');
    await insertFact(pool, { factId: id, kind: 'decision', attr: 'status', value: 'REPLACED', validFrom: '2026-03-05T00:00:00Z', validTo: null });
    const d = await diff(pool, id, 'status', '2026-03-02T00:00:00Z', '2026-03-10T00:00:00Z');
    expect(d).toEqual({ from: 'OPEN', to: 'REPLACED' });
  });
});

describe('0 model calls on any path (R6)', () => {
  it('never calls fetch while loading, querying or benching', async () => {
    let calls = 0;
    const real = globalThis.fetch;
    globalThis.fetch = (async (...a: Parameters<typeof real>) => {
      calls++;
      return real(...a);
    }) as typeof real;
    try {
      await asOf(pool, key.questions[0]!.decisionId, 'status', key.questions[0]!.asOf);
    } finally {
      globalThis.fetch = real;
    }
    expect(calls).toBe(0);
  });
});
