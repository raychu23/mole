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

    it('resolveQueuePrefix prefers MOLE_QUEUE_PREFIX over the derived default', () => {
      expect(resolveQueuePrefix('postgresql://user@host/mole_prod', { MOLE_QUEUE_PREFIX: 'custom' } as NodeJS.ProcessEnv)).toBe('custom');
      expect(resolveQueuePrefix('postgresql://user@host/mole_prod', {} as NodeJS.ProcessEnv)).toBe('mole_prod');
      // explicitly set to '' means "no prefix", not "use the default" -- an operator opting
      // back into the old unprefixed behavior must be respected, not silently overridden.
      expect(resolveQueuePrefix('postgresql://user@host/mole_prod', { MOLE_QUEUE_PREFIX: '' } as NodeJS.ProcessEnv)).toBe('');
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
});
