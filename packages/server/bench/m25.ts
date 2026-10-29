// T33 M25 bench: team server replay + leaks + latency (R1 frozen shape; logic may only
// be fixed to call the real implementation, never loosened — R7).
import { performance } from 'node:perf_hooks';
import { appendFileSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import key from './key.json' with { type: 'json' };
import { buildFixtureRepo, buildDeliveries, type FixtureOrg } from './fixtures.js';
import { createPool, runMigrations, closePool } from '../src/db.js';
import { createQueue, closeQueue } from '../src/queue.js';
import { createWebhookHandler } from '../src/webhook.js';
import { startFakeGithubApi } from '../src/fakeGithub.js';
import { relayOutboxOnce } from '../src/outbox.js';
import { rebuildIndexFromGit, snapshotHash } from '../src/rebuild.js';
import { getGoverningDecisions } from '../src/graph.js';
import { computeCheckRun } from '../src/checkrun.js';
import { createTestIssuer } from '../src/oauth.js';
import { createMcpHttpServer } from '../src/mcpServer.js';
import { initTelemetry } from '../src/telemetry.js';
import { appendRunsJsonl, writeMlflowRun } from '../src/mlflow.js';

const WEBHOOK_SECRET = 'bench-secret-2026-10-29';
const RUNS_PATH = path.resolve(import.meta.dirname, '..', '..', '..', 'tasks', 'T33-team-server', '4 log', 'runs.jsonl');

async function main() {
  const telemetry = initTelemetry();
  const dbUrl = process.env.M25_DATABASE_URL || process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error('M25 bench needs M25_DATABASE_URL (local pg_ctl instance, never Docker)');
  }
  const pool = createPool(dbUrl);
  await runMigrations(pool);
  const boss = await createQueue(dbUrl);
  const fakeGithub = await startFakeGithubApi();

  // --- build fixture orgs + repos (real git history; .mole/ is source of truth) ---
  const orgs: FixtureOrg[] = (key as any).orgs.map((o: any) => {
    const { dir, commits } = buildFixtureRepo(o.id, (key as any).distinctCommits);
    return { id: o.id, name: o.name, repoDir: dir, commits };
  });
  for (const org of orgs) {
    await pool.query('insert into orgs(id, name) values ($1,$2) on conflict (id) do nothing', [org.id, org.name]);
  }

  const handler = createWebhookHandler({ secret: WEBHOOK_SECRET, pool, boss, orgRepoDirs: Object.fromEntries(orgs.map((o) => [o.id, o.repoDir])) });

  // --- replay 1000 deliveries, 10% duplicates, shuffled ---
  const deliveries = buildDeliveries(orgs, WEBHOOK_SECRET);
  const ackTimes: number[] = [];
  const results: { deliveryId: string; status: number; dup: boolean }[] = [];
  for (const d of deliveries) {
    const t0 = performance.now();
    const res = await handler({
      headers: {
        'x-hub-signature-256': d.signature,
        'x-github-delivery': d.deliveryId,
        'x-github-event': d.event,
      },
      rawBody: d.rawBody,
    });
    ackTimes.push(performance.now() - t0);
    results.push({ deliveryId: d.deliveryId, status: res.status, dup: res.body?.status === 'duplicate' });
  }
  ackTimes.sort((a, b) => a - b);
  const ackP95 = ackTimes[Math.floor(ackTimes.length * 0.95)] ?? 0;

  // drain the queue: rebuild-index jobs + compute-check-run jobs
  await boss.work('rebuild-index', { batchSize: 10 }, async (jobs) => {
    for (const job of jobs) {
      const { orgId, ref } = job.data as any;
      await rebuildIndexFromGit(pool, orgId, orgs.find((o) => o.id === orgId)!.repoDir, ref, telemetry);
    }
  });
  await boss.work('compute-check-run', { batchSize: 10 }, async (jobs) => {
    for (const job of jobs) {
      const { orgId, ref } = job.data as any;
      const org = orgs.find((o) => o.id === orgId)!;
      const t0 = performance.now();
      const result = await computeCheckRun(pool, orgId, org.repoDir, ref, telemetry);
      const ms = performance.now() - t0;
      checkRunTimes.push(ms);
      await fakeGithub.postCheckRun(orgId, ref, result);
    }
  });
  const checkRunTimes: number[] = [];
  // wait for queue to drain
  await new Promise((r) => setTimeout(r, 1500));

  // relay outbox (transactional outbox -> fake GitHub API)
  let relayed = 0;
  for (let i = 0; i < 20; i++) {
    const n = await relayOutboxOnce(pool, fakeGithub);
    relayed += n;
    if (n === 0) break;
  }
  const lostNotifications = await pool.query('select count(*)::int as c from outbox where delivered_at is null');

  // duplicate-effects check: count distinct index writes per commit sha == 1 effect, even
  // if delivered N times (idempotent by commit sha).
  const dupEffectRows = await pool.query(
    `select commit_sha, count(*) as n from index_rebuild_log group by commit_sha having count(*) > 1`
  );

  // --- index == rebuild-from-git ---
  let indexMismatches = 0;
  for (const org of orgs) {
    const head = org.commits[org.commits.length - 1]!;
    const live = await snapshotHash(pool, org.id);
    const fresh = await rebuildIndexFromGit(pool, `${org.id}-shadow`, org.repoDir, head, telemetry, { shadow: true });
    if (live !== fresh) indexMismatches++;
  }

  // --- permission leak test ---
  const leak = (key as any).permissionLeak;
  const targetFile = `src/${leak.targetOrg}-file0.ts`;
  const leakRows = await getGoverningDecisions(pool, leak.viewerOrg, targetFile, { forOrg: leak.targetOrg });
  const leakedRecords = leakRows.length;

  // --- MCP leak test over streamable HTTP with OAuth 2.1 bearer ---
  const issuer = createTestIssuer();
  const mcp = await createMcpHttpServer({ pool, issuer });
  const tokenForB = await issuer.mintToken(leak.viewerOrg);
  const mcpLeakRows = await mcp.callToolAsOrg(tokenForB, 'governing_decisions', { org: leak.targetOrg, file: targetFile });

  await mcp.close();
  await fakeGithub.close();
  await closeQueue(boss);
  await closePool(pool);

  const metrics = {
    M25: {
      deliveries_replayed: deliveries.length,
      duplicate_rate_actual: deliveries.filter((d, i) => deliveries.findIndex((x) => x.deliveryId === d.deliveryId) !== i).length / deliveries.length,
      duplicate_effects: dupEffectRows.rows.length,
      index_mismatches: indexMismatches,
      lost_notifications: Number(lostNotifications.rows[0].c),
      outbox_relayed: relayed,
      leaked_records_api: leakedRecords,
      leaked_records_mcp: mcpLeakRows.length,
      ack_p95_ms: Number(ackP95.toFixed(2)),
      check_run_compute_ms_max: checkRunTimes.length ? Math.max(...checkRunTimes) : null,
      check_run_runs: checkRunTimes.length,
      target: {
        duplicate_effects: 0,
        index_mismatches: 0,
        lost_notifications: 0,
        leaked_records: 0,
        ack_p95_ms_lt: 1000,
        check_run_compute_ms_lt: 60000,
      },
    },
  };

  const pass =
    metrics.M25.duplicate_effects === 0 &&
    metrics.M25.index_mismatches === 0 &&
    metrics.M25.lost_notifications === 0 &&
    metrics.M25.leaked_records_api === 0 &&
    metrics.M25.leaked_records_mcp === 0 &&
    metrics.M25.ack_p95_ms < 1000 &&
    (metrics.M25.check_run_compute_ms_max === null || metrics.M25.check_run_compute_ms_max < 60000);

  console.log(JSON.stringify(metrics, null, 2));
  console.log(pass ? 'M25 PASS' : 'M25 FAIL');

  mkdirSync(path.dirname(RUNS_PATH), { recursive: true });
  appendFileSync(
    RUNS_PATH,
    JSON.stringify({ time: new Date().toISOString(), commit: process.env.M25_COMMIT || 'unknown', cmd: 'node packages/server/dist/bench/m25.js', exit: pass ? 0 : 1, metrics }) + '\n'
  );
  writeMlflowRun(path.resolve(import.meta.dirname, '..', '..', '..', 'tasks', 'T33-team-server', '4 log', 'mlruns'), {
    experiment: 'T33-m25',
    params: { seed: String((key as any).seed), deliveries: String(deliveries.length) },
    metrics: flattenMetrics(metrics.M25),
  });

  for (const org of orgs) rmSync(org.repoDir, { recursive: true, force: true });
  process.exitCode = pass ? 0 : 1;
}

function flattenMetrics(obj: Record<string, unknown>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'number') out[k] = v;
  }
  return out;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
