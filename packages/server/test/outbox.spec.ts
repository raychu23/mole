import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createPool, runMigrations, closePool, type Pool } from '../src/db.js';
import { writeOutboxInTx, relayOutboxOnce } from '../src/outbox.js';
import { startFakeGithubApi } from '../src/fakeGithub.js';

describe('transactional outbox (M25 "0 lost notifications")', () => {
  let pool: Pool;
  let fakeGithub: Awaited<ReturnType<typeof startFakeGithubApi>>;

  beforeAll(async () => {
    const dbUrl = process.env.M25_DATABASE_URL;
    if (!dbUrl) return;
    pool = createPool(dbUrl);
    await runMigrations(pool);
    await pool.query("insert into orgs(id, name) values ('org-outbox','O') on conflict (id) do nothing");
    fakeGithub = await startFakeGithubApi();
  });

  afterAll(async () => {
    // Clean up this test's own row: the suite reuses a long-lived shared Postgres instance
    // across runs/tasks (never a fresh-per-run DB in this environment), and the unique
    // (org_id, kind, ref) index means a leftover delivered row from a prior run makes the
    // next run's insert a no-op, silently masking "relayed" as 0 instead of 1.
    if (pool) await pool.query("delete from outbox where org_id = 'org-outbox'").catch(() => undefined);
    if (fakeGithub) await fakeGithub.close();
    if (pool) await closePool(pool);
  });

  it.runIf(!!process.env.M25_DATABASE_URL)('a written notification is eventually relayed exactly once', async () => {
    const client = await pool.connect();
    try {
      await client.query('begin');
      await writeOutboxInTx(client, 'org-outbox', 'check_run', { ref: 'abc', conclusion: 'success' });
      await client.query('commit');
    } finally {
      client.release();
    }
    let relayed = 0;
    for (let i = 0; i < 5; i++) {
      relayed += await relayOutboxOnce(pool, fakeGithub);
    }
    expect(relayed).toBe(1);
    const pending = await pool.query('select count(*)::int as c from outbox where delivered_at is null');
    expect(pending.rows[0].c).toBe(0);
    expect(fakeGithub.received.length).toBe(1);
  });
});
