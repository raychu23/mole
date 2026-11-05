// Transactional outbox (R0 prior-art.md §5, Richardson microservices.io): write the
// notification in the same DB transaction as the state change; a separate relay delivers
// it to the (fake) GitHub API and marks it delivered only after a successful send.
//
// T98 server-slo audit finding: relayOutboxOnce used to claim up to 50 rows `for update
// skip locked` and process them IN ONE TRANSACTION -- a single sink.postCheckRun() failure
// on row #3 threw, the whole transaction rolled back (undoing delivered_at for rows #1-2
// too, which had already been successfully posted to the sink -- a real duplicate-delivery
// risk on retry), and there was no backoff: a permanently-failing row would be re-claimed
// and re-POSTed on every relay tick forever. Each row is now claimed and resolved in its
// OWN transaction (one sink call can never undo another row's already-delivered state),
// with exponential backoff per `next_attempt_at` and a dead-letter flag after maxAttempts
// (same shape as pg-boss's own retryBackoff/deadLetter in queue.ts, applied here because
// this relay is a separate failure domain from the pg-boss queue).
import type { PoolClient } from 'pg';
import type { Pool } from './db.js';

export async function writeOutboxInTx(client: PoolClient, orgId: string, kind: string, payload: any, ref?: string): Promise<void> {
  await client.query('set local role mole_app');
  await client.query('select set_config($1, $2, true)', ['app.current_org_id', orgId]);
  // idempotent per (org, kind, ref): a duplicate-triggered write for the same ref has 0
  // extra effect (M25 "0 duplicate effects"), it just collapses into the existing row.
  await client.query(
    `insert into outbox(org_id, kind, ref, payload) values ($1,$2,$3,$4)
     on conflict (org_id, kind, ref) where ref is not null do nothing`,
    [orgId, kind, ref ?? payload?.ref ?? null, JSON.stringify(payload)]
  );
}

export interface FakeGithubClient {
  postCheckRun(orgId: string, ref: string, payload: unknown): Promise<void>;
  postNotification?(orgId: string, payload: unknown): Promise<void>;
}

export const OUTBOX_RELAY_DEFAULTS = {
  /** Base of the exponential backoff, in seconds (attempt 1 -> 2s, 2 -> 4s, 3 -> 8s, ...). */
  backoffBaseSeconds: 2,
  /** Cap so a long-failing row is retried at most every 5 minutes, not hours later. */
  backoffCapSeconds: 300,
  /** After this many failed attempts, stop retrying and mark dead_letter (operator must look). */
  maxAttempts: 8,
  limit: 50,
} as const;

export interface RelayOutboxOptions {
  backoffBaseSeconds?: number;
  backoffCapSeconds?: number;
  maxAttempts?: number;
  limit?: number;
}

export interface RelayOutboxResult {
  delivered: number;
  failed: number;
  deadLettered: number;
}

function backoffSeconds(attempts: number, opts: Required<RelayOutboxOptions>): number {
  return Math.min(opts.backoffBaseSeconds * 2 ** Math.max(0, attempts - 1), opts.backoffCapSeconds);
}

/**
 * Attempts to deliver one batch of undelivered, non-dead-lettered, due (next_attempt_at <=
 * now()) outbox rows. Each row is claimed and resolved in its own transaction: a failure on
 * one row can never roll back another row's successful delivery. Returns the detailed
 * outcome; callers that only need "how many delivered" (bench/m25.ts, existing tests) can
 * read `.delivered` or use the deprecated-shape-compatible `relayOutboxOnceCount` below.
 */
export async function relayOutboxOnceDetailed(pool: Pool, sink: FakeGithubClient, opts: RelayOutboxOptions = {}): Promise<RelayOutboxResult> {
  const cfg: Required<RelayOutboxOptions> = { ...OUTBOX_RELAY_DEFAULTS, ...opts };
  const claimClient = await pool.connect();
  let candidates: { id: number; org_id: string; payload: any; attempts: number }[];
  try {
    const { rows } = await claimClient.query(
      `select id, org_id, payload, attempts from outbox
       where delivered_at is null and dead_letter = false and next_attempt_at <= now()
       order by id limit $1`,
      [cfg.limit]
    );
    candidates = rows;
  } finally {
    claimClient.release();
  }

  const result: RelayOutboxResult = { delivered: 0, failed: 0, deadLettered: 0 };
  for (const row of candidates) {
    const client = await pool.connect();
    try {
      await client.query('begin');
      // Re-claim under this row's own lock: skips it cleanly if another relay tick (or a
      // concurrent process) already claimed/delivered it between the select above and here.
      const claim = await client.query(
        `select id, payload, attempts from outbox where id = $1 and delivered_at is null and dead_letter = false for update skip locked`,
        [row.id]
      );
      if (claim.rowCount === 0) {
        await client.query('commit');
        continue;
      }
      const claimed = claim.rows[0];
      try {
        await sink.postCheckRun(row.org_id, claimed.payload?.ref ?? 'unknown', claimed.payload);
        await client.query('update outbox set delivered_at = now() where id = $1', [row.id]);
        await client.query('commit');
        result.delivered++;
      } catch (sendErr) {
        await client.query('rollback');
        // Retry bookkeeping is its own transaction: never lose the failure record even
        // though the delivery attempt itself rolled back.
        const attempts = claimed.attempts + 1;
        const deadLetter = attempts >= cfg.maxAttempts;
        const message = sendErr instanceof Error ? sendErr.message : String(sendErr);
        await pool.query(
          `update outbox set attempts = $2, last_error = $3, dead_letter = $4,
             next_attempt_at = now() + make_interval(secs => $5)
           where id = $1`,
          [row.id, attempts, message.slice(0, 2000), deadLetter, backoffSeconds(attempts, cfg)]
        );
        result.failed++;
        if (deadLetter) result.deadLettered++;
      }
    } finally {
      client.release();
    }
  }
  return result;
}

/** Back-compat shape used by bench/m25.ts and pre-T98 tests: returns the delivered count. */
export async function relayOutboxOnce(pool: Pool, sink: FakeGithubClient, opts: RelayOutboxOptions = {}): Promise<number> {
  const r = await relayOutboxOnceDetailed(pool, sink, opts);
  return r.delivered;
}
