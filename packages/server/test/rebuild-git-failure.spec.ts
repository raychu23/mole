import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createPool, runMigrations, closePool, type Pool } from '../src/db.js';
import { createQueue, closeQueue, type Boss } from '../src/queue.js';
import { rebuildIndexFromGit, snapshotHash, GitReadError } from '../src/rebuild.js';
import { initTelemetry } from '../src/telemetry.js';
import { buildFixtureRepo } from '../bench/fixtures.js';
import { rmSync } from 'node:fs';

// Regression test for the T33 review round 2 blocking finding: a git failure (missing
// ref/dir, e.g. from a torn-down temp fixture repo referenced by a stale pg-boss job) used
// to be swallowed as "zero .mole/ files", which made rebuildIndexFromGit DELETE an org's
// nodes/relations rows and insert nothing - silently wiping the index. This reproduces the
// exact scenario: build a fixture repo, do one real/successful rebuild (populating the
// index), delete the repo dir (simulating the fixture teardown that happens after a bench
// run), then process a second "stale" job referencing the same now-missing dir/ref the way
// a replayed pg-boss job would, via the real queue + job handler - and asserts the index is
// UNCHANGED (not wiped) and the failure is recorded/observable (job ends up failed, not
// completed; an OTel span records the exception).
describe('rebuild.ts git-failure handling (M25 regression, review round 2 blocking finding)', () => {
  let pool: Pool;
  let boss: Boss;
  let dir: string;
  let head: string;
  const orgId = 'org-git-failure-regress';

  beforeAll(async () => {
    const dbUrl = process.env.M25_DATABASE_URL;
    if (!dbUrl) return;
    pool = createPool(dbUrl);
    await runMigrations(pool);
    await pool.query('insert into orgs(id, name) values ($1,$2) on conflict (id) do nothing', [orgId, 'Git Failure Regress']);
    // clean slate: a prior failed run of this suite could leave rows behind on a long-lived
    // shared Postgres instance (this repo never uses a fresh-per-run DB).
    await pool.query('delete from nodes where org_id = $1', [orgId]);
    await pool.query('delete from relations where org_id = $1', [orgId]);
    const fx = buildFixtureRepo('git-failure-regress', 2);
    dir = fx.dir;
    head = fx.commits[fx.commits.length - 1]!;
    boss = await createQueue(dbUrl);
  });

  afterAll(async () => {
    rmSync(dir, { recursive: true, force: true });
    if (pool) await pool.query('delete from nodes where org_id = $1', [orgId]).catch(() => undefined);
    if (pool) await pool.query('delete from relations where org_id = $1', [orgId]).catch(() => undefined);
    if (boss) await closeQueue(boss);
    if (pool) await closePool(pool);
  });

  it.runIf(!!process.env.M25_DATABASE_URL)(
    'listMoleFilesAtRef throws (never returns []) when the ref/dir is unreadable',
    async () => {
      rmSync(dir, { recursive: true, force: true });
      await expect(rebuildIndexFromGit(pool, orgId, dir, head, undefined)).rejects.toBeInstanceOf(GitReadError);
      // restore the dir for the rest of the suite (fresh fixture, same shas aren't needed below)
      const fx = buildFixtureRepo('git-failure-regress-2', 2);
      dir = fx.dir;
      head = fx.commits[fx.commits.length - 1]!;
    }
  );

  it.runIf(!!process.env.M25_DATABASE_URL)(
    'a real rebuild populates the index, then a stale job for a deleted dir never wipes it',
    async () => {
      // Step 1: a real, successful rebuild - the index should be populated.
      await rebuildIndexFromGit(pool, orgId, dir, head, undefined);
      const before = await pool.query('select count(*)::int as c from nodes where org_id = $1', [orgId]);
      expect(before.rows[0].c).toBeGreaterThan(0);
      const hashBefore = await snapshotHash(pool, orgId);

      // Step 2: enqueue a job referencing this (still-valid) repo/ref via the real queue,
      // exactly like webhook.ts does, then delete the dir out from under it (simulating the
      // fixture teardown a finished bench run performs) BEFORE the job is processed - this
      // is the literal stale-pg-boss-job-vs-deleted-temp-dir scenario from the blocked finding.
      const telemetry = initTelemetry('rebuild-git-failure-regress-test');
      await boss.send('rebuild-index', { orgId, ref: head });
      rmSync(dir, { recursive: true, force: true });

      let observedFailure: unknown;
      let completedOk = false;
      await new Promise<void>((resolve) => {
        boss
          .work('rebuild-index', { batchSize: 1 }, async (jobs) => {
            for (const job of jobs) {
              const { orgId: jOrg, ref: jRef } = job.data as any;
              try {
                await rebuildIndexFromGit(pool, jOrg, dir, jRef, telemetry);
                completedOk = true;
              } catch (e) {
                observedFailure = e;
                throw e; // mirrors bench/m25.ts: rethrow so pg-boss marks the job failed
              }
            }
          })
          .then(() => {
            // poll briefly for the worker to actually pick up and process the job
            const start = Date.now();
            const check = () => {
              if (observedFailure || completedOk || Date.now() - start > 8000) return resolve();
              setTimeout(check, 100);
            };
            check();
          });
      });
      await boss.offWork('rebuild-index');

      // Assertion 1: the failure is recorded/observable - never silently succeeded.
      expect(completedOk).toBe(false);
      expect(observedFailure).toBeInstanceOf(GitReadError);

      // Assertion 2: an OTel span recorded the exception for this failed job.
      const spans = telemetry.exporter.getFinishedSpans();
      const rebuildSpan = spans.find((s) => s.name === 'index.rebuild');
      expect(rebuildSpan).toBeDefined();
      const exceptionEvents = rebuildSpan!.events.filter((e) => e.name === 'exception');
      expect(exceptionEvents.length).toBeGreaterThan(0);

      // Assertion 3 (the actual regression): the index is UNCHANGED, not wiped.
      const after = await pool.query('select count(*)::int as c from nodes where org_id = $1', [orgId]);
      expect(after.rows[0].c).toBe(before.rows[0].c);
      const hashAfter = await snapshotHash(pool, orgId);
      expect(hashAfter).toBe(hashBefore);

      await telemetry.shutdown();
    },
    20000
  );
});
