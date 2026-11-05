// T103: Prometheus `/metrics` (docs/server-slo.md "Found, not fixed" #4). Proves (1) the route
// returns real Prometheus text-format exposition that a scraper can parse, and (2) the counters
// actually move after a real HTTP request and a real job completion -- not just that the route
// exists.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/index.js';
import { closePool, type Pool } from '../src/db.js';
import type { Boss } from '../src/queue.js';
import type { Pool as TemporalPool } from 'pg';
import type { FastifyInstance } from 'fastify';
import type { Metrics } from '../src/metrics.js';

const dbUrl = process.env.M25_DATABASE_URL;

/** Minimal Prometheus text-exposition-format parser (the OpenMetrics/Prometheus 0.0.4 format
 * `getMetricsRequestHandler` emits): enough to read a sample's value by metric name + label
 * substring, without pulling in a parsing dependency this package doesn't otherwise need. */
function parsePrometheusSamples(text: string): { name: string; labels: string; value: number }[] {
  const samples: { name: string; labels: string; value: number }[] = [];
  for (const line of text.split('\n')) {
    if (!line || line.startsWith('#')) continue;
    const m = /^([a-zA-Z_:][a-zA-Z0-9_:]*)(\{[^}]*\})?\s+(\S+)$/.exec(line.trim());
    if (!m) continue;
    const value = Number(m[3]);
    if (Number.isNaN(value)) continue;
    samples.push({ name: m[1]!, labels: m[2] ?? '', value });
  }
  return samples;
}

function sampleValue(samples: ReturnType<typeof parsePrometheusSamples>, name: string, labelSubstr: string): number | undefined {
  return samples.find((s) => s.name === name && s.labels.includes(labelSubstr))?.value;
}

describe('/metrics (T103 Prometheus endpoint)', () => {
  let pool: Pool;
  let boss: Boss;
  let temporalPool: TemporalPool;
  let app: FastifyInstance;
  let metrics: Metrics;

  beforeAll(async () => {
    if (!dbUrl) return;
    const built = await buildApp(
      { DATABASE_URL: dbUrl, WEBHOOK_SECRET: 'metrics-secret', ORG_REPO_DIRS: '{}' } as NodeJS.ProcessEnv,
      { outboxRelayIntervalMs: 0 }
    );
    pool = built.pool;
    boss = built.boss;
    temporalPool = built.temporalPool;
    app = built.app;
    metrics = built.metrics;
  });

  afterAll(async () => {
    if (app) await app.close();
    if (boss) await boss.stop({ graceful: false, wait: false });
    if (pool) await closePool(pool);
    if (temporalPool) await temporalPool.end();
  });

  it.runIf(!!dbUrl)('returns 200 text/plain Prometheus exposition format that parses into real samples', async () => {
    const res = await app.inject({ method: 'GET', url: '/metrics' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/plain/);
    const samples = parsePrometheusSamples(res.body);
    expect(samples.length).toBeGreaterThan(0);
    // the prCheck pool queue depth gauge is always present (0 when the pool was never created)
    expect(samples.some((s) => s.name === 'mole_prcheck_pool_queue_depth')).toBe(true);
  });

  it.runIf(!!dbUrl)('http.server.request.duration count for a route increases after a real request to that route', async () => {
    const before = parsePrometheusSamples((await app.inject({ method: 'GET', url: '/metrics' })).body);
    const beforeCount = sampleValue(before, 'http_server_request_duration_count', 'http_route="/healthz"') ?? 0;

    await app.inject({ method: 'GET', url: '/healthz' });
    await app.inject({ method: 'GET', url: '/healthz' });

    const after = parsePrometheusSamples((await app.inject({ method: 'GET', url: '/metrics' })).body);
    const afterCount = sampleValue(after, 'http_server_request_duration_count', 'http_route="/healthz"') ?? 0;
    expect(afterCount).toBeGreaterThanOrEqual(beforeCount + 2);
  });

  it.runIf(!!dbUrl)('mole.job.count increases after a job completes (recordJob, the same call checkrun/rebuild job handlers make)', async () => {
    const before = parsePrometheusSamples((await app.inject({ method: 'GET', url: '/metrics' })).body);
    const beforeCount = sampleValue(before, 'mole_job_count_total', 'mole_job_queue="compute-check-run"') ?? 0;

    metrics.recordJob('compute-check-run', 'success', 0.42);

    const after = parsePrometheusSamples((await app.inject({ method: 'GET', url: '/metrics' })).body);
    const afterCount = sampleValue(after, 'mole_job_count_total', 'mole_job_queue="compute-check-run"') ?? 0;
    expect(afterCount).toBe(beforeCount + 1);
    // the histogram's sum also moved (duration was recorded, not just the count)
    const beforeSum = sampleValue(before, 'mole_job_duration_sum', 'mole_job_queue="compute-check-run"') ?? 0;
    const afterSum = sampleValue(after, 'mole_job_duration_sum', 'mole_job_queue="compute-check-run"') ?? 0;
    expect(afterSum).toBeGreaterThanOrEqual(beforeSum + 0.42 - 1e-9);
  });

  it.runIf(!!dbUrl)('outbox pending/dead-letter gauges are present (sampled from the real outbox table, 0 when empty)', async () => {
    const samples = parsePrometheusSamples((await app.inject({ method: 'GET', url: '/metrics' })).body);
    expect(samples.some((s) => s.name === 'mole_outbox_pending')).toBe(true);
    expect(samples.some((s) => s.name === 'mole_outbox_dead_letter')).toBe(true);
  });
});
