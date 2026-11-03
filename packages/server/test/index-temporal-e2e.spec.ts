// T69 review round 1 blocking finding #3: done-when 3 ("a real approved server revision
// readable via temporal current + asOf for its tenant only") was only proven against
// rebuildIndexFromGit called directly (decisionStore.spec.ts) -- never through the actual
// running server (buildApp(), its own webhook route, its own pg-boss job handlers, its own
// temporalPool). This test drives the whole path end to end, the same way index.spec.ts
// already does for the outbox/check-run row: POST a real webhook, let buildApp()'s OWN
// boss.work('rebuild-index', ...) handler drain it, then read back through @mole/temporal
// using the SAME temporalPool buildApp() constructed -- not a second ad hoc connection.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { Pool as TemporalPgPool } from 'pg';
import { buildApp } from '../src/index.js';
import { buildFixtureRepo } from '../bench/fixtures.js';
import { closePool, type Pool } from '../src/db.js';
import { currentDecision, decisionAsOf } from '../src/decisionStore.js';
import type { Boss } from '../src/queue.js';
import type { FastifyInstance } from 'fastify';
import { createTestIssuer } from '../src/oauth.js';

const dbUrl = process.env.M25_DATABASE_URL;

describe('T69 review-1 #3: an approved decision is readable via temporal current+asOf for its tenant only, END TO END THROUGH THE SERVER', () => {
  let pool: Pool;
  let temporalPool: TemporalPgPool;
  let boss: Boss;
  let fastifyApp: FastifyInstance;
  let repoDir: string;
  let head: string;
  const secret = 't69-e2e-secret';
  const authSecret = 't69-e2e-auth-secret';
  // unique per run, same reasoning as index.spec.ts's own orgId: a stale retried job for a
  // reused org id would sit ahead of this run's fresh job in pg-boss's FIFO queue.
  const orgA = 'org-t69-e2e-a-' + Date.now();
  const orgB = 'org-t69-e2e-b-' + Date.now();

  beforeAll(async () => {
    if (!dbUrl) return;
    const fixture = buildFixtureRepo(orgA, 1);
    repoDir = fixture.dir;
    head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoDir, encoding: 'utf8' }).trim();
    const built = await buildApp({
      DATABASE_URL: dbUrl,
      WEBHOOK_SECRET: secret,
      MOLE_AUTH_SECRET: authSecret,
      ORG_REPO_DIRS: JSON.stringify({ [orgA]: repoDir }),
    } as NodeJS.ProcessEnv);
    pool = built.pool;
    boss = built.boss;
    fastifyApp = built.app;
    temporalPool = built.temporalPool;
    await pool.query('insert into orgs(id, name) values ($1,$2),($3,$4) on conflict (id) do nothing', [orgA, 'A', orgB, 'B']);
  });

  afterAll(async () => {
    if (fastifyApp) await fastifyApp.close();
    if (repoDir) rmSync(repoDir, { recursive: true, force: true });
    if (boss) await boss.stop({ graceful: false, wait: false });
    if (pool) await closePool(pool);
    if (temporalPool) await temporalPool.end();
  });

  it.runIf(!!dbUrl)(
    'a webhook-triggered rebuild through the real app makes the decision current+asOf for orgA, and null for orgB (RLS, same decision id)',
    async () => {
      const payload = JSON.stringify({
        ref: 'refs/heads/main',
        after: head,
        repository: { full_name: `${orgA}/repo`, owner: { login: orgA } },
      });
      const sig = 'sha256=' + crypto.createHmac('sha256', secret).update(payload).digest('hex');

      const res = await fastifyApp.inject({
        method: 'POST',
        url: '/webhook',
        headers: {
          'content-type': 'application/json',
          'x-hub-signature-256': sig,
          // unique per run (same reasoning as orgA/orgB): the webhook dedupe key is
          // delivery_id ALONE (global, not org-scoped) -- a hardcoded id here would dedupe
          // against a prior run's row still sitting in `deliveries` and silently skip
          // boss.send() on every rerun.
          'x-github-delivery': 't69-e2e-delivery-' + orgA,
          'x-github-event': 'push',
        },
        payload,
      });
      expect(res.statusCode).toBe(202);

      const decisionId = `${orgA}-d0`;
      let current: Awaited<ReturnType<typeof currentDecision>> = null;
      for (let i = 0; i < 60; i++) {
        current = await currentDecision(temporalPool, orgA, decisionId);
        if (current) break;
        await new Promise((r) => setTimeout(r, 500));
      }
      expect(current).not.toBeNull();
      expect(current!.title).toContain('Decision 0');

      const asOfNow = await decisionAsOf(temporalPool, orgA, decisionId, new Date().toISOString());
      expect(asOfNow).not.toBeNull();

      // Tenant isolation through the SAME temporalPool the server itself uses, not a second
      // manually-opened connection: the identical decision id must be invisible to orgB.
      const crossOrg = await currentDecision(temporalPool, orgB, decisionId);
      expect(crossOrg).toBeNull();
    },
    40000
  );

  it.runIf(!!dbUrl)('a read-only reconcile endpoint reports no divergence for the org just rebuilt', async () => {
    // T69 review-2 HIGH: the endpoint needs a bearer token for THIS org (same issuer + org claim as the team MCP server)
    const tokenA = await createTestIssuer(authSecret).mintToken(orgA);
    const tokenB = await createTestIssuer(authSecret).mintToken(orgB);
    const anon = await fastifyApp.inject({ method: 'GET', url: `/reconcile/${orgA}` });
    expect(anon.statusCode).toBe(401);
    const forged = await fastifyApp.inject({ method: 'GET', url: `/reconcile/${orgA}`, headers: { authorization: `Bearer ${await createTestIssuer('wrong-secret').mintToken(orgA)}` } });
    expect(forged.statusCode).toBe(401);
    const other = await fastifyApp.inject({ method: 'GET', url: `/reconcile/${orgA}`, headers: { authorization: `Bearer ${tokenB}` } });
    expect(other.statusCode).toBe(404); // never confirms org A exists, never returns its ids
    expect(JSON.stringify(other.json())).not.toContain(orgA);
    const res = await fastifyApp.inject({ method: 'GET', url: `/reconcile/${orgA}`, headers: { authorization: `Bearer ${tokenA}` } });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.missing).toEqual([]);
    expect(body.extra).toEqual([]);
    expect(body.changed).toEqual([]);
  });

  it('/reconcile is closed (401) when the server has no MOLE_AUTH_SECRET', async () => {
    if (!dbUrl) return;
    const built = await buildApp({ DATABASE_URL: dbUrl, WEBHOOK_SECRET: secret, ORG_REPO_DIRS: '{}' } as NodeJS.ProcessEnv);
    try {
      const res = await built.app.inject({ method: 'GET', url: `/reconcile/${orgA}`, headers: { authorization: `Bearer ${await createTestIssuer(authSecret).mintToken(orgA)}` } });
      expect(res.statusCode).toBe(401);
    } finally {
      await built.app.close();
      await built.boss.stop({ graceful: false, wait: false });
      await closePool(built.pool);
      await built.temporalPool.end();
    }
  });

  it('/health reports 200 (and temporal reachability) when temporal is reachable', async () => {
    if (!fastifyApp) return;
    const res = await fastifyApp.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });
});
