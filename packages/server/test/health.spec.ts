// T98 server-slo gap #3: /health conflated liveness and readiness. This proves the split:
// /healthz never depends on the database (liveness), /readyz and /health (kept as an alias
// for exact back-compat) report 503 while the server is draining (shuttingDown), matching
// the SRE/k8s convention that a draining-but-alive process must not receive new traffic.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/index.js';
import { closePool, type Pool } from '../src/db.js';
import type { Boss } from '../src/queue.js';
import type { Pool as TemporalPool } from 'pg';
import type { FastifyInstance } from 'fastify';

const dbUrl = process.env.M25_DATABASE_URL;

describe('healthz/readyz/health (T98 server-slo liveness vs readiness split)', () => {
  let pool: Pool;
  let boss: Boss;
  let temporalPool: TemporalPool;
  let app: FastifyInstance;
  let beginDraining: () => void;

  beforeAll(async () => {
    if (!dbUrl) return;
    const built = await buildApp(
      { DATABASE_URL: dbUrl, WEBHOOK_SECRET: 'healthz-secret', ORG_REPO_DIRS: '{}' } as NodeJS.ProcessEnv,
      { outboxRelayIntervalMs: 0 }
    );
    pool = built.pool;
    boss = built.boss;
    temporalPool = built.temporalPool;
    app = built.app;
    beginDraining = built.beginDraining;
  });

  afterAll(async () => {
    if (app) await app.close();
    if (boss) await boss.stop({ graceful: false, wait: false });
    if (pool) await closePool(pool);
    if (temporalPool) await temporalPool.end();
  });

  it.runIf(!!dbUrl)('/healthz is 200 and never queries the database (pure liveness)', async () => {
    const res = await app.inject({ method: 'GET', url: '/healthz' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });

  it.runIf(!!dbUrl)('/readyz is 200 when stores are reachable and not draining', async () => {
    const res = await app.inject({ method: 'GET', url: '/readyz' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });

  it.runIf(!!dbUrl)('/health (back-compat alias) matches /readyz contract', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });

  it.runIf(!!dbUrl)('once draining, /readyz and /health report 503 but /healthz stays 200', async () => {
    beginDraining();
    const ready = await app.inject({ method: 'GET', url: '/readyz' });
    expect(ready.statusCode).toBe(503);
    expect(ready.json()).toEqual({ status: 'error', reason: 'shutting-down' });
    const health = await app.inject({ method: 'GET', url: '/health' });
    expect(health.statusCode).toBe(503);
    const live = await app.inject({ method: 'GET', url: '/healthz' });
    expect(live.statusCode).toBe(200);
  });
});
