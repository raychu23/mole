import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createPool, runMigrations, closePool, type Pool } from '../src/db.js';
import { createWebhookHandler } from '../src/webhook.js';
import { buildFixtureRepo } from '../bench/fixtures.js';
import crypto from 'node:crypto';
import { rmSync } from 'node:fs';

describe('webhook dedupe by X-GitHub-Delivery (M25 "0 duplicate effects")', () => {
  let pool: Pool;
  let boss: any;
  let repoDir: string;
  const secret = 'dedupe-secret';

  beforeAll(async () => {
    const dbUrl = process.env.M25_DATABASE_URL;
    if (!dbUrl) return;
    pool = createPool(dbUrl);
    await runMigrations(pool);
    await pool.query("insert into orgs(id, name) values ('org-dedupe','D') on conflict (id) do nothing");
    const { createQueue } = await import('../src/queue.js');
    boss = await createQueue(dbUrl);
    const fixture = buildFixtureRepo('dedupe', 1);
    repoDir = fixture.dir;
  });

  afterAll(async () => {
    if (repoDir) rmSync(repoDir, { recursive: true, force: true });
    if (boss) await (await import('../src/queue.js')).closeQueue(boss);
    if (pool) await closePool(pool);
  });

  it.runIf(!!process.env.M25_DATABASE_URL)('redelivering the same X-GitHub-Delivery is recorded once', async () => {
    const handler = createWebhookHandler({ secret, pool, boss, orgRepoDirs: { 'org-dedupe': repoDir } });
    const payload = JSON.stringify({ ref: 'refs/heads/main', after: 'deadbeef', repository: { full_name: 'org-dedupe/repo', owner: { login: 'org-dedupe' } } });
    const sig = 'sha256=' + crypto.createHmac('sha256', secret).update(payload).digest('hex');
    const headers = { 'x-hub-signature-256': sig, 'x-github-delivery': 'fixed-id-1', 'x-github-event': 'push' };
    const r1 = await handler({ headers, rawBody: payload });
    const r2 = await handler({ headers, rawBody: payload });
    expect(r1.status).toBe(202);
    expect(r2.body.status).toBe('duplicate');
    const rows = await pool.query('select count(*)::int as c from deliveries where delivery_id = $1', ['fixed-id-1']);
    expect(rows.rows[0].c).toBe(1);
  });

  it.runIf(!!process.env.M25_DATABASE_URL)('rejects a bad signature', async () => {
    const handler = createWebhookHandler({ secret, pool, boss, orgRepoDirs: { 'org-dedupe': repoDir } });
    const r = await handler({ headers: { 'x-hub-signature-256': 'sha256=bad', 'x-github-delivery': 'x', 'x-github-event': 'push' }, rawBody: '{}' });
    expect(r.status).toBe(401);
  });

  it.runIf(!!process.env.M25_DATABASE_URL)('rejects an unrecognized repo owner instead of silently attributing it to another org', async () => {
    // Review round 1 P1 #4: this used to silently fall back to Object.keys(orgRepoDirs)[0]
    // (whichever org happened to be first), a real cross-org mis-attribution risk.
    const handler = createWebhookHandler({ secret, pool, boss, orgRepoDirs: { 'org-dedupe': repoDir } });
    const payload = JSON.stringify({
      ref: 'refs/heads/main',
      after: 'deadbeef',
      repository: { full_name: 'unknown-org/repo', owner: { login: 'unknown-org' } },
    });
    const sig = 'sha256=' + crypto.createHmac('sha256', secret).update(payload).digest('hex');
    const headers = { 'x-hub-signature-256': sig, 'x-github-delivery': 'unknown-org-delivery-1', 'x-github-event': 'push' };
    const r = await handler({ headers, rawBody: payload });
    expect(r.status).toBe(404);
    expect(r.body.status).toBe('unknown-org');
    const rows = await pool.query('select count(*)::int as c from deliveries where delivery_id = $1', ['unknown-org-delivery-1']);
    expect(rows.rows[0].c).toBe(0); // never recorded under org-dedupe (or any org)
  });
});
