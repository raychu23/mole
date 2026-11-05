// T103: Prometheus `/metrics` (docs/server-slo.md "Found, not fixed" #4 -- "no /metrics").
//
// Picked OpenTelemetry metrics (@opentelemetry/sdk-metrics) + @opentelemetry/exporter-prometheus
// over prom-client because it fits this package's EXISTING OTel setup exactly, not alongside it:
// telemetry.ts already uses @opentelemetry/sdk-trace + @opentelemetry/resources +
// @opentelemetry/semantic-conventions (all already dependencies here), and this repo's installed
// @opentelemetry/sdk-metrics is 3.0.0 (checked: `node_modules/@opentelemetry/sdk-metrics/package.json`,
// already present as a transitive dep of other OTel packages) -- @opentelemetry/exporter-prometheus
// 0.300.0 (npm registry, fetched 2026-11-05) declares peer/dependency versions
// (`@opentelemetry/api: >=1.10.0 <1.11.0`, `@opentelemetry/sdk-metrics: 3.0.0`,
// `@opentelemetry/resources: 3.0.0`, `@opentelemetry/semantic-conventions: ^1.29.0`) that match
// this package's installed versions exactly (api ^1.10.0, sdk-trace/resources ^3.0.0,
// semantic-conventions ^1.44.0) -- no version-skew risk. prom-client (the other standard choice)
// would duplicate span/metric concepts this package already gets from OTel's own API (same
// Resource, same semconv constants used by telemetry.ts) and adds a second, unrelated metrics
// model alongside the existing tracer. The histogram/gauge/counter metric NAMES below follow
// OpenTelemetry's own HTTP semantic conventions (github.com/open-telemetry/semantic-conventions,
// `http.server.request.duration`, stable as of v1.23.x -- the exact metric T98's own prior-art.md
// cited and did not build) via this package's installed semantic-conventions constants
// (METRIC_HTTP_SERVER_REQUEST_DURATION, ATTR_HTTP_REQUEST_METHOD, ATTR_HTTP_ROUTE,
// ATTR_HTTP_RESPONSE_STATUS_CODE).
//
// The exporter is constructed with `preventServerStart: true` (its own README/types.d.ts
// documents this): a SECOND HTTP server bound to its own port (9464 by default) would be one
// more port this already-deployed Fastify server would need opening/firewalling, and the
// scrape request would then compete with GitHub's webhook traffic for the same process's event
// loop with none of the request/connection-timeout protection index.ts already gives /webhook.
// Fastify instead gets ONE extra route (`GET /metrics`) that calls the exporter's own
// `getMetricsRequestHandler(req, res)` directly against the raw Node req/res Fastify already
// has (`reply.hijack()` tells Fastify not to also try to send a response).
import { MeterProvider } from '@opentelemetry/sdk-metrics';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { resourceFromAttributes } from '@opentelemetry/resources';
import {
  ATTR_SERVICE_NAME,
  ATTR_HTTP_REQUEST_METHOD,
  ATTR_HTTP_ROUTE,
  ATTR_HTTP_RESPONSE_STATUS_CODE,
  METRIC_HTTP_SERVER_REQUEST_DURATION,
} from '@opentelemetry/semantic-conventions';
import type { ObservableResult } from '@opentelemetry/api';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { getPrCheckPoolQueueDepth } from '@mole/decisions';
import type { Pool } from './db.js';

export type JobOutcome = 'success' | 'failure';

export interface Metrics {
  /** Record one HTTP server request's duration (seconds, OTel's own unit for this metric). */
  recordHttpDuration(durationSeconds: number, attrs: { method: string; route: string; status: number }): void;
  /** Record one background job's duration + outcome (rebuild-index / compute-check-run). */
  recordJob(queue: string, outcome: JobOutcome, durationSeconds: number): void;
  /** `GET /metrics` handler: writes the current Prometheus text-format exposition directly to
   * the raw response (the exporter's own request handler, not re-implemented here). */
  requestHandler(req: IncomingMessage, res: ServerResponse): void;
  shutdown(): Promise<void>;
}

/** Catches a DB error from an async observable-gauge callback without ever throwing out of the
 * metrics pipeline: a transient Postgres hiccup must degrade to "this sample is missing", not
 * crash metric collection (same non-fatal-failure convention computeCheckRun's prCheck catch
 * already uses in this package). */
async function safeCount(pool: Pool, sql: string): Promise<number | undefined> {
  try {
    const { rows } = await pool.query(sql);
    return Number(rows[0]?.n ?? 0);
  } catch {
    return undefined;
  }
}

export function initMetrics(pool: Pool, service = 'mole-server'): Metrics {
  const exporter = new PrometheusExporter({ preventServerStart: true });
  const provider = new MeterProvider({
    resource: resourceFromAttributes({ [ATTR_SERVICE_NAME]: service }),
    readers: [exporter],
  });
  const meter = provider.getMeter('mole-server');

  const httpDuration = meter.createHistogram(METRIC_HTTP_SERVER_REQUEST_DURATION, {
    description: 'Duration of HTTP server requests.',
    unit: 's',
  });
  const jobDuration = meter.createHistogram('mole.job.duration', {
    description: 'Duration of background jobs (rebuild-index, compute-check-run), by queue and outcome.',
    unit: 's',
  });
  const jobCount = meter.createCounter('mole.job.count', {
    description: 'Count of background jobs completed, by queue and outcome.',
  });

  // Outbox pending/dead-letter gauges: observed at scrape time (async callback), not updated on
  // every write -- the outbox table itself (outbox.ts) is the source of truth, this just samples it.
  const outboxPending = meter.createObservableGauge('mole.outbox.pending', {
    description: 'Outbox rows not yet delivered and not dead-lettered.',
  });
  outboxPending.addCallback(async (result: ObservableResult) => {
    const n = await safeCount(pool, `select count(*)::int as n from outbox where delivered_at is null and dead_letter = false`);
    if (n !== undefined) result.observe(n);
  });

  const outboxDeadLetter = meter.createObservableGauge('mole.outbox.dead_letter', {
    description: 'Outbox rows given up on after OUTBOX_RELAY_DEFAULTS.maxAttempts failed deliveries.',
  });
  outboxDeadLetter.addCallback(async (result: ObservableResult) => {
    const n = await safeCount(pool, `select count(*)::int as n from outbox where dead_letter = true`);
    if (n !== undefined) result.observe(n);
  });

  // T103 goal #2: prCheck pool queue depth -- jobs waiting for a free prCheckAsync worker, the
  // earliest-visible sign of the compute-check-run job path saturating (before p99 latency does).
  const prCheckQueueDepth = meter.createObservableGauge('mole.prcheck.pool.queue_depth', {
    description: 'Jobs queued for a free prCheckAsync worker (packages/decisions pr-check-async.ts).',
  });
  prCheckQueueDepth.addCallback((result: ObservableResult) => {
    result.observe(getPrCheckPoolQueueDepth());
  });

  return {
    recordHttpDuration(durationSeconds, attrs) {
      httpDuration.record(durationSeconds, {
        [ATTR_HTTP_REQUEST_METHOD]: attrs.method,
        [ATTR_HTTP_ROUTE]: attrs.route,
        [ATTR_HTTP_RESPONSE_STATUS_CODE]: attrs.status,
      });
    },
    recordJob(queue, outcome, durationSeconds) {
      const attrs = { 'mole.job.queue': queue, 'mole.job.outcome': outcome };
      jobDuration.record(durationSeconds, attrs);
      jobCount.add(1, attrs);
    },
    requestHandler(req, res) {
      exporter.getMetricsRequestHandler(req, res);
    },
    async shutdown() {
      await provider.shutdown();
    },
  };
}
