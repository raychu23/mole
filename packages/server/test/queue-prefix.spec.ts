// T99 server-throughput regression test: pg-boss queue names used to be global to the
// Postgres instance (docs/server-slo.md "Found, not fixed" #2, found during T98's load test)
// -- two Boss instances against the SAME database, with no namespacing, would both poll the
// literal queue name 'rebuild-index' and race to claim the same jobs (or, worse, a crashed
// deploy's leftover jobs get claimed by an unrelated later deploy pointed at the same DB,
// which then fails them with "no repo dir configured for org X" -- exactly the T98 finding).
// This proves two different MOLE_QUEUE_PREFIX values against the same database never see each
// other's jobs: a job sent under prefix A is received ONLY by a worker registered under
// prefix A, never by one registered under prefix B, even though both share one Postgres
// instance/schema and one literal base queue name ('rebuild-index').
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createQueue, closeQueue, queueName, defaultQueuePrefixFromUrl, resolveQueuePrefix, type Boss } from '../src/queue.js';

describe('queue.ts namespacing (T99 server-throughput)', () => {
  describe('queueName / resolveQueuePrefix (pure)', () => {
    it('prefix "" reproduces the exact pre-T99 literal name (back-compat)', () => {
      expect(queueName('', 'rebuild-index')).toBe('rebuild-index');
    });

    it('a non-empty prefix namespaces the queue name', () => {
      expect(queueName('acme-prod', 'rebuild-index')).toBe('acme-prod:rebuild-index');
    });

    it('defaultQueuePrefixFromUrl derives the prefix from the connection string db name', () => {
      expect(defaultQueuePrefixFromUrl('postgresql://user@host:5432/mole_prod')).toBe('mole_prod');
      expect(defaultQueuePrefixFromUrl('postgresql://user@host:5432/')).toBe('');
      expect(defaultQueuePrefixFromUrl('not a url')).toBe('');
    });

    it('resolveQueuePrefix prefers an explicit MOLE_QUEUE_PREFIX over any derived default', () => {
      expect(resolveQueuePrefix('postgresql://user@host/mole_prod', { MOLE_QUEUE_PREFIX: 'custom' } as NodeJS.ProcessEnv)).toBe('custom');
      // explicitly set to '' means "no prefix", not "use a default" -- an operator opting
      // back into the old unprefixed behavior must be respected, not silently overridden.
      expect(resolveQueuePrefix('postgresql://user@host/mole_prod', { MOLE_QUEUE_PREFIX: '' } as NodeJS.ProcessEnv)).toBe('');
    });

    // Review round 1 BLOCKING finding (2026-11-05): the first cut of this file defaulted an
    // UNSET MOLE_QUEUE_PREFIX to the database name, which silently renamed every existing
    // deployment's queues on a plain in-place upgrade (docs/server-slo.md's own "no migration
    // needed" claim was false). Fixed: unset now means exactly '', the pre-T99 literal names.
    it('MOLE_QUEUE_PREFIX unset -> "" (exact pre-T99 literal queue names, zero-config upgrade)', () => {
      expect(resolveQueuePrefix('postgresql://user@host/mole_prod', {} as NodeJS.ProcessEnv)).toBe('');
      expect(resolveQueuePrefix('postgresql://user@host/mole_staging', {} as NodeJS.ProcessEnv)).toBe('');
    });

    it('MOLE_QUEUE_PREFIX=auto derives the prefix from the connection string db name (opt-in only)', () => {
      expect(resolveQueuePrefix('postgresql://user@host:5432/mole_prod', { MOLE_QUEUE_PREFIX: 'auto' } as NodeJS.ProcessEnv)).toBe('mole_prod');
      expect(resolveQueuePrefix('postgresql://user@host:5432/', { MOLE_QUEUE_PREFIX: 'auto' } as NodeJS.ProcessEnv)).toBe('');
    });
  });

  const dbUrl = process.env.M25_DATABASE_URL;

  describe.runIf(!!dbUrl)('live isolation: two prefixes on the same database never share jobs', () => {
    let bossA: Boss;
    let bossB: Boss;

    beforeAll(async () => {
      bossA = await createQueue(dbUrl!, 'prefix-a-t99');
      bossB = await createQueue(dbUrl!, 'prefix-b-t99');
    });

    afterAll(async () => {
      await bossA.offWork(queueName('prefix-a-t99', 'rebuild-index')).catch(() => undefined);
      await bossB.offWork(queueName('prefix-b-t99', 'rebuild-index')).catch(() => undefined);
      await closeQueue(bossA);
      await closeQueue(bossB);
    });

    it(
      'a job sent under prefix A is received by prefix A\'s worker, never prefix B\'s',
      async () => {
        const receivedByA: unknown[] = [];
        const receivedByB: unknown[] = [];
        await bossA.work(queueName('prefix-a-t99', 'rebuild-index'), { batchSize: 1 }, async (jobs) => {
          for (const j of jobs) receivedByA.push(j.data);
        });
        await bossB.work(queueName('prefix-b-t99', 'rebuild-index'), { batchSize: 1 }, async (jobs) => {
          for (const j of jobs) receivedByB.push(j.data);
        });

        await bossA.send(queueName('prefix-a-t99', 'rebuild-index'), { marker: 'only-for-a' });

        // give both workers' polling loops a fair chance to pick it up
        const start = Date.now();
        while (receivedByA.length === 0 && Date.now() - start < 5000) {
          await new Promise((r) => setTimeout(r, 100));
        }
        // one more settle window: if prefix B's worker were (incorrectly) sharing the queue,
        // it would also have claimed/seen something by now.
        await new Promise((r) => setTimeout(r, 500));

        expect(receivedByA).toEqual([{ marker: 'only-for-a' }]);
        expect(receivedByB).toEqual([]);
      },
      15000
    );
  });

  // Review round 1 BLOCKING finding (2026-11-05): proves the actual upgrade scenario, not just
  // the pure default value -- a job queued under the OLD unprefixed name before a restart must
  // still be claimed after the restart as long as MOLE_QUEUE_PREFIX stays unset (resolved the
  // same way index.ts's buildApp() resolves it: resolveQueuePrefix(dbUrl, env)).
  describe.runIf(!!dbUrl)('in-place upgrade: a job queued under the old name survives a restart with the env unset', () => {
    it(
      'boss instance #2 (simulating the restarted process) still claims a job boss instance #1 enqueued before it closed',
      async () => {
        const env = {} as NodeJS.ProcessEnv; // MOLE_QUEUE_PREFIX intentionally unset
        const prefixBeforeUpgrade = resolveQueuePrefix(dbUrl!, env);
        const prefixAfterUpgrade = resolveQueuePrefix(dbUrl!, env);
        expect(prefixBeforeUpgrade).toBe('');
        expect(prefixAfterUpgrade).toBe('');

        // "before restart": the pre-upgrade process enqueues a job and then goes away (crash,
        // redeploy, or a plain restart) WITHOUT ever registering a worker for it.
        const bossBefore = await createQueue(dbUrl!, prefixBeforeUpgrade);
        await bossBefore.send(queueName(prefixBeforeUpgrade, 'rebuild-index'), { marker: 'queued-before-restart' });
        await closeQueue(bossBefore);

        // "after restart": a fresh Boss instance, same resolution logic, same unset env.
        const bossAfter = await createQueue(dbUrl!, prefixAfterUpgrade);
        try {
          const received: unknown[] = [];
          await bossAfter.work(queueName(prefixAfterUpgrade, 'rebuild-index'), { batchSize: 1 }, async (jobs) => {
            for (const j of jobs) received.push(j.data);
          });

          const start = Date.now();
          while (received.length === 0 && Date.now() - start < 5000) {
            await new Promise((r) => setTimeout(r, 100));
          }

          expect(received).toEqual([{ marker: 'queued-before-restart' }]);
        } finally {
          await bossAfter.offWork(queueName(prefixAfterUpgrade, 'rebuild-index')).catch(() => undefined);
          await closeQueue(bossAfter);
        }
      },
      15000
    );
  });
});
