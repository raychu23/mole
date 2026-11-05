import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createPool, runMigrations, closePool, type Pool } from '../src/db.js';
import { writeOutboxInTx, relayOutboxOnce, relayOutboxOnceDetailed, type FakeGithubClient } from '../src/outbox.js';
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

// T98 server-slo: relayOutboxOnce used to claim up to 50 rows and resolve them all in ONE
// transaction, so a single failing row rolled back every row in that batch -- including
// rows whose sink.postCheckRun() had already succeeded -- and had no backoff/dead-letter,
// so a permanently-failing row was re-claimed and re-sent on every tick forever.
describe('outbox retry/backoff + dead-letter + per-row isolation (T98 server-slo)', () => {
  let pool: Pool;

  beforeAll(async () => {
    const dbUrl = process.env.M25_DATABASE_URL;
    if (!dbUrl) return;
    pool = createPool(dbUrl);
    await runMigrations(pool);
    await pool.query("insert into orgs(id, name) values ('org-outbox-retry','OR') on conflict (id) do nothing");
  });

  afterAll(async () => {
    if (pool) await pool.query("delete from outbox where org_id = 'org-outbox-retry'").catch(() => undefined);
    if (pool) await closePool(pool);
  });

  it.runIf(!!process.env.M25_DATABASE_URL)(
    'a failing row never rolls back another row that was already delivered in the same tick',
    async () => {
      const client = await pool.connect();
      try {
        await client.query('begin');
        await writeOutboxInTx(client, 'org-outbox-retry', 'check_run', { ref: 'good-1' });
        await writeOutboxInTx(client, 'org-outbox-retry', 'check_run', { ref: 'bad-1' });
        await client.query('commit');
      } finally {
        client.release();
      }
      const flaky: FakeGithubClient = {
        async postCheckRun(_orgId, ref) {
          if (ref === 'bad-1') throw new Error('simulated sink failure');
        },
      };
      const result = await relayOutboxOnceDetailed(pool, flaky);
      expect(result.delivered).toBe(1);
      expect(result.failed).toBe(1);
      const rows = await pool.query(
        "select ref, delivered_at, attempts, dead_letter from outbox where org_id = 'org-outbox-retry' order by ref"
      );
      const bad = rows.rows.find((r) => r.ref === 'bad-1');
      const good = rows.rows.find((r) => r.ref === 'good-1');
      // the regression this guards: a naive single-transaction batch would have rolled
      // good-1 back to undelivered too, once bad-1 threw.
      expect(good.delivered_at).not.toBeNull();
      expect(bad.delivered_at).toBeNull();
      expect(bad.attempts).toBe(1);
      expect(bad.dead_letter).toBe(false);
    }
  );

  it.runIf(!!process.env.M25_DATABASE_URL)(
    'backs off exponentially and is not re-claimed before next_attempt_at',
    async () => {
      const client = await pool.connect();
      try {
        await client.query('begin');
        await writeOutboxInTx(client, 'org-outbox-retry', 'check_run', { ref: 'backoff-1' });
        await client.query('commit');
      } finally {
        client.release();
      }
      const alwaysFails: FakeGithubClient = {
        async postCheckRun() {
          throw new Error('simulated permanent failure');
        },
      };
      const first = await relayOutboxOnceDetailed(pool, alwaysFails);
      expect(first.failed).toBe(1);
      // immediately retrying must find nothing due yet (next_attempt_at is in the future)
      const immediate = await relayOutboxOnceDetailed(pool, alwaysFails);
      expect(immediate.failed).toBe(0);
      expect(immediate.delivered).toBe(0);
      const row = await pool.query("select next_attempt_at, attempts from outbox where org_id = 'org-outbox-retry' and ref = 'backoff-1'");
      expect(row.rows[0].attempts).toBe(1);
      expect(new Date(row.rows[0].next_attempt_at).getTime()).toBeGreaterThan(Date.now());
    }
  );

  it.runIf(!!process.env.M25_DATABASE_URL)(
    'dead-letters after maxAttempts and stops being selected at all',
    async () => {
      const client = await pool.connect();
      try {
        await client.query('begin');
        await writeOutboxInTx(client, 'org-outbox-retry', 'check_run', { ref: 'dead-1' });
        await client.query('commit');
      } finally {
        client.release();
      }
      const alwaysFails: FakeGithubClient = {
        async postCheckRun() {
          throw new Error('simulated permanent failure');
        },
      };
      // backoffBaseSeconds: 0 and backoffCapSeconds: 0 so next_attempt_at stays due immediately,
      // letting this test force maxAttempts failures without waiting on real backoff delay.
      let lastResult;
      for (let i = 0; i < 3; i++) {
        lastResult = await relayOutboxOnceDetailed(pool, alwaysFails, { maxAttempts: 3, backoffBaseSeconds: 0, backoffCapSeconds: 0 });
      }
      expect(lastResult!.deadLettered).toBe(1);
      const row = await pool.query("select attempts, dead_letter from outbox where org_id = 'org-outbox-retry' and ref = 'dead-1'");
      expect(row.rows[0].dead_letter).toBe(true);
      expect(row.rows[0].attempts).toBe(3);
      // a dead-lettered row is never re-claimed again, even though it's "due".
      const again = await relayOutboxOnceDetailed(pool, alwaysFails, { maxAttempts: 3, backoffBaseSeconds: 0, backoffCapSeconds: 0 });
      expect(again.failed).toBe(0);
      expect(again.delivered).toBe(0);
    }
  );

  it.runIf(!!process.env.M25_DATABASE_URL)('relayOutboxOnce (back-compat shape) still returns a delivered count', async () => {
    const client = await pool.connect();
    try {
      await client.query('begin');
      await writeOutboxInTx(client, 'org-outbox-retry', 'check_run', { ref: 'compat-1' });
      await client.query('commit');
    } finally {
      client.release();
    }
    const ok: FakeGithubClient = { async postCheckRun() {} };
    const n = await relayOutboxOnce(pool, ok);
    expect(n).toBe(1);
  });
});
