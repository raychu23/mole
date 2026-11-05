// pg-boss (Postgres-backed queue, no Redis). R0 prior-art.md §8: jobs enqueued in the same
// DB transaction as the delivery row that produced them (an outbox application), SKIP
// LOCKED-based workers, dead-letter via pg-boss's own retry/DLQ support.
import PgBoss from 'pg-boss';

export type Boss = PgBoss;

export const QUEUES = ['rebuild-index', 'compute-check-run', 'relay-outbox'] as const;
export type QueueBaseName = (typeof QUEUES)[number];

/**
 * T99 server-throughput (found during T98's load test, docs/server-slo.md "Found, not
 * fixed" #2): pg-boss queue names are GLOBAL to a Postgres instance -- two server processes
 * (two deploys, or two test files in this package's own suite, see 4 log/green.txt's
 * documented pg-boss cross-test flake) pointed at the same database silently share
 * 'rebuild-index' etc and can claim/fail/dead-letter each other's jobs. Every real queue name
 * on the wire is now `${prefix}:${base}` for a configurable prefix; `prefix === ''`
 * reproduces the EXACT pre-T99 literal names (full backward compatibility: a deploy upgrading
 * in place with no new env var keeps draining whatever it already queued under the old
 * scheme -- this is the "migration path for existing queued jobs" the task asks for: there
 * is none needed as long as MOLE_QUEUE_PREFIX is left unset until the existing backlog is
 * drained, then set it and restart; setting it before the backlog drains would leave the old
 * un-prefixed jobs queued but un-worked until the prefix is unset again).
 */
export function queueName(prefix: string, base: QueueBaseName | string): string {
  return prefix ? `${prefix}:${base}` : base;
}

/** Default prefix when MOLE_QUEUE_PREFIX is unset: the database name parsed out of the
 * connection string. Stable for a given deployment, distinct across deployments that (as is
 * typical) use distinct database names, without requiring any new configuration. Falls back
 * to '' (the old, unprefixed behavior) if the connection string can't be parsed as a URL. */
export function defaultQueuePrefixFromUrl(connectionString: string): string {
  try {
    const u = new URL(connectionString);
    return u.pathname.replace(/^\//, '') || '';
  } catch {
    return '';
  }
}

export function resolveQueuePrefix(connectionString: string, env: NodeJS.ProcessEnv = process.env): string {
  if (env.MOLE_QUEUE_PREFIX !== undefined) return env.MOLE_QUEUE_PREFIX;
  return defaultQueuePrefixFromUrl(connectionString);
}

/**
 * Root-cause fix (T33 review round 2 blocking finding, 2026-10-29): with no retention/retry
 * bound, pg-boss jobs from old bench runs (each run builds fresh temp fixture repo dirs via
 * `mkdtempSync`, then deletes them on exit) accumulated in this long-lived local Postgres
 * instance (`/tmp/mole-pg-1OjR`) and got replayed by a *later* run's `boss.work(...)` against
 * the same DB, pointing at since-deleted dirs. Combined with rebuild.ts's old
 * swallow-git-failure-as-empty bug, that silently wiped an org's index. Fixing rebuild.ts to
 * throw (see GitReadError) stops the wipe outright, but a permanently-failing job referencing
 * a deleted dir would otherwise retry forever and the job table would grow unbounded across
 * many bench reruns — so this also bounds both.
 *
 * Per pg-boss README (queue "Retry" and "Maintenance" options, pg-boss 10.x):
 *  - `retryLimit` / `retryDelay` / `retryBackoff`: bound how many times a failing job is
 *    retried before pg-boss gives up on it (default retryLimit is 0 — a job that always
 *    throws would otherwise keep failing and sitting around as 'failed' forever if nothing
 *    else expires it).
 *  - `deadLetter`: on exhausting retries, pg-boss moves the job's payload to the named
 *    dead-letter queue instead of leaving it in the original queue's failed state, so stale
 *    jobs stop being candidates the next `boss.work(...)` call has to look at.
 *  - `archiveCompletedAfterSeconds` (constructor/maintenance option): moves
 *    completed/failed/cancelled jobs out of the active `job` table into `archive` quickly.
 *  - `deleteAfterDays` (constructor/maintenance option): purges archived jobs so the table
 *    can't grow unbounded across many reruns of a long-lived instance like this one.
 */
const QUEUE_RETRY_OPTS = {
  retryLimit: 3,
  retryDelay: 5,
  retryBackoff: true,
  expireInSeconds: 60,
} as const;

/** @param prefix T99: namespaces every queue this boss instance creates/uses, see queueName()
 * above. Defaults to '' (unprefixed, pre-T99 literal names) for every existing caller
 * (bench/m25.ts, this package's own tests) that doesn't pass one. */
export async function createQueue(connectionString: string, prefix = ''): Promise<Boss> {
  const boss = new PgBoss({
    connectionString,
    schema: 'pgboss',
    // Archive quickly and delete archived jobs after 1 day: bounds how long any job
    // (completed, failed, or dead-lettered) can sit in/near the active job table across
    // many bench reruns against this one persistent Postgres instance.
    archiveCompletedAfterSeconds: 60 * 10,
    deleteAfterDays: 1,
  });
  boss.on('error', (err) => console.error('[pg-boss]', err));
  await boss.start();
  for (const q of QUEUES) {
    const name = queueName(prefix, q);
    const dlq = `${name}-dlq`;
    // Dead-letter queue must exist before a queue can reference it in `deadLetter`.
    await boss.createQueue(dlq);
    await boss.createQueue(name, { name, ...QUEUE_RETRY_OPTS, deadLetter: dlq });
  }
  return boss;
}

export async function closeQueue(boss: Boss): Promise<void> {
  await boss.stop({ graceful: false, wait: false });
}
