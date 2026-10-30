// Final-build wiring verification (2026-10-30): buildApp() previously left the
// rebuild-index / compute-check-run queues it enqueues into unworked -- only
// bench/m25.ts registered boss.work() for them, so a real `node dist/src/index.js`
// server ack'd webhooks (202 queued) but never produced an index update or an
// outbox/check-run row. This test drives buildApp()'s own webhook handler (not a
// copy of the worker registration) and asserts a real outbox row appears without
// calling rebuildIndexFromGit/computeCheckRun directly.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { buildApp } from '../src/index.js';
import { buildFixtureRepo } from '../bench/fixtures.js';
import { closePool, type Pool } from '../src/db.js';
import type { Boss } from '../src/queue.js';
import type { FastifyInstance } from 'fastify';

describe('server index.ts is wired to real workers (final-build verification)', () => {
  let pool: Pool;
  let boss: Boss;
  let fastifyApp: FastifyInstance;
  let repoDir: string;
  let head: string;
  const secret = 'index-wiring-secret';
  const orgId = 'org-index-wiring-' + Date.now(); // unique per run: a stale failed job retry
  // for a reused org id (e.g. from an interrupted prior run) sits ahead of a fresh job in
  // pg-boss's FIFO queue and its retryBackoff delays would otherwise starve this test.

  beforeAll(async () => {
    const dbUrl = process.env.M25_DATABASE_URL;
    if (!dbUrl) return;
    const fixture = buildFixtureRepo(orgId, 1);
    repoDir = fixture.dir;
    head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoDir, encoding: 'utf8' }).trim();
    const built = await buildApp({
      DATABASE_URL: dbUrl,
      WEBHOOK_SECRET: secret,
      ORG_REPO_DIRS: JSON.stringify({ [orgId]: repoDir }),
    } as NodeJS.ProcessEnv);
    pool = built.pool;
    boss = built.boss;
    fastifyApp = built.app;
    await pool.query('insert into orgs(id, name) values ($1,$2) on conflict (id) do nothing', [orgId, 'Index Wiring Org']);
  });

  afterAll(async () => {
    if (fastifyApp) await fastifyApp.close();
    if (repoDir) rmSync(repoDir, { recursive: true, force: true });
    if (boss) await boss.stop({ graceful: false, wait: false });
    if (pool) await closePool(pool);
  });

  it.runIf(!!process.env.M25_DATABASE_URL)(
    'a webhook delivery through the real app produces a real outbox check-run row, with no bench-only wiring',
    async () => {
      const payload = JSON.stringify({
        ref: 'refs/heads/main',
        after: head,
        repository: { full_name: `${orgId}/repo`, owner: { login: orgId } },
      });
      const sig = 'sha256=' + crypto.createHmac('sha256', secret).update(payload).digest('hex');

      const res = await fastifyApp.inject({
        method: 'POST',
        url: '/webhook',
        headers: {
          'content-type': 'application/json',
          'x-hub-signature-256': sig,
          'x-github-delivery': 'index-wiring-delivery-1',
          'x-github-event': 'push',
        },
        payload,
      });
      expect(res.statusCode).toBe(202);

      // Poll for the job this server's OWN boss.work() handlers (registered inside
      // buildApp, not by this test or by bench/m25.ts) should drain.
      let row: { payload: unknown } | undefined;
      for (let i = 0; i < 60; i++) {
        const { rows } = await pool.query('select payload from outbox where org_id = $1 and kind = $2 and ref = $3', [orgId, 'check_run', head]);
        if (rows.length > 0) {
          row = rows[0];
          break;
        }
        await new Promise((r) => setTimeout(r, 500));
      }
      expect(row).toBeDefined();
      expect((row!.payload as any).governedFiles).toBeGreaterThanOrEqual(0);
    },
    40000
  );
});
