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
 * reproduces the EXACT pre-T99 literal names.
 *
 * Review round 1 BLOCKING finding (2026-11-05): the first cut of this file defaulted the
 * prefix to the connection string's database name whenever MOLE_QUEUE_PREFIX was unset. That
 * silently renamed every existing deployment's queues on a plain in-place upgrade (no env var
 * touched): a freshly-restarted worker registers `boss.work()` under the NEW prefixed names,
 * so anything already queued under the OLD literal names ('rebuild-index' etc) is never
 * claimed again, and vice versa for a webhook that lands after the restart but is still
 * enqueued before an operator notices and sets the var. That is exactly the silent-breakage
 * shape this file's own comment above claims NOT to have, and contradicts docs/server-slo.md.
 *
 * Fixed: the default (MOLE_QUEUE_PREFIX unset) is now '' -- the exact pre-T99 literal names,
 * matching createQueue()'s own default below, zero behavior change on any upgrade. Namespacing
 * is opt-in, two ways:
 *   - `MOLE_QUEUE_PREFIX=<name>` -- an explicit, stable prefix you choose (team/env name).
 *   - `MOLE_QUEUE_PREFIX=auto`   -- derive the prefix from the connection string's database
 *     name (`defaultQueuePrefixFromUrl`), for deployments that already use one database per
 *     environment and want that name reused as the prefix for free.
 *
 * When to set it: ONLY when two deployments (or two server processes / test suites) point at
 * the SAME Postgres instance and schema, and would otherwise claim/fail/dead-letter each
 * other's jobs -- the T98 finding this file fixes. A deployment with its own dedicated
 * database never needs MOLE_QUEUE_PREFIX.
 *
 * How to turn it on without stranding in-flight jobs: before the FIRST restart with
 * MOLE_QUEUE_PREFIX set, drain the existing unprefixed backlog (deploy with it still unset
 * until this query returns 0 rows for every base queue name: `select name, count(*) from
 * pgboss.job where name = any(array['rebuild-index','compute-check-run','relay-outbox']) and
 * state not in ('completed','cancelled','failed') group by name;`), THEN set the var and
 * restart. Setting it before the backlog drains does not lose those jobs -- no worker is
 * registered under the old unprefixed names once a prefix is in effect, so they simply sit
 * un-worked until MOLE_QUEUE_PREFIX is unset again -- but draining first avoids that window.
 */
export function queueName(prefix: string, base: QueueBaseName | string): string {
  return prefix ? `${prefix}:${base}` : base;
}

/** Derives a prefix from the connection string's database name. Only used when
 * MOLE_QUEUE_PREFIX is explicitly set to the literal string 'auto' (see resolveQueuePrefix) --
 * never a silent default, since that was the exact review-finding bug (see the file header
 * comment above). Falls back to '' if the connection string can't be parsed as a URL. */
export function defaultQueuePrefixFromUrl(connectionString: string): string {
  try {
    const u = new URL(connectionString);
    return u.pathname.replace(/^\//, '') || '';
  } catch {
    return '';
  }
}

/** MOLE_QUEUE_PREFIX unset -> '' (exact pre-T99 literal queue names; safe zero-config default
 * for every existing deployment). MOLE_QUEUE_PREFIX=auto -> derive from the connection
 * string's database name. Anything else (including explicit '') is used verbatim -- an
 * operator opting back into unprefixed names, or into their own fixed name, must be respected
 * exactly, never silently overridden. */
export function resolveQueuePrefix(connectionString: string, env: NodeJS.ProcessEnv = process.env): string {
  const raw = env.MOLE_QUEUE_PREFIX;
  if (raw === undefined) return '';
  if (raw === 'auto') return defaultQueuePrefixFromUrl(connectionString);
  return raw;
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
