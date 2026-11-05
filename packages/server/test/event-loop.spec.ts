// T99 server-throughput: rebuild.ts's git calls were execFileSync (blocking) before this task
// and are promisified execFile (async) now. This proves the rebuild-index job path keeps the
// event loop responsive under concurrent jobs (perf_hooks.monitorEventLoopDelay, the same
// mechanism Node APM agents use to detect loop stalls).
//
// Scope note (written up in full in docs/server-slo.md "Found, not fixed"): investigating this
// test's numbers turned up a SEPARATE, larger blocking source on the compute-check-run job
// path -- computeCheckRun() calls @mole/decisions' prCheck(), which (packages/decisions/src/
// check/pr-check.ts) does its OWN ~20 execFileSync calls, including an UNCONDITIONAL
// `git worktree add`/`remove` per call (baseTree()) and, when any decision has a `rules:`
// item, an archive+tar extraction too. Isolated measurement: 4 concurrent computeCheckRun()
// calls against this package's own fixture repos produced p99 ~1.26s of event-loop delay EVEN
// AFTER this task's fix to checkrun.ts's own wrapper functions (changedFiles/baseOf/
// isAncestor) -- i.e. checkrun.ts's own git calls were never the dominant cost; prCheck's are.
// Fixing that is a much larger, cross-package change (packages/decisions is also the CLI's
// `mole pr-check` and the hook path, not just this server) and is out of this task's boundary
// (packages/server/src/**, same boundary T98 used) and its time-box -- logged as a new,
// separate "Found, not fixed" item rather than silently absorbed into a loosened assertion.
import { describe, it, expect, afterAll } from 'vitest';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { rmSync } from 'node:fs';
import { createPool, runMigrations, closePool, type Pool } from '../src/db.js';
import { rebuildIndexFromGit } from '../src/rebuild.js';
import { buildFixtureRepo } from '../bench/fixtures.js';

const dbUrl = process.env.M25_DATABASE_URL;

describe.runIf(!!dbUrl)('rebuild-index job path stays non-blocking under concurrency (T99)', () => {
  const dirs: string[] = [];

  afterAll(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
  });

  it(
    'p99 event-loop delay stays low while N rebuilds run concurrently (unbounded fan-out)',
    async () => {
      const pool: Pool = createPool(dbUrl!);
      await runMigrations(pool);

      const ORG_COUNT = 6;
      const DECISIONS_PER_ORG = 15; // each decision = one more `git show` subprocess per rebuild
      const orgs = Array.from({ length: ORG_COUNT }, (_, i) => {
        const orgId = `org-eventloop-t99-${i}-${Date.now()}`;
        const fx = buildFixtureRepo(orgId, DECISIONS_PER_ORG);
        dirs.push(fx.dir);
        return { orgId, dir: fx.dir, head: fx.commits[fx.commits.length - 1]! };
      });
      for (const o of orgs) {
        await pool.query('insert into orgs(id, name) values ($1,$2) on conflict (id) do nothing', [o.orgId, o.orgId]);
      }

      const histogram = monitorEventLoopDelay({ resolution: 5 });
      histogram.enable();

      // Unbounded fan-out (no mapLimit) -- the worst case for subprocess/event-loop pressure,
      // deliberately more concurrent than index.ts's own MOLE_REBUILD_CONCURRENCY default (2),
      // to prove the fix holds even beyond the configured production bound.
      await Promise.all(orgs.map((o) => rebuildIndexFromGit(pool, o.orgId, o.dir, o.head, undefined)));

      histogram.disable();
      const p50 = histogram.percentile(50) / 1e6; // ns -> ms
      const p99 = histogram.percentile(99) / 1e6;
      const max = histogram.max / 1e6;
      console.error('[event-loop-t99]', { p50Ms: p50.toFixed(2), p99Ms: p99.toFixed(2), maxMs: max.toFixed(2) });

      // 4 log/red.txt: this exact scenario (6 concurrent rebuilds, 15 decisions/org) against
      // main's pre-T99 execFileSync rebuild.ts measured p99 ~5ms on this particular fixture
      // size too -- each individual git call here is fast enough, and Promise.all's own
      // microtask interleaving between awaits masks a lot of a single blocking call's cost at
      // this scale. The regression this task's own commit history and T98's load test actually
      // measured (p99 1,166-1,267ms webhook ack tail, <1 job/sec queue drain) shows up under
      // SUSTAINED webhook+queue load over 10s (tasks/T98-server-slo/4 log/load.md), not a single
      // one-shot batch of 6 -- this test is a non-regression floor for the async implementation
      // at this shape, not a reproduction of T98's own number (see docs/server-slo.md for how
      // the real end-to-end improvement was measured: a load.mjs rerun, before vs after).
      expect(p99).toBeLessThan(100);

      for (const o of orgs) {
        await pool.query('delete from nodes where org_id = $1', [o.orgId]);
        await pool.query('delete from relations where org_id = $1', [o.orgId]);
      }
      await closePool(pool);
    },
    30000
  );
});
