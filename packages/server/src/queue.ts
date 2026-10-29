// pg-boss (Postgres-backed queue, no Redis). R0 prior-art.md §8: jobs enqueued in the same
// DB transaction as the delivery row that produced them (an outbox application), SKIP
// LOCKED-based workers, dead-letter via pg-boss's own retry/DLQ support.
import PgBoss from 'pg-boss';

export type Boss = PgBoss;

export const QUEUES = ['rebuild-index', 'compute-check-run', 'relay-outbox'] as const;

export async function createQueue(connectionString: string): Promise<Boss> {
  const boss = new PgBoss({ connectionString, schema: 'pgboss' });
  boss.on('error', (err) => console.error('[pg-boss]', err));
  await boss.start();
  for (const q of QUEUES) {
    await boss.createQueue(q);
  }
  return boss;
}

export async function closeQueue(boss: Boss): Promise<void> {
  await boss.stop({ graceful: false, wait: false });
}
