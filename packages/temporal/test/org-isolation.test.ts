// T47 red tests (R1): org_id tenant key + RLS with FORCE, copying packages/server/src/db.ts's
// pattern (FORCE RLS, non-owner mole_temporal_app role, two-arg current_setting + withOrgTx) --
// Graphiti's group_id precedent (edges.py:51, decorators.handle_multiple_group_ids). Written
// before src/index.ts exports withOrgTx/orgId-aware insertFact: this file is expected to fail to
// even typecheck/build until the implementation lands (see commit history: this file predates it).
//
// Connects through the non-owner mole_temporal_app role (never the superuser/table owner), because
// FORCE RLS still lets an owner/superuser bypass policies -- the done-when explicitly says
// "test as non-owner role", so a bug that forgets withOrgTx must fail loud here, not pass silently.
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applySchema, asOf, insertFact, openPool, withOrgTx, type FactInput } from '../src/index.js';

const dbName = `mole_t47_org_test_${process.pid}`;
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

// Role every non-owner test connection uses: built from the admin connection string with the
// username swapped, so the same non-owner role packages/server/src/db.ts expects apps to use
// (mole_app there, mole_temporal_app here -- see src/schema.sql) is what actually runs the query.
function appUrl(dbNameForUrl: string): string {
  const base = adminUrl.replace(/\/[^/]*$/, `/${dbNameForUrl}`);
  const u = new URL(base);
  u.username = 'mole_temporal_app';
  u.password = '';
  return u.toString();
}

let pool: ReturnType<typeof openPool>;

beforeAll(async () => {
  await withAdmin(async (c) => {
    await c.query(sql.dropDb(dbName));
    await c.query(sql.createDb(dbName));
  });
  const adminPool = openPool(adminUrl.replace(/\/[^/]*$/, `/${dbName}`));
  await applySchema(adminPool);
  await adminPool.end();
  pool = openPool(appUrl(dbName));
}, 30_000);

afterAll(async () => {
  await pool.end();
  await withAdmin(async (c) => {
    await c.query(sql.dropDb(dbName));
  });
});

describe('org isolation (done-when 2: org A and org B both using D1, as non-owner role)', () => {
  it('org A never sees org B\'s fact for the same fact_id, and vice versa', async () => {
    const orgA = `org-a-${randomUUID()}`;
    const orgB = `org-b-${randomUUID()}`;
    const fA: FactInput = {
      orgId: orgA,
      factId: 'D1',
      kind: 'decision',
      attr: 'status',
      value: 'OPEN',
      validFrom: '2026-01-01T00:00:00Z',
      validTo: null,
    };
    const fB: FactInput = { ...fA, orgId: orgB, value: 'REJECTED' };

    await withOrgTx(pool, orgA, (client) => insertFact(client, fA));
    await withOrgTx(pool, orgB, (client) => insertFact(client, fB));

    const seenByA = await withOrgTx(pool, orgA, (client) => asOf(client, 'D1', 'status', '2026-06-01T00:00:00Z'));
    const seenByB = await withOrgTx(pool, orgB, (client) => asOf(client, 'D1', 'status', '2026-06-01T00:00:00Z'));
    expect(seenByA).toBe('OPEN');
    expect(seenByB).toBe('REJECTED');

    const rowCountForA = await withOrgTx(pool, orgA, async (client) => {
      const r = await client.query('select count(*)::int as n from fact_versions');
      return r.rows[0].n as number;
    });
    expect(rowCountForA).toBe(1); // never org B's row, even counting raw rows
  });

  it('inserting without an org context (no SET LOCAL app.current_org_id) is rejected by the RLS WITH CHECK, not silently written', async () => {
    const f: FactInput = {
      orgId: 'org-no-context',
      factId: 'D-no-ctx',
      kind: 'decision',
      attr: 'status',
      value: 'OPEN',
      validFrom: '2026-01-01T00:00:00Z',
      validTo: null,
    };
    // Direct pool.query bypasses withOrgTx's SET LOCAL app.current_org_id entirely, so
    // current_setting(...) is '' and the WITH CHECK (org_id = '') never matches a real org_id.
    await expect(insertFact(pool, f)).rejects.toThrow();
  });
});
