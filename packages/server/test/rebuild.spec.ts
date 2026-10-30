import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createPool, runMigrations, closePool, type Pool } from '../src/db.js';
import { rebuildIndexFromGit, snapshotHash } from '../src/rebuild.js';
import { buildFixtureRepo } from '../bench/fixtures.js';
import { rmSync } from 'node:fs';

describe('index rebuild equality (M25 "index == rebuild from git")', () => {
  let pool: Pool;
  let dir: string;
  let head: string;

  beforeAll(async () => {
    const dbUrl = process.env.M25_DATABASE_URL;
    if (!dbUrl) return;
    pool = createPool(dbUrl);
    await runMigrations(pool);
    await pool.query("insert into orgs(id, name) values ('org-rebuild','R') on conflict (id) do nothing");
    const fx = buildFixtureRepo('rebuild', 3);
    dir = fx.dir;
    head = fx.commits[fx.commits.length - 1]!;
  });

  afterAll(async () => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    if (pool) await closePool(pool);
  });

  it.runIf(!!process.env.M25_DATABASE_URL)('rebuilding twice from the same git ref gives the same snapshot hash', async () => {
    await rebuildIndexFromGit(pool, 'org-rebuild', dir, head, undefined);
    const h1 = await snapshotHash(pool, 'org-rebuild');
    const h2 = await rebuildIndexFromGit(pool, 'org-rebuild-shadow', dir, head, undefined, { shadow: true });
    expect(h2).toBe(h1);
  });
});
