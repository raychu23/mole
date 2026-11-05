// T98 server-slo: "crash/restart test: kill -9 mid-queue, restart, no lost or duplicated
// job" + the SIGTERM graceful-drain path (gap #1 in src/index.ts's audit comment). These run
// against the REAL compiled entrypoint (dist/src/index.js) as a child process -- a signal
// handler registered only inside buildApp()/startServer() would be indistinguishable from
// one that never fires in-process; this is the only way to prove `node dist/src/index.js`
// itself (the actual Dockerfile CMD target) reacts to SIGTERM/SIGKILL correctly.
//
// Needs `npx tsc -b packages/server` to have been run first (dist/src/index.js must exist);
// skips cleanly (not a failure) if the compiled file is missing, same convention as the
// M25_DATABASE_URL runIf guards elsewhere in this package.
import { describe, it, expect, afterAll } from 'vitest';
import { spawn } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { buildFixtureRepo } from '../bench/fixtures.js';
import { createPool, runMigrations, closePool, type Pool } from '../src/db.js';
import { buildApp } from '../src/index.js';

const dbUrl = process.env.M25_DATABASE_URL;
const here = path.dirname(fileURLToPath(import.meta.url));
const distEntry = path.resolve(here, '..', 'dist', 'src', 'index.js');
const canRun = !!dbUrl && existsSync(distEntry);

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

function signWebhook(secret: string, body: string): string {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
}

async function waitForHealthz(port: number, timeoutMs = 10000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/healthz`);
      if (res.ok) return;
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`server on port ${port} never became healthy`);
}

function waitForExit(child: ReturnType<typeof spawn>, timeoutMs = 15000): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('process did not exit within timeout')), timeoutMs);
    child.on('exit', (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal });
    });
  });
}

describe('crash/restart durability + graceful shutdown (T98 server-slo, real child process)', () => {
  const repoDirs: string[] = [];
  const children: ReturnType<typeof spawn>[] = [];
  const orgIds: string[] = [];
  let auditPool: Pool;

  afterAll(async () => {
    for (const c of children) {
      if (!c.killed) c.kill('SIGKILL');
    }
    for (const d of repoDirs) rmSync(d, { recursive: true, force: true });
    // This package's test suite shares one long-lived Postgres instance across every test
    // file (never a fresh-per-run DB -- same convention noted in outbox.spec.ts /
    // rebuild-git-failure.spec.ts). relayOutboxOnce is intentionally NOT scoped to a single
    // org (a real relay loop drains every org's pending notifications), so an undelivered
    // row this suite leaves behind would otherwise get swept up by an unrelated later test's
    // relay call and inflate its "delivered count" -- clean up these orgs' own rows.
    if (auditPool) {
      for (const orgId of orgIds) {
        await auditPool.query('delete from outbox where org_id = $1', [orgId]).catch(() => undefined);
        await auditPool.query('delete from nodes where org_id = $1', [orgId]).catch(() => undefined);
        await auditPool.query('delete from relations where org_id = $1', [orgId]).catch(() => undefined);
      }
      await closePool(auditPool);
    }
  });

  it.runIf(canRun)(
    'SIGTERM drains gracefully: the process exits 0 and the already-enqueued job still completes exactly once',
    async () => {
      const orgId = 'org-sigterm-' + Date.now();
      orgIds.push(orgId);
      const fixture = buildFixtureRepo(orgId, 1);
      repoDirs.push(fixture.dir);
      const head = fixture.commits[fixture.commits.length - 1]!;
      const secret = 'sigterm-secret';
      const port = await freePort();

      auditPool = createPool(dbUrl!);
      await runMigrations(auditPool);
      await auditPool.query('insert into orgs(id, name) values ($1,$2) on conflict (id) do nothing', [orgId, 'SIGTERM org']);

      const child = spawn(process.execPath, [distEntry], {
        env: {
          ...process.env,
          DATABASE_URL: dbUrl!,
          WEBHOOK_SECRET: secret,
          ORG_REPO_DIRS: JSON.stringify({ [orgId]: fixture.dir }),
          PORT: String(port),
          OUTBOX_RELAY_INTERVAL_MS: '0',
          MOLE_SHUTDOWN_GRACE_MS: '8000',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      children.push(child);
      let stderr = '';
      child.stderr.on('data', (d) => (stderr += d.toString()));

      await waitForHealthz(port);

      const payload = JSON.stringify({
        ref: 'refs/heads/main',
        after: head,
        repository: { full_name: `${orgId}/repo`, owner: { login: orgId } },
      });
      const res = await fetch(`http://127.0.0.1:${port}/webhook`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-hub-signature-256': signWebhook(secret, payload),
          'x-github-delivery': 'sigterm-delivery-' + orgId,
          'x-github-event': 'push',
        },
        body: payload,
      });
      expect(res.status).toBe(202);

      // SIGTERM immediately -- the job this webhook enqueued may or may not have started
      // processing yet. Either way, graceful shutdown must exit 0, and the job must not be
      // lost (pg-boss durability + a restart, exercised below, must still complete it).
      child.kill('SIGTERM');
      const { code } = await waitForExit(child);
      expect(code, `stderr: ${stderr}`).toBe(0);

      // "Restart": a fresh buildApp() (the same thing `systemctl restart` / a new pod would
      // do) registers workers again and drains whatever pg-boss still has durably queued.
      const restarted = await buildApp(
        {
          DATABASE_URL: dbUrl!,
          WEBHOOK_SECRET: secret,
          ORG_REPO_DIRS: JSON.stringify({ [orgId]: fixture.dir }),
        } as NodeJS.ProcessEnv,
        { outboxRelayIntervalMs: 0 }
      );
      try {
        let rows: { payload: unknown }[] = [];
        // Poll window must exceed pg-boss's own expireInSeconds (queue.ts QUEUE_RETRY_OPTS,
        // currently 60s): if the killed process had already claimed the job (marked
        // 'active') before SIGTERM, pg-boss will not consider it abandoned and hand it to
        // this fresh worker until that expiry elapses -- a real, bounded recovery-time SLI
        // for this architecture, not just test slack. 90s covers that plus retry backoff.
        for (let i = 0; i < 225; i++) {
          const q = await auditPool.query('select payload from outbox where org_id = $1 and kind = $2 and ref = $3', [orgId, 'check_run', head]);
          rows = q.rows;
          if (rows.length > 0) break;
          await new Promise((r) => setTimeout(r, 400));
        }
        // not lost: the job completed after restart.
        expect(rows.length).toBeGreaterThanOrEqual(1);
        // not duplicated: the unique (org_id, kind, ref) index means more than one row here
        // would mean the job produced the notification twice -- it can't, by construction,
        // but this is the actual M25 "0 duplicate effects" assertion for THIS test's job.
        expect(rows.length).toBe(1);
      } finally {
        await restarted.app.close();
        await restarted.boss.stop({ graceful: false, wait: false });
        await closePool(restarted.pool);
        await restarted.temporalPool.end();
      }
    },
    100000
  );

  it.runIf(canRun)(
    'kill -9 mid-queue, restart: the job is still completed exactly once, no duplicate effect',
    async () => {
      const orgId = 'org-sigkill-' + Date.now();
      orgIds.push(orgId);
      const fixture = buildFixtureRepo(orgId, 1);
      repoDirs.push(fixture.dir);
      const head = fixture.commits[fixture.commits.length - 1]!;
      const secret = 'sigkill-secret';
      const port = await freePort();

      if (!auditPool) {
        auditPool = createPool(dbUrl!);
        await runMigrations(auditPool);
      }
      await auditPool.query('insert into orgs(id, name) values ($1,$2) on conflict (id) do nothing', [orgId, 'SIGKILL org']);

      const child = spawn(process.execPath, [distEntry], {
        env: {
          ...process.env,
          DATABASE_URL: dbUrl!,
          WEBHOOK_SECRET: secret,
          ORG_REPO_DIRS: JSON.stringify({ [orgId]: fixture.dir }),
          PORT: String(port),
          OUTBOX_RELAY_INTERVAL_MS: '0',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      children.push(child);
      await waitForHealthz(port);

      const payload = JSON.stringify({
        ref: 'refs/heads/main',
        after: head,
        repository: { full_name: `${orgId}/repo`, owner: { login: orgId } },
      });
      const res = await fetch(`http://127.0.0.1:${port}/webhook`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-hub-signature-256': signWebhook(secret, payload),
          'x-github-delivery': 'sigkill-delivery-' + orgId,
          'x-github-event': 'push',
        },
        body: payload,
      });
      expect(res.status).toBe(202);

      // No grace, no signal handler, no chance to drain -- exactly a real `kill -9` / OOM
      // kill. Durability here must come entirely from pg-boss's own Postgres-backed queue,
      // not from anything this process does on the way out (it gets no way out).
      child.kill('SIGKILL');
      await waitForExit(child);

      const restarted = await buildApp(
        {
          DATABASE_URL: dbUrl!,
          WEBHOOK_SECRET: secret,
          ORG_REPO_DIRS: JSON.stringify({ [orgId]: fixture.dir }),
        } as NodeJS.ProcessEnv,
        { outboxRelayIntervalMs: 0 }
      );
      try {
        let rows: { payload: unknown }[] = [];
        // Same bound as the SIGTERM test above: the webhook ack happened, but we SIGKILL
        // before this worker necessarily finished claiming/starting the rebuild-index job,
        // so pg-boss may have it marked 'active' against a now-dead process until its own
        // expireInSeconds elapses (queue.ts, currently 60s) before a fresh worker can claim it.
        for (let i = 0; i < 225; i++) {
          const q = await auditPool.query('select payload from outbox where org_id = $1 and kind = $2 and ref = $3', [orgId, 'check_run', head]);
          rows = q.rows;
          if (rows.length > 0) break;
          await new Promise((r) => setTimeout(r, 400));
        }
        expect(rows.length).toBe(1); // not lost, not duplicated
      } finally {
        await restarted.app.close();
        await restarted.boss.stop({ graceful: false, wait: false });
        await closePool(restarted.pool);
        await restarted.temporalPool.end();
      }
    },
    100000
  );
});
