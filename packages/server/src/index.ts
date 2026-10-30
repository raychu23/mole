// Production HTTP entrypoint (review round 1 P1 #3). Previously this file was just a list of
// bare re-exports: `node dist/src/index.js` imported it, executed nothing, and exited
// immediately — not a runnable "GitHub App backend" despite deploy/Dockerfile's CMD claiming
// to start one. This now binds a real Fastify app: the webhook route (verify -> dedupe ->
// enqueue, src/webhook.ts) plus a health check, so the process stays up and serves traffic.
//
// Library consumers (bench/, test/) should keep importing individual modules directly
// (./webhook.js, ./db.js, ...), as they already do — or import everything from ./lib.js.
import { pathToFileURL } from 'node:url';
import Fastify from 'fastify';
import { createPool, runMigrations } from './db.js';
import { createQueue } from './queue.js';
import { createWebhookHandler } from './webhook.js';
import { initTelemetry } from './telemetry.js';
import { rebuildIndexFromGit } from './rebuild.js';
import { computeCheckRun } from './checkrun.js';

export interface ServerHandle {
  close(): Promise<void>;
}

/** Builds (but does not start listening on) the server, for tests/callers that want the app
 * object without binding a port. */
export async function buildApp(env: NodeJS.ProcessEnv = process.env) {
  const dbUrl = env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL is required to start the Mole team server');
  const secret = env.WEBHOOK_SECRET;
  if (!secret) throw new Error('WEBHOOK_SECRET is required to start the Mole team server');
  // org id -> local git repo dir standing in for "the repo GitHub would push from" (no real
  // GitHub App registration in Mole, per the task's non-goals); configured per deploy.
  const orgRepoDirs: Record<string, string> = env.ORG_REPO_DIRS ? JSON.parse(env.ORG_REPO_DIRS) : {};

  const telemetry = initTelemetry('mole-team-server');
  const pool = createPool(dbUrl);
  await runMigrations(pool);
  const boss = await createQueue(dbUrl);
  const handler = createWebhookHandler({ secret, pool, boss, orgRepoDirs, telemetry });

  // Wire the jobs enqueued by the webhook handler to real workers: without this, a running
  // server ack'd every push (202 queued) but nothing ever drained rebuild-index /
  // compute-check-run, so the index + outbox/check-run rows the whole product depends on
  // never got written outside of bench/m25.ts's own copy of this same registration (found
  // during final-build wiring verification, 2026-10-30). batchSize: 1 on rebuild-index
  // matches bench/m25.ts's own reasoning: pg-boss resolves/fails a whole batch as one unit.
  await boss.work('rebuild-index', { batchSize: 1 }, async (jobs) => {
    for (const job of jobs) {
      const { orgId, ref } = job.data as { orgId: string; ref: string };
      const repoDir = orgRepoDirs[orgId];
      if (!repoDir) throw new Error(`no repo dir configured for org ${orgId}`);
      await rebuildIndexFromGit(pool, orgId, repoDir, ref, telemetry);
    }
  });
  await boss.work('compute-check-run', { batchSize: 10 }, async (jobs) => {
    for (const job of jobs) {
      const { orgId, ref } = job.data as { orgId: string; ref: string };
      const repoDir = orgRepoDirs[orgId];
      if (!repoDir) throw new Error(`no repo dir configured for org ${orgId}`);
      await computeCheckRun(pool, orgId, repoDir, ref, telemetry);
    }
  });

  const app = Fastify({ logger: true });

  app.get('/health', async () => ({ status: 'ok' }));

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

  return { app, pool, boss, telemetry };
}

export async function startServer(env: NodeJS.ProcessEnv = process.env): Promise<ServerHandle> {
  const { app, pool, boss, telemetry } = await buildApp(env);
  const port = Number(env.PORT ?? 3000);
  await app.listen({ port, host: '0.0.0.0' });
  return {
    async close() {
      await app.close();
      await boss.stop({ graceful: false, wait: false });
      await pool.end();
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
  startServer().catch((err) => {
    console.error('[mole-server] failed to start:', err);
    process.exit(1);
  });
}
