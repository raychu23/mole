// Production HTTP entrypoint (review round 1 P1 #3). Previously this file was just a list of
// bare re-exports: `node dist/src/index.js` imported it, executed nothing, and exited
// immediately — not a runnable "GitHub App backend" despite deploy/Dockerfile's CMD claiming
// to start one. This now binds a real Fastify app: the webhook route (verify -> dedupe ->
// enqueue, src/webhook.ts) plus a health check, so the process stays up and serves traffic.
//
// T98 server-slo: audited against Google SRE book ch.4 (SLOs/SLIs), GitHub's webhook best
// practices (respond <10s, X-GitHub-Delivery dedupe -- both already true before this task),
// and OpenTelemetry's HTTP semantic conventions. Findings fixed here (see docs/server-slo.md
// for the full audit + what's still NOT done):
//  1. no graceful shutdown: a plain `node dist/src/index.js` had zero signal handlers, so
//     SIGTERM (what Kubernetes/systemd/`docker stop` send) hit Node's default handling and
//     the process exited without draining -- an in-flight webhook ack or rebuild-index job
//     could be cut off mid-request/mid-write. Fixed below (shutdown()/isMain block).
//  2. the outbox relay was NEVER wired into the running server: relayOutboxOnce() was only
//     ever called by bench/m25.ts and by tests, in-process. A real deployment queued
//     check-run outbox rows forever and delivered zero of them. Fixed: a periodic relay
//     loop (OUTBOX_RELAY_INTERVAL_MS) using the new retry/backoff/dead-letter path in
//     outbox.ts + the pluggable sink in checkRunSink.ts.
//  3. /health conflated liveness and readiness (k8s/SRE convention: they answer different
//     questions -- "is the process alive" vs "should traffic be routed here"). Split into
//     /healthz (liveness) and /readyz (readiness: stores reachable AND not draining); /health
//     kept as an alias of /readyz for exact back-compat with existing callers/tests.
//  4. no request/connection timeouts: a slow or hung client could hold a keep-alive
//     connection indefinitely, which both wastes a worker slot and is inconsistent with
//     GitHub's own 10s webhook delivery budget. Fastify's connectionTimeout/requestTimeout
//     now bound this.
//
// Library consumers (bench/, test/) should keep importing individual modules directly
// (./webhook.js, ./db.js, ...), as they already do — or import everything from ./lib.js.
import { pathToFileURL } from 'node:url';
import Fastify, { type FastifyInstance } from 'fastify';
import { Pool as TemporalPgPool } from 'pg';
import { applySchema as applyTemporalSchema } from '@mole/temporal';
import { createPool, runMigrations, type Pool } from './db.js';
import { createQueue, queueName, resolveQueuePrefix, type Boss } from './queue.js';
import { createWebhookHandler } from './webhook.js';
import { initTelemetry, type Telemetry } from './telemetry.js';
import { rebuildIndexFromGit } from './rebuild.js';
import { computeCheckRun } from './checkrun.js';
import { reconcileDecisions } from './reconcile.js';
import { createTestIssuer } from './oauth.js';
import { relayOutboxOnceDetailed, type FakeGithubClient } from './outbox.js';
import { createCheckRunSink } from './checkRunSink.js';
import { mapLimit } from './concurrency.js';

export interface CloseOptions {
  /** Drain in-flight work (let pg-boss finish currently-executing jobs) instead of a hard
   * stop. Defaults to false so existing test teardown (fast, no jobs expected mid-flight)
   * is unchanged; the SIGTERM/SIGINT handlers installed in the isMain block below always
   * pass `{ graceful: true }`. */
  graceful?: boolean;
  /** Upper bound (ms) pg-boss's graceful stop waits for in-flight jobs before giving up. */
  timeoutMs?: number;
}

export interface ServerHandle {
  close(opts?: CloseOptions): Promise<void>;
  app: FastifyInstance;
  pool: Pool;
  boss: Boss;
  temporalPool: TemporalPgPool;
  telemetry: Telemetry;
}

export interface BuildAppOptions {
  /** Delivery sink for the outbox relay loop (tests inject a FakeGithubApi-backed one via
   * createHttpCheckRunSink / a custom mock; a real deploy would inject an Octokit-based
   * sink here -- Mole itself never registers a GitHub App, see checkRunSink.ts). Defaults
   * to env-driven createCheckRunSink(env). */
  githubSink?: FakeGithubClient;
  /** How often (ms) the outbox relay loop runs. 0 disables the loop entirely (tests that
   * want to call relayOutboxOnceDetailed themselves, deterministically, set this to 0). */
  outboxRelayIntervalMs?: number;
}

const DEFAULT_OUTBOX_RELAY_INTERVAL_MS = 5000;
const DEFAULT_GRACEFUL_TIMEOUT_MS = 20_000;

/** Builds (but does not start listening on) the server, for tests/callers that want the app
 * object without binding a port. */
export async function buildApp(env: NodeJS.ProcessEnv = process.env, opts: BuildAppOptions = {}) {
  const dbUrl = env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL is required to start the Mole team server');
  const secret = env.WEBHOOK_SECRET;
  if (!secret) throw new Error('WEBHOOK_SECRET is required to start the Mole team server');
  // org id -> local git repo dir standing in for "the repo GitHub would push from" (no real
  // GitHub App registration in Mole, per the task's non-goals); configured per deploy.
  const orgRepoDirs: Record<string, string> = env.ORG_REPO_DIRS ? JSON.parse(env.ORG_REPO_DIRS) : {};
  // T69 review-1 #1/#2: @mole/temporal is now the authoritative decision store (see
  // decisionStore.ts/rebuild.ts), but buildApp() itself never constructed a pool for it or
  // applied its schema -- a real deployed server never actually wrote a decision into
  // temporal on a live webhook-triggered rebuild. TEMPORAL_DATABASE_URL defaults to
  // DATABASE_URL (one Postgres instance by default, same convention every server/temporal test
  // in this repo already uses -- see decisionStore.spec.ts's single M25_DATABASE_URL), while
  // still letting a deploy point temporal at a separate database if it ever needs to.
  const temporalDbUrl = env.TEMPORAL_DATABASE_URL || dbUrl;

  // T99 server-throughput (docs/server-slo.md "Found, not fixed" #2): pg-boss queue names are
  // global to the Postgres instance; namespace every queue this process uses so a second
  // deploy (or a second server instance pointed at the same DB) never shares/steals jobs with
  // this one. See queue.ts's queueName()/resolveQueuePrefix() for the default + override.
  const queuePrefix = resolveQueuePrefix(dbUrl, env);

  const telemetry = initTelemetry('mole-team-server');
  const pool = createPool(dbUrl);
  await runMigrations(pool);
  const temporalPool = new TemporalPgPool({ connectionString: temporalDbUrl, max: 10 });
  await applyTemporalSchema(temporalPool);
  const boss = await createQueue(dbUrl, queuePrefix);
  const handler = createWebhookHandler({ secret, pool, boss, orgRepoDirs, telemetry, queuePrefix });

  // Wire the jobs enqueued by the webhook handler to real workers: without this, a running
  // server ack'd every push (202 queued) but nothing ever drained rebuild-index /
  // compute-check-run, so the index + outbox/check-run rows the whole product depends on
  // never got written outside of bench/m25.ts's own copy of this same registration (found
  // during final-build wiring verification, 2026-10-30). batchSize: 1 on rebuild-index
  // matches bench/m25.ts's own reasoning: pg-boss resolves/fails a whole batch as one unit.
  //
  // T99 server-throughput: rebuild.ts/checkrun.ts's git calls are now async (promisified
  // execFile, see those files), so a single job no longer blocks this process's event loop
  // for the call's duration -- but a batch handler that still processed `jobs` one at a time
  // with a plain `for` loop would get none of that benefit (each `await` would still run to
  // completion before starting the next). MOLE_REBUILD_CONCURRENCY/MOLE_CHECKRUN_CONCURRENCY
  // bound how many of a batch's jobs actually run concurrently (concurrency.ts's mapLimit) --
  // pg-boss 10.4.2 (this repo's installed version) has no `localConcurrency` WorkOptions field
  // itself (see concurrency.ts's header comment), so this is the equivalent bounded-fan-out
  // knob implemented at the handler level instead.
  const rebuildConcurrency = Number(env.MOLE_REBUILD_CONCURRENCY ?? 2);
  const checkRunConcurrency = Number(env.MOLE_CHECKRUN_CONCURRENCY ?? 4);
  await boss.work(queueName(queuePrefix, 'rebuild-index'), { batchSize: 1 }, async (jobs) => {
    await mapLimit(jobs, rebuildConcurrency, async (job) => {
      const { orgId, ref } = job.data as { orgId: string; ref: string };
      const repoDir = orgRepoDirs[orgId];
      if (!repoDir) throw new Error(`no repo dir configured for org ${orgId}`);
      await rebuildIndexFromGit(pool, orgId, repoDir, ref, telemetry, { temporalPool });
      // T69 review-1 #4: run the divergence check after every rebuild (the reconciliation
      // job the task's own STOP rule calls for) and log it. Never throws / never blocks the
      // index: a logging failure here must not turn a successful rebuild into a failed job.
      try {
        const result = await reconcileDecisions(pool, temporalPool, orgId);
        const divergent = result.missing.length > 0 || result.extra.length > 0 || result.changed.length > 0;
        if (divergent) {
          app.log.warn({ orgId, result }, '[mole-server] decision reconciliation divergence');
        } else {
          app.log.info({ orgId }, '[mole-server] decision reconciliation clean');
        }
      } catch (e) {
        app.log.error({ orgId, err: e }, '[mole-server] decision reconciliation check failed');
      }
    });
  });
  await boss.work(queueName(queuePrefix, 'compute-check-run'), { batchSize: 10 }, async (jobs) => {
    await mapLimit(jobs, checkRunConcurrency, async (job) => {
      const { orgId, ref, before } = job.data as { orgId: string; ref: string; before?: string };
      const repoDir = orgRepoDirs[orgId];
      if (!repoDir) throw new Error(`no repo dir configured for org ${orgId}`);
      await computeCheckRun(pool, orgId, repoDir, ref, before, telemetry);
    });
  });

  const app = Fastify({
    logger: true,
    // R0 server-slo prior-art.md: GitHub expects a 2xx within 10s or it counts the delivery
    // as failed; a hung/slow client holding a connection open indefinitely is both a
    // resource leak and inconsistent with that budget. 9.5s stays strictly under GitHub's
    // 10s so our own 503/close happens before GitHub's own timeout would anyway.
    requestTimeout: Number(env.MOLE_REQUEST_TIMEOUT_MS ?? 9_500),
    connectionTimeout: Number(env.MOLE_CONNECTION_TIMEOUT_MS ?? 10_000),
  });
  // T98 review MEDIUM: Fastify assigns requestTimeout after the http.Server is constructed, so Node never
  // clamps headersTimeout (60 s default) to it, and Fastify has no headersTimeout option: a client trickling
  // headers (slowloris) could hold a socket 6x past GitHub's 10 s. Node requires headersTimeout <= requestTimeout.
  app.server.headersTimeout = Math.min(
    Number(env.MOLE_HEADERS_TIMEOUT_MS ?? 9_000),
    Number(env.MOLE_REQUEST_TIMEOUT_MS ?? 9_500),
  );

  let shuttingDown = false;

  // T98 server-slo gap #3: /health conflated liveness ("is the process alive") and
  // readiness ("should traffic be routed here") -- the SRE/k8s convention is to split them
  // (a process can be alive but not ready, e.g. draining, or ready-but-slow is a different
  // signal than dead). /health is kept, unchanged in contract, as an alias of /readyz.
  async function readiness(reply: { code(n: number): void }) {
    if (shuttingDown) {
      reply.code(503);
      return { status: 'error', reason: 'shutting-down' };
    }
    try {
      await temporalPool.query('select 1');
      return { status: 'ok' };
    } catch (e) {
      reply.code(503);
      return { status: 'error', temporal: 'unreachable' };
    }
  }

  // Liveness: process is running and the event loop is responsive. Deliberately never
  // touches the database -- a liveness probe that depends on an external store can cause an
  // orchestrator to kill-and-restart a perfectly fine process just because Postgres hiccuped
  // (the readiness probe, not liveness, is what should pull it out of rotation for that).
  app.get('/healthz', async () => ({ status: 'ok' }));
  app.get('/readyz', async (_req, reply) => readiness(reply));
  // T69 review-1 #5 (unchanged contract): /health reports temporal reachability, now also
  // reporting 503 while draining (same readiness semantics /readyz exposes under a new path).
  app.get('/health', async (_req, reply) => readiness(reply));

  // T69 review-1 #4: read-only divergence check, exposed so an operator (or a future CLI) can
  // inspect reconciliation state without a direct DB connection. Never writes.
  // T69 review-2 HIGH: never anonymous. Bearer token from the same issuer + `org` claim as the team MCP server
  // (oauth.ts / mcpServer.ts, OAuth 2.1 bearer per the MCP 2025-06-18 auth spec); a token for another org gets 404
  // (never confirms the org exists, never returns its ids -- OWASP API1:2023 BOLA). No MOLE_AUTH_SECRET = closed (401).
  const authIssuer = env.MOLE_AUTH_SECRET ? createTestIssuer(env.MOLE_AUTH_SECRET) : undefined;
  app.get('/reconcile/:orgId', async (req, reply) => {
    const { orgId } = req.params as { orgId: string };
    const header = String(req.headers.authorization ?? '');
    const token = /^Bearer\s+(.+)$/i.exec(header)?.[1];
    if (!authIssuer || !token) return reply.code(401).send({ error: 'unauthorized' });
    let caller: string;
    try {
      caller = (await authIssuer.verifyToken(token)).org;
    } catch {
      return reply.code(401).send({ error: 'unauthorized' });
    }
    if (caller !== orgId) return reply.code(404).send({ error: 'not found' });
    return reconcileDecisions(pool, temporalPool, orgId);
  });


  // Fastify's default JSON parser consumes and re-serializes the body; HMAC verification
  // needs the exact raw bytes GitHub signed (R0 prior-art.md §1), so capture the raw string
  // ourselves instead of trusting req.body.
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    done(null, body);
  });

  app.post('/webhook', async (req, reply) => {
    const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    const result = await handler({ headers: req.headers as Record<string, string | undefined>, rawBody });
    reply.code(result.status).send(result.body);
  });

  // T98 server-slo gap #2: wire the outbox relay loop into the actual running server. Before
  // this, relayOutboxOnce() was reachable code with zero production callers -- every
  // check-run/notification outbox row written by a real deploy sat undelivered forever.
  const sink = opts.githubSink ?? createCheckRunSink(env);
  const relayIntervalMs = opts.outboxRelayIntervalMs ?? Number(env.OUTBOX_RELAY_INTERVAL_MS ?? DEFAULT_OUTBOX_RELAY_INTERVAL_MS);
  let outboxTimer: NodeJS.Timeout | undefined;
  if (relayIntervalMs > 0) {
    outboxTimer = setInterval(() => {
      relayOutboxOnceDetailed(pool, sink).catch((e) => {
        app.log.error({ err: e }, '[mole-server] outbox relay tick failed');
      });
    }, relayIntervalMs);
    outboxTimer.unref(); // never keep the process alive just for this timer
  }

  return {
    app,
    pool,
    boss,
    telemetry,
    temporalPool,
    /** Marks /healthz /readyz /health as draining and stops the outbox relay loop; called by
     * close()/shutdown() before anything else is torn down. */
    beginDraining() {
      shuttingDown = true;
      if (outboxTimer) clearInterval(outboxTimer);
    },
  };
}

export async function startServer(env: NodeJS.ProcessEnv = process.env, opts: BuildAppOptions = {}): Promise<ServerHandle> {
  const { app, pool, boss, telemetry, temporalPool, beginDraining } = await buildApp(env, opts);
  const port = Number(env.PORT ?? 3000);
  await app.listen({ port, host: '0.0.0.0' });
  return {
    app,
    pool,
    boss,
    temporalPool,
    telemetry,
    async close(closeOpts: CloseOptions = {}) {
      beginDraining();
      // app.close() stops accepting new connections and waits for in-flight requests/hooks
      // to finish (Fastify's documented close() contract) -- this IS the HTTP drain step of
      // the standard SIGTERM sequence (R0 server-slo prior-art.md Node graceful-shutdown
      // sources): readiness already flipped to 503 above, so a load balancer that respects
      // /readyz should already be routing new traffic elsewhere by the time this resolves.
      await app.close();
      // pg-boss graceful stop: let any job this worker is CURRENTLY executing finish (up to
      // timeoutMs) instead of yanking the connection mid-write, which is what the T98
      // crash/restart test distinguishes from a hard kill -9 (pg-boss durability recovers
      // from that too, just via a fresh worker re-claiming the job, not via this path).
      await boss.stop({ graceful: closeOpts.graceful ?? false, timeout: closeOpts.timeoutMs ?? DEFAULT_GRACEFUL_TIMEOUT_MS });
      await pool.end();
      await temporalPool.end();
      await telemetry.shutdown().catch(() => undefined);
    },
  };
}

// Only auto-start when run directly (`node dist/src/index.js`, the Dockerfile CMD target),
// never on import (bench/test files never import this module, but keep the guard honest).
// Comparing raw import.meta.url to a bare `file://${argv[1]}` string breaks whenever the
// checkout path contains characters import.meta.url percent-encodes (e.g. a space) — found
// during final-build wiring verification, 2026-10-30: the server silently did nothing under
// `node dist/src/index.js` in this very checkout. pathToFileURL() produces the same encoding
// import.meta.url uses, so the comparison is correct regardless of the path's characters.
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  startServer()
    .then((handle) => {
      // T98 server-slo gap #1: this process previously had ZERO signal handlers, so SIGTERM
      // (what every orchestrator sends for a normal stop/rolling-deploy) fell through to
      // Node's default handling -- immediate exit, no drain, no chance for an in-flight
      // webhook ack or job write to finish. Registered only here (never inside
      // startServer/buildApp itself) so tests that call those functions in-process never
      // attach a listener to the actual test-runner process.
      let shuttingDown = false;
      const GRACE_MS = Number(process.env.MOLE_SHUTDOWN_GRACE_MS ?? 20_000);
      const shutdown = (signal: string) => {
        if (shuttingDown) {
          console.error(`[mole-server] second ${signal}, exiting immediately`);
          process.exit(1);
          return;
        }
        shuttingDown = true;
        console.error(`[mole-server] ${signal} received, draining (grace ${GRACE_MS}ms)`);
        const forceExit = setTimeout(() => {
          console.error('[mole-server] graceful shutdown exceeded grace period, forcing exit');
          process.exit(1);
        }, GRACE_MS);
        forceExit.unref();
        handle
          .close({ graceful: true, timeoutMs: GRACE_MS })
          .then(() => {
            clearTimeout(forceExit);
            process.exit(0);
          })
          .catch((e) => {
            console.error('[mole-server] error during graceful shutdown:', e);
            process.exit(1);
          });
      };
      process.on('SIGTERM', () => shutdown('SIGTERM'));
      process.on('SIGINT', () => shutdown('SIGINT'));
    })
    .catch((err) => {
      console.error('[mole-server] failed to start:', err);
      process.exit(1);
    });
}
