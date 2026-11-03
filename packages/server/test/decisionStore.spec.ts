// T69 red tests: the team server's own second Postgres model (packages/server/src/db.ts's
// nodes/relations) duplicates what a decision's *content* is -- there is no tenant-scoped
// current/as-of read for a decision anywhere in @mole/server. These tests drive
// rebuildIndexFromGit (the only place the server currently learns a decision from git) and
// assert the resulting revision is readable through @mole/temporal's bitemporal store
// (current + asOf), scoped to the writing tenant only -- never another org's.
//
// Written before src/decisionStore.ts exists: this file is expected to fail to even
// typecheck/build until recordDecisionRevision/currentDecision/decisionAsOf land (see
// 4 log/red.txt, same convention as packages/temporal/test/org-isolation.test.ts's own header).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { Pool as TemporalPgPool } from 'pg';
import { createPool, runMigrations, closePool, type Pool } from '../src/db.js';
import { rebuildIndexFromGit } from '../src/rebuild.js';
import { currentDecision, decisionAsOf } from '../src/decisionStore.js';
import { buildFixtureRepo } from '../bench/fixtures.js';
import { applySchema as applyTemporalSchema } from '@mole/temporal';

const dbUrl = process.env.M25_DATABASE_URL;

function git(root: string, ...args: string[]): string {
  return execFileSync('git', ['-C', root, '-c', 'user.name=T', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', ...args], {
    encoding: 'utf8',
  }).trim();
}

describe('T69: a server-approved decision revision is readable via @mole/temporal (current + asOf), tenant-scoped', () => {
  let pool: Pool;
  let temporalPool: TemporalPgPool;
  let dir: string;

  const orgA = 'org-t69-a-' + Date.now();
  const orgB = 'org-t69-b-' + Date.now();

  beforeAll(async () => {
    if (!dbUrl) return;
    pool = createPool(dbUrl);
    await runMigrations(pool);
    temporalPool = new TemporalPgPool({ connectionString: dbUrl });
    await applyTemporalSchema(temporalPool as any);
    await pool.query('insert into orgs(id, name) values ($1,$2),($3,$4) on conflict (id) do nothing', [orgA, 'A', orgB, 'B']);

    const fx = buildFixtureRepo('t69', 1);
    dir = fx.dir;
  });

  afterAll(async () => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    if (pool) await closePool(pool);
    if (temporalPool) await temporalPool.end();
  });

  it.runIf(!!dbUrl)('a decision rebuilt from git for orgA is readable as current + asOf for orgA, and invisible to orgB', async () => {
    const head = git(dir, 'rev-parse', 'HEAD');
    await rebuildIndexFromGit(pool, orgA, dir, head, undefined, { temporalPool });

    const current = await currentDecision(temporalPool, orgA, 't69-d0');
    expect(current).not.toBeNull();
    expect(current!.status).toBe('accepted');

    // T47 tenant isolation (RLS FORCE): orgB asking about the SAME factId gets nothing back,
    // not an error -- the exact M25 permission-leak shape getGoverningDecisions already tests.
    const leaked = await currentDecision(temporalPool, orgB, 't69-d0');
    expect(leaked).toBeNull();
  });

  it.runIf(!!dbUrl)('a later re-approval is a new revision: asOf the old instant still returns the old value, current returns the new one', async () => {
    const orgC = 'org-t69-c-' + Date.now();
    await pool.query('insert into orgs(id, name) values ($1,$2) on conflict (id) do nothing', [orgC, 'C']);

    const head1 = git(dir, 'rev-parse', 'HEAD');
    await rebuildIndexFromGit(pool, orgC, dir, head1, undefined, { temporalPool });
    const t1 = new Date().toISOString();
    await new Promise((r) => setTimeout(r, 20));

    // simulate a second, later approval of the same decision with a changed status
    const fixturePath = (await import('node:path')).join(dir, '.mole', 'decisions', 't69-d0.md');
    const fs = await import('node:fs');
    const text = fs.readFileSync(fixturePath, 'utf8').replace('status: accepted', 'status: superseded');
    fs.writeFileSync(fixturePath, text);
    git(dir, 'add', '-A');
    git(dir, 'commit', '-q', '-m', 're-approve t69-d0 as superseded');
    const head2 = git(dir, 'rev-parse', 'HEAD');
    await rebuildIndexFromGit(pool, orgC, dir, head2, undefined, { temporalPool });

    const asOfOld = await decisionAsOf(temporalPool, orgC, 't69-d0', t1);
    expect(asOfOld).not.toBeNull();
    expect(asOfOld!.status).toBe('accepted');

    const current = await currentDecision(temporalPool, orgC, 't69-d0');
    expect(current).not.toBeNull();
    expect(current!.status).toBe('superseded');
  });
});
