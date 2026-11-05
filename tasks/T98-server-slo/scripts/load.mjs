#!/usr/bin/env node
// T98 server-slo load test. Spawns the REAL compiled entrypoint (dist/src/index.js, the
// Dockerfile CMD target), against a local Postgres instance (no Docker).
//
// Load generator: hand-rolled, fixed-concurrency fetch() workers over a keep-alive agent,
// not autocannon. autocannon (8.0.0) was tried first (R0 server-slo prior-art.md cites it as
// standard prior art); its setupRequest-based per-request header/body mutation produced
// spurious 100% HMAC-signature failures in this environment that a plain fetch() loop with
// an IDENTICAL signature/body does not reproduce (reproduced 3x; root cause not fully
// isolated -- suspected interaction between its Content-Length recomputation path,
// lib/httpRequestBuilder.js, and this version's handling of a fixed top-level `body` --
// logged here rather than spending further budget on an upstream library's bug). This
// generator is simple enough to read start to finish; percentiles are computed from raw
// sorted latency samples, same definition autocannon itself documents (p50/p95/p99 of
// per-request latency).
//
// Three phases, each against its own short-lived server process so one phase's queue
// backlog never contaminates another phase's latency numbers:
//  1. webhook intake ACK latency/throughput -- the path GitHub's own webhook best-practices
//     doc gives a 10s budget for (verify -> dedupe -> enqueue, never waits on the queue).
//  2. decisions-query latency/throughput (/reconcile/:orgId, real bearer token), on a FRESH
//     server with zero webhook backlog, so this measures the read path cleanly.
//  3. queue-drain throughput: enqueue a small, FIXED number of real webhook deliveries, then
//     measure wall-clock time for the queue to fully drain. src/rebuild.ts/checkrun.ts call
//     execFileSync('git', ...) synchronously, several times per job, blocking Node's single
//     event-loop thread for each call's duration -- this phase measures the real, bounded
//     throughput ceiling that shape imposes (a found, not-fixed-here SLO risk; see
//     docs/server-slo.md).
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import net from 'node:net';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { SignJWT } from 'jose';
import pg from 'pg';

const here = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(here, '..', '..', '..', 'packages', 'server');
const distEntry = path.join(serverRoot, 'dist', 'src', 'index.js');
const fixturesPath = path.join(serverRoot, 'dist', 'bench', 'fixtures.js');
const outDir = path.resolve(here, '..', '4 log');
mkdirSync(outDir, { recursive: true });

const dbUrl = process.env.M25_DATABASE_URL;
if (!dbUrl) {
  console.error('M25_DATABASE_URL is required (local Postgres, see tasks/T33-team-server/2 insights.md)');
  process.exit(1);
}

function machineSpecs() {
  const cpus = os.cpus();
  return {
    platform: os.platform(),
    arch: os.arch(),
    cpuModel: cpus[0]?.model ?? 'unknown',
    cpuCount: cpus.length,
    totalMemGiB: Number((os.totalmem() / 1024 ** 3).toFixed(1)),
    nodeVersion: process.version,
    loadavgBefore: os.loadavg(),
  };
}

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const p = srv.address().port;
      srv.close(() => resolve(p));
    });
    srv.on('error', reject);
  });
}

async function waitForHealthz(port, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/healthz`);
      if (res.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('server never became healthy');
}

function sign(secret, body) {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
}

async function startServer({ orgId, repoDir, secret, authSecret, checkRunSinkUrl }) {
  const port = await freePort();
  const env = {
    ...process.env,
    DATABASE_URL: dbUrl,
    WEBHOOK_SECRET: secret,
    ORG_REPO_DIRS: JSON.stringify({ [orgId]: repoDir }),
    PORT: String(port),
    OUTBOX_RELAY_INTERVAL_MS: '0',
  };
  if (authSecret) env.MOLE_AUTH_SECRET = authSecret;
  if (checkRunSinkUrl) env.MOLE_CHECKRUN_WEBHOOK_URL = checkRunSinkUrl;
  const child = spawn(process.execPath, [distEntry], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (d) => (stderr += d.toString()));
  await waitForHealthz(port);
  return { child, port, getStderr: () => stderr };
}

function percentile(sortedMs, p) {
  if (sortedMs.length === 0) return null;
  const idx = Math.min(sortedMs.length - 1, Math.floor(sortedMs.length * p));
  return Number(sortedMs[idx].toFixed(2));
}

/** Fixed-concurrency, fixed-duration load generator (see file header for why not autocannon). */
async function runLoad({ connections, durationSec, makeRequest }) {
  const deadline = Date.now() + durationSec * 1000;
  const latenciesMs = [];
  const statusCounts = {};
  let errors = 0;

  async function worker() {
    while (Date.now() < deadline) {
      const { url, options } = makeRequest();
      const t0 = performance.now();
      try {
        const res = await fetch(url, options);
        await res.arrayBuffer(); // drain the body so keep-alive sockets are reusable
        latenciesMs.push(performance.now() - t0);
        statusCounts[res.status] = (statusCounts[res.status] ?? 0) + 1;
      } catch (e) {
        errors++;
      }
    }
  }

  const t0 = Date.now();
  await Promise.all(Array.from({ length: connections }, () => worker()));
  const wallMs = Date.now() - t0;
  latenciesMs.sort((a, b) => a - b);
  return {
    requestsTotal: latenciesMs.length + errors,
    throughputReqPerSec: Number((latenciesMs.length / (wallMs / 1000)).toFixed(2)),
    latencyMs: {
      p50: percentile(latenciesMs, 0.5),
      p95: percentile(latenciesMs, 0.95),
      p99: percentile(latenciesMs, 0.99),
      max: latenciesMs.length ? Number(latenciesMs[latenciesMs.length - 1].toFixed(2)) : null,
      mean: latenciesMs.length ? Number((latenciesMs.reduce((a, b) => a + b, 0) / latenciesMs.length).toFixed(3)) : null,
    },
    errors,
    statusCounts,
  };
}

function summarize(name, extra, result) {
  return { endpoint: name, ...extra, ...result };
}

async function main() {
  const { buildFixtureRepo } = await import(fixturesPath);
  const durationSec = Number(process.env.LOAD_DURATION_S ?? 10);
  const connections = Number(process.env.LOAD_CONNECTIONS ?? 10);
  const drainJobCount = Number(process.env.LOAD_DRAIN_JOBS ?? 15);

  const report = { generatedAt: new Date().toISOString(), machine: machineSpecs() };

  // ---- Phase 1: webhook intake ACK latency/throughput ----
  {
    const orgId = 'org-load-ack-' + Date.now();
    const fixture = buildFixtureRepo(orgId, 20);
    const head = fixture.commits[fixture.commits.length - 1];
    const secret = 'load-ack-secret';
    const { child, port } = await startServer({ orgId, repoDir: fixture.dir, secret });
    const pool = new pg.Pool({ connectionString: dbUrl });
    await pool.query('insert into orgs(id, name) values ($1,$2) on conflict (id) do nothing', [orgId, 'Load ack org']);

    console.error(`[load] phase 1/3: webhook ACK, ${connections} connections x ${durationSec}s`);
    const payload = JSON.stringify({ ref: 'refs/heads/main', after: head, repository: { full_name: `${orgId}/repo`, owner: { login: orgId } } });
    const sig = sign(secret, payload);
    let deliverySeq = 0;
    const result = await runLoad({
      connections,
      durationSec,
      makeRequest: () => ({
        url: `http://127.0.0.1:${port}/webhook`,
        options: {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-hub-signature-256': sig,
            'x-github-delivery': `load-ack-${orgId}-` + deliverySeq++,
            'x-github-event': 'push',
          },
          body: payload,
        },
      }),
    });
    report.webhookAck = summarize('POST /webhook (ack-only, intake path)', { durationSec, connections }, result);

    // Hard kill, never a graceful drain: this run intentionally leaves a job backlog (every
    // unique delivery enqueued 2 real jobs) -- draining it is Phase 3's own, bounded
    // measurement, not something to wait out here.
    child.kill('SIGKILL');
    await pool.end();
    rmSync(fixture.dir, { recursive: true, force: true });
  }

  // ---- Phase 2: decisions-query (/reconcile) latency/throughput, zero webhook backlog ----
  {
    const orgId = 'org-load-query-' + Date.now();
    const fixture = buildFixtureRepo(orgId, 20);
    const head = fixture.commits[fixture.commits.length - 1];
    const secret = 'load-query-secret';
    const authSecret = 'load-query-auth-secret';
    // Same cross-phase queue-contention cleanup as Phase 3 (see its comment): without this,
    // Phase 1's leftover backlog can delay this phase's own seed job past its 12s wait below.
    const prePool2 = new pg.Pool({ connectionString: dbUrl });
    await prePool2.query("delete from pgboss.job where state != 'completed'");
    await prePool2.end();
    const { child, port } = await startServer({ orgId, repoDir: fixture.dir, secret, authSecret });
    const pool = new pg.Pool({ connectionString: dbUrl });
    await pool.query('insert into orgs(id, name) values ($1,$2) on conflict (id) do nothing', [orgId, 'Load query org']);

    // Populate a real index for this org to query against (one real webhook + a bounded wait
    // for its own job, not a load burst) so /reconcile has real decision rows to compare.
    const payload = JSON.stringify({ ref: 'refs/heads/main', after: head, repository: { full_name: `${orgId}/repo`, owner: { login: orgId } } });
    await fetch(`http://127.0.0.1:${port}/webhook`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-hub-signature-256': sign(secret, payload), 'x-github-delivery': `load-query-seed-${orgId}`, 'x-github-event': 'push' },
      body: payload,
    });
    for (let i = 0; i < 40; i++) {
      const { rows } = await pool.query('select count(*)::int as c from nodes where org_id = $1', [orgId]);
      if (rows[0].c > 0) break;
      await new Promise((r) => setTimeout(r, 300));
    }

    const token = await new SignJWT({ org: orgId, scopes: ['mole:read'] })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setIssuer('mole-local-test-issuer')
      .setExpirationTime('30m')
      .sign(new TextEncoder().encode(authSecret));

    console.error(`[load] phase 2/3: decisions query (/reconcile), ${connections} connections x ${durationSec}s`);
    const result = await runLoad({
      connections,
      durationSec,
      makeRequest: () => ({
        url: `http://127.0.0.1:${port}/reconcile/${orgId}`,
        options: { method: 'GET', headers: { authorization: `Bearer ${token}` } },
      }),
    });
    report.decisionsQuery = summarize('GET /reconcile/:orgId (decisions query, reads temporal + graph index)', { durationSec, connections }, result);

    child.kill('SIGKILL');
    await pool.end();
    rmSync(fixture.dir, { recursive: true, force: true });
  }

  // ---- Phase 3: bounded queue-drain throughput (the synchronous-git-processing finding) ----
  {
    const orgId = 'org-load-drain-' + Date.now();
    const fixture = buildFixtureRepo(orgId, 20);
    const head = fixture.commits[fixture.commits.length - 1];
    const secret = 'load-drain-secret';
    const received = [];
    const sinkServer = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        received.push(body.length);
        res.writeHead(201, { 'content-type': 'application/json' });
        res.end('{"ok":true}');
      });
    });
    const sinkPort = await freePort();
    await new Promise((resolve) => sinkServer.listen(sinkPort, '127.0.0.1', resolve));

    // Finding (documented in docs/server-slo.md): pg-boss queue names ('rebuild-index',
    // 'compute-check-run') are GLOBAL to the Postgres instance, not scoped to a server
    // process or its known orgs. Phase 1's heavy ACK load enqueues many real jobs for an org
    // whose process is then SIGKILLed before draining them; left alone, THIS phase's own
    // fresh server would otherwise spend its worker capacity retrying/failing every one of
    // those ("no repo dir configured for org <phase-1's org>") before ever reaching its own
    // jobs -- exactly the kind of cross-tenant job-queue contention a real multi-org
    // deployment sharing one pg-boss schema could hit after a crash/redeploy. This test's own
    // pre-phase cleanup isolates the MEASUREMENT; it does not fix the underlying gap.
    const prePool = new pg.Pool({ connectionString: dbUrl });
    await prePool.query("delete from pgboss.job where state != 'completed'");
    await prePool.end();

    const { child, port } = await startServer({ orgId, repoDir: fixture.dir, secret, checkRunSinkUrl: `http://127.0.0.1:${sinkPort}` });
    const pool = new pg.Pool({ connectionString: dbUrl });
    await pool.query('insert into orgs(id, name) values ($1,$2) on conflict (id) do nothing', [orgId, 'Load drain org']);

    console.error(`[load] phase 3/3: enqueueing ${drainJobCount} real webhook deliveries, then timing the drain`);
    const t0 = Date.now();
    const deliveryIds = [];
    for (let i = 0; i < drainJobCount; i++) {
      // Distinct commit per delivery (not the same `head` repeated): the outbox has a unique
      // (org_id, kind, ref) index (db.ts), so identical refs collapse into ONE row by design
      // (idempotent "0 duplicate effects") -- using the same ref for all N deliveries would
      // make this phase's own measurement query always see at most 1 row, not N. Ground truth
      // for "job done" is the pg-boss job table itself (state = 'completed'), not outbox rows.
      const ref = fixture.commits[i % fixture.commits.length];
      const deliveryId = `load-drain-${orgId}-${i}`;
      deliveryIds.push(deliveryId);
      const payload = JSON.stringify({ ref: 'refs/heads/main', after: ref, repository: { full_name: `${orgId}/repo`, owner: { login: orgId } } });
      await fetch(`http://127.0.0.1:${port}/webhook`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-hub-signature-256': sign(secret, payload), 'x-github-delivery': deliveryId, 'x-github-event': 'push' },
        body: payload,
      });
    }
    const enqueueMs = Date.now() - t0;

    const t1 = Date.now();
    let completedJobs = 0;
    const wantJobs = drainJobCount * 2; // rebuild-index + compute-check-run per delivery
    for (let i = 0; i < 400; i++) {
      const { rows } = await pool.query(
        "select count(*)::int as c from pgboss.job where data->>'orgId' = $1 and name in ('rebuild-index','compute-check-run') and state = 'completed'",
        [orgId]
      );
      completedJobs = rows[0].c;
      if (completedJobs >= wantJobs) break;
      await new Promise((r) => setTimeout(r, 250));
    }
    const drainMs = Date.now() - t1;
    const jobsPerSec = completedJobs > 0 ? Number((completedJobs / (drainMs / 1000)).toFixed(2)) : 0;

    report.queueDrain = {
      jobsEnqueued: drainJobCount,
      jobUnitsExpected: wantJobs,
      enqueueMs,
      jobUnitsCompleted: completedJobs,
      drainMs,
      jobUnitsPerSec: jobsPerSec,
      note:
        'rebuild.ts/checkrun.ts call execFileSync for every git read; each job does several ' +
        'synchronous git subprocess calls that block the Node event loop for their duration. ' +
        'This throughput number is bounded by that, not by Postgres or the HTTP layer.',
    };

    child.kill('SIGKILL');
    await pool.end();
    await new Promise((r) => sinkServer.close(r));
    rmSync(fixture.dir, { recursive: true, force: true });
  }

  report.machine.loadavgAfter = os.loadavg();
  writeFileSync(path.join(outDir, 'load-raw.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

setTimeout(() => {
  console.error('[load] safety timeout exceeded, forcing exit');
  process.exit(1);
}, (Number(process.env.LOAD_DURATION_S ?? 10) * 3 + 120) * 1000).unref();
