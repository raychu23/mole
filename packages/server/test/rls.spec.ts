import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createPool, runMigrations, closePool, type Pool } from '../src/db.js';
import { getGoverningDecisions } from '../src/graph.js';
import { rebuildIndexFromGit } from '../src/rebuild.js';
import { buildFixtureRepo } from '../bench/fixtures.js';
import { rmSync } from 'node:fs';

describe('row-level security permission leak (M25 leak test, key: 4 log/prior-art.md §6)', () => {
  let pool: Pool;
  let dirA: string;
  let dirB: string;

  beforeAll(async () => {
    const dbUrl = process.env.M25_DATABASE_URL;
    if (!dbUrl) return;
    pool = createPool(dbUrl);
    await runMigrations(pool);
    await pool.query("insert into orgs(id, name) values ('org-a','A'),('org-b','B') on conflict (id) do nothing");
    const a = buildFixtureRepo('org-a', 2);
    const b = buildFixtureRepo('org-b', 2);
    dirA = a.dir;
    dirB = b.dir;
    await rebuildIndexFromGit(pool, 'org-a', dirA, a.commits[a.commits.length - 1]!, undefined);
    await rebuildIndexFromGit(pool, 'org-b', dirB, b.commits[b.commits.length - 1]!, undefined);
  });

  afterAll(async () => {
    if (dirA) rmSync(dirA, { recursive: true, force: true });
    if (dirB) rmSync(dirB, { recursive: true, force: true });
    if (pool) await closePool(pool);
  });

  it.runIf(!!process.env.M25_DATABASE_URL)('org-b sees 0 of org-a records for a path that only exists in org-a', async () => {
    const rows = await getGoverningDecisions(pool, 'org-b', 'src/org-a-file0.ts', { forOrg: 'org-a' });
    expect(rows.length).toBe(0);
  });

  it.runIf(!!process.env.M25_DATABASE_URL)('org-a still sees its own records for its own path', async () => {
    const rows = await getGoverningDecisions(pool, 'org-a', 'src/org-a-file0.ts', { forOrg: 'org-a' });
    expect(rows.length).toBeGreaterThan(0);
  });
});
