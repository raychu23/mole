// Review round 1 P1 #5: webhook.ts and mcpServer.ts ("requests") had zero telemetry calls —
// only rebuild.ts/checkrun.ts ("jobs") emitted spans, and nothing asserted the in-memory
// exporter actually captured anything. This test drives a real webhook request and a real
// MCP tool call and checks spans landed in the exporter, not just that the code didn't throw.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'node:crypto';
import { rmSync } from 'node:fs';
import { createPool, runMigrations, closePool, type Pool } from '../src/db.js';
import { createQueue, closeQueue, type Boss } from '../src/queue.js';
import { createWebhookHandler } from '../src/webhook.js';
import { createMcpHttpServer } from '../src/mcpServer.js';
import { createTestIssuer } from '../src/oauth.js';
import { initTelemetry } from '../src/telemetry.js';
import { buildFixtureRepo } from '../bench/fixtures.js';

describe('request-path telemetry spans (webhook + MCP)', () => {
  let pool: Pool;
  let boss: Boss;
  let repoDir: string;
  const secret = 'telemetry-secret';

  beforeAll(async () => {
    const dbUrl = process.env.M25_DATABASE_URL;
    if (!dbUrl) return;
    pool = createPool(dbUrl);
    await runMigrations(pool);
    await pool.query("insert into orgs(id, name) values ('org-telemetry','T') on conflict (id) do nothing");
    boss = await createQueue(dbUrl);
    const fixture = buildFixtureRepo('telemetry', 1);
    repoDir = fixture.dir;
  });

  afterAll(async () => {
    if (repoDir) rmSync(repoDir, { recursive: true, force: true });
    if (boss) await closeQueue(boss);
    if (pool) await closePool(pool);
  });

  it.runIf(!!process.env.M25_DATABASE_URL)('emits a webhook.request span for a webhook delivery', async () => {
    const telemetry = initTelemetry('test-webhook-telemetry');
    const handler = createWebhookHandler({ secret, pool, boss, orgRepoDirs: { 'org-telemetry': repoDir }, telemetry });
    const payload = JSON.stringify({
      ref: 'refs/heads/main',
      after: 'deadbeef',
      repository: { full_name: 'org-telemetry/repo', owner: { login: 'org-telemetry' } },
    });
    const sig = 'sha256=' + crypto.createHmac('sha256', secret).update(payload).digest('hex');
    await handler({
      headers: { 'x-hub-signature-256': sig, 'x-github-delivery': 'telemetry-delivery-1', 'x-github-event': 'push' },
      rawBody: payload,
    });
    const spans = telemetry.exporter.getFinishedSpans();
    expect(spans.some((s) => s.name === 'webhook.request')).toBe(true);
    await telemetry.shutdown();
  });

  it.runIf(!!process.env.M25_DATABASE_URL)('emits an execute_tool span for an MCP tool call', async () => {
    const telemetry = initTelemetry('test-mcp-telemetry');
    const issuer = createTestIssuer();
    const mcp = await createMcpHttpServer({ pool, issuer, telemetry });
    try {
      const token = await issuer.mintToken('org-telemetry');
      await mcp.callToolAsOrg(token, 'governing_decisions', { org: 'org-telemetry', file: 'src/telemetry-file0.ts' });
    } finally {
      await mcp.close();
    }
    const spans = telemetry.exporter.getFinishedSpans();
    expect(spans.some((s) => s.name === 'execute_tool governing_decisions')).toBe(true);
    await telemetry.shutdown();
  });
});
