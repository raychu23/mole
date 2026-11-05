// T99 server-throughput: proves the rebuild-index job path's git calls are async (don't block
// the Node event loop). This file replaces an earlier version (review round 1 HIGH finding,
// 2026-11-05) that measured real `git show`/`git ls-tree` latency against tiny on-disk fixture
// repos via `perf_hooks.monitorEventLoopDelay` and asserted p99 < 100ms: on this one shared Mac
// those calls are usually a couple of ms (margin against the threshold too thin -- 2/4 runs
// flaked under load), AND the same test never failed against the pre-T99 *synchronous*
// execFileSync code either at this fixture size -- i.e. it wasn't discriminating.
//
// Investigating why turned up a SECOND, more fundamental problem with that whole approach,
// independent of fixture size: `monitorEventLoopDelay`'s histogram does not register delay
// caused by `execFileSync`/`spawnSync` AT ALL on this Node version, even for a deliberately
// huge, unmistakable block. Verified directly (not asserted from the regression alone):
//   - `execFileSync('sleep', ['0.3'])` x4 back-to-back (1.2s of real, provable blocking --
//     elapsed wall time confirmed >1.2s) -> `monitorEventLoopDelay` max = 0ms.
//   - A plain synchronous `while (Date.now() < until) {}` busy-spin for 1.2s (no subprocess at
//     all, unambiguous single-thread CPU block) -> `monitorEventLoopDelay` max = 0ms too.
//   - The SAME scenario with a `setInterval` heartbeat instead of `monitorEventLoopDelay`:
//     max gap between consecutive heartbeat ticks ~1269ms (closely matches the blocking
//     duration) for the sync case, ~13ms for the async case (`execFile`/`promisify`).
// Root cause: `monitorEventLoopDelay`'s internal timer needs the JS call stack to unwind back
// to the libuv loop between samples; a purely synchronous block (CPU spin or a blocking syscall
// like `spawnSync`'s `waitpid`) never does that until the WHOLE synchronous Promise.all-driven
// call chain completes, so it has literally zero samples during the stall and no retroactive
// "you missed N ms" sample either -- it is silently blind to exactly the bug class T99 fixes.
// (This explains why the ORIGINAL event-loop.spec.ts only ever saw a real regression signal in
// the compute-check-run path, never the plain rebuild-index git-show path: that path's own slow
// calls, per 4 log/red.txt's own numbers, apparently never tripped the instrument either, and
// the "regression" that test caught was really the check-run scenario's far larger, heavier
// calls happening to coincide with enough DB-driven `await` yields elsewhere to let a FEW late
// samples slip through -- not a reliable signal either, just one that happened to read high.)
//
// Fixed: use the directly-verified-reliable technique -- a `setInterval` heartbeat running
// concurrently with the git-calling work, assert on the MAX GAP between consecutive heartbeat
// ticks. A fake `git` on PATH sleeps a fixed, generous duration before delegating to the real
// git binary, so every git call this job path makes costs >= GIT_SLEEP_MS regardless of machine
// load or fixture size. Under the OLD synchronous execFileSync code, those calls run ON the
// main thread one after another with no yield point in between (see root-cause note above), so
// the heartbeat is observably starved for close to GIT_SLEEP_MS * calls (4 log/
// event-loop-red.txt: measured max ~2.4-4.8s here). Under the current async execFile + mapLimit
// code, the sleeps happen in child processes with real `await` yields between them, so the
// heartbeat keeps ticking at close to its configured interval throughout (4 log/
// event-loop-green.txt: max well under the asserted threshold, 5/5 runs). The threshold (half of
// a single call's own sleep) gives a wide margin either way -- this is not a close call.
//
// Scope note (full write-up in docs/server-slo.md "Found, not fixed"): this test covers the
// rebuild-index job path only (rebuild.ts, this task's own fix). A separate, larger blocking
// source on the compute-check-run path (`@mole/decisions`'s `prCheck()`) is out of this task's
// `packages/server/src/**` boundary and is tracked there as a new, not-fixed item instead of
// silently folded into this test or a loosened assertion.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { rmSync, mkdtempSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createPool, runMigrations, closePool, type Pool } from '../src/db.js';
import { rebuildIndexFromGit } from '../src/rebuild.js';
import { buildFixtureRepo } from '../bench/fixtures.js';

const dbUrl = process.env.M25_DATABASE_URL;

// Deliberately large: a single stubbed git call sleeps this long. The assert below uses a
// threshold well under it, so only a loop ACTUALLY starved by a sync call (not ordinary
// scheduler jitter) can trip it.
const GIT_SLEEP_MS = 300;
const HEARTBEAT_INTERVAL_MS = 10;
const MAX_ALLOWED_HEARTBEAT_GAP_MS = 150;

describe.runIf(!!dbUrl)('rebuild-index job path stays non-blocking under concurrency (T99)', () => {
  const dirs: string[] = [];
  let stubDir: string;
  let origPath: string | undefined;

  beforeAll(() => {
    const realGit = execFileSync('which', ['git'], { encoding: 'utf8' }).trim();
    stubDir = mkdtempSync(path.join(tmpdir(), 'mole-git-stub-'));
    const stubPath = path.join(stubDir, 'git');
    // Sleeps GIT_SLEEP_MS, then execs the REAL git with the same argv, for every call the
    // rebuild-index job path makes (ls-tree, show). `sleep` is itself a real subprocess, so
    // this cost is genuinely off-thread for an async caller (execFile) and genuinely a real,
    // unavoidable wait for a sync caller (execFileSync) -- nothing here is simulated in-process.
    writeFileSync(stubPath, `#!/bin/sh\nsleep ${(GIT_SLEEP_MS / 1000).toFixed(3)}\nexec "${realGit}" "$@"\n`);
    chmodSync(stubPath, 0o755);
    origPath = process.env.PATH;
  });

  afterAll(() => {
    if (origPath !== undefined) process.env.PATH = origPath;
    rmSync(stubDir, { recursive: true, force: true });
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
  });

  it(
    "max gap between heartbeat ticks stays far below a single blocking git call's duration under concurrency",
    async () => {
      const pool: Pool = createPool(dbUrl!);
      await runMigrations(pool);

      const ORG_COUNT = 4;
      const DECISIONS_PER_ORG = 3; // each decision = one more `git show` subprocess per rebuild
      // Build fixture repos BEFORE the stub is on PATH: fixture creation (buildFixtureRepo's
      // own init/add/commit/rev-parse calls) must use the REAL git at full speed -- it's setup,
      // not part of what this test measures.
      const orgs = Array.from({ length: ORG_COUNT }, (_, i) => {
        const orgId = `org-eventloop-t99-${i}-${Date.now()}`;
        const fx = buildFixtureRepo(orgId, DECISIONS_PER_ORG);
        dirs.push(fx.dir);
        return { orgId, dir: fx.dir, head: fx.commits[fx.commits.length - 1]! };
      });
      for (const o of orgs) {
        await pool.query('insert into orgs(id, name) values ($1,$2) on conflict (id) do nothing', [o.orgId, o.orgId]);
      }

      // NOW make every `git` call rebuildIndexFromGit makes go through the slow stub.
      process.env.PATH = `${stubDir}:${origPath ?? ''}`;

      // Heartbeat: a task with zero relation to rebuild.ts, standing in for "any other work
      // this process needs to do concurrently" (a webhook ack, a health check, another job).
      // If the event loop is starved, this is what actually suffers in production.
      const ticks: number[] = [Date.now()];
      const heartbeat = setInterval(() => ticks.push(Date.now()), HEARTBEAT_INTERVAL_MS);

      // Unbounded fan-out across orgs (no mapLimit at this level, same as a burst of concurrent
      // webhook-triggered jobs): each org's one `ls-tree` call plus its DECISIONS_PER_ORG `show`
      // calls (mapLimit-bounded WITHIN one rebuild, see rebuild.ts) all go through the slow stub.
      // ORG_COUNT * (1 + DECISIONS_PER_ORG) = 16 slow git calls happen across this one batch.
      await Promise.all(orgs.map((o) => rebuildIndexFromGit(pool, o.orgId, o.dir, o.head, undefined)));

      clearInterval(heartbeat);
      ticks.push(Date.now());
      let maxGapMs = 0;
      for (let i = 1; i < ticks.length; i++) maxGapMs = Math.max(maxGapMs, ticks[i]! - ticks[i - 1]!);
      console.error('[event-loop-t99]', { maxHeartbeatGapMs: maxGapMs, heartbeatTicks: ticks.length, gitSleepMs: GIT_SLEEP_MS });

      // If even ONE of the 16 slow git calls above ran synchronously on the main thread with no
      // yield point, the heartbeat would be starved for close to GIT_SLEEP_MS (300ms) during
      // that call -- the pre-T99 execFileSync code runs them all back-to-back with no yields in
      // between (see 4 log/event-loop-red.txt: measured max several seconds, consistently >>
      // this threshold). The async execFile + mapLimit code yields on every await, so the
      // heartbeat never falls meaningfully behind its own interval (4 log/event-loop-green.txt:
      // max well under 150ms, 5/5 runs).
      expect(maxGapMs).toBeLessThan(MAX_ALLOWED_HEARTBEAT_GAP_MS);

      for (const o of orgs) {
        await pool.query('delete from nodes where org_id = $1', [o.orgId]);
        await pool.query('delete from relations where org_id = $1', [o.orgId]);
      }
      await closePool(pool);
    },
    30000
  );
});
