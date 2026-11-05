// T102: prCheckAsync -- the SAME prCheck() result, computed in a worker_threads pool so the caller's own event
// loop is never blocked by this package's git subprocess calls (execFileSync: rev-parse, diff, show, worktree
// checkout...). This is for the server's compute-check-run job path (T99: "synchronous git subprocess calls
// block the event loop... found and measured, not fixed"); the CLI and Claude Code hooks keep calling prCheck()
// directly (no worker startup cost, and since the worker runs the literal same implementation the two can never
// drift -- proven identical in test/pr-check-async.test.ts by diffing both on the same fixtures).
//
// Why a worker thread and not a rewrite of every git call to promisified execFile: prCheck's own git calls
// (pr-check.ts) could be converted, but computeFlags/checkAnchor (flags.ts/anchors.ts) and the rules engine's
// dependency-cruiser cruise (rules/check.ts) are separate, synchronous call paths shared with `mole check` and
// other commands well beyond prCheck -- converting them too is a much larger, riskier change than this task's
// bounded scope (see 2 insights.md). A worker thread sidesteps the whole question: blocking ANY synchronous work
// inside a worker's own event loop never blocks the main thread's, which is Node's own documented reason for
// worker_threads existing at all ("Worker threads are useful for performing CPU-intensive JavaScript operations;
// they do not help much with I/O-intensive work... but can also be used when expensive synchronous work that
// cannot be refactored must run" -- nodejs.org/api/worker_threads.html, "When to use Worker threads").
import os from 'node:os';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import type { PrCheckOptions, PrCheckResult } from './types.js';

/** Worker file: dist/src/check/pr-check-worker.js next to this module when built, or (under vitest, which runs
 *  the .ts sources directly) the built copy in the sibling dist tree -- the same convention packages/daemon's
 *  server.ts already uses for its own index worker (see its workerFile()). */
function workerFile(): string {
  const here = fileURLToPath(import.meta.url);
  if (here.endsWith('.ts')) {
    const built = join(dirname(here), '../../dist/src/check/pr-check-worker.js');
    if (existsSync(built)) return built;
  }
  return join(dirname(here), 'pr-check-worker.js');
}
const WORKER_URL = workerFile();

interface PendingJob {
  resolve: (r: PrCheckResult) => void;
  reject: (e: unknown) => void;
}
interface WorkerMsg {
  id: number;
  ok: boolean;
  result?: PrCheckResult;
  error?: { message: string };
}

/** Bounded-concurrency worker pool (same shape as pg-boss's own `teamConcurrency`/`batchSize` knobs, per its docs
 *  cited in tasks/T99-server-throughput): at most `size` prCheck() calls run at once; more queue. */
class PrCheckPool {
  private workers: Worker[] = [];
  private idle: Worker[] = [];
  private queue: Array<{ opts: PrCheckOptions; job: PendingJob }> = [];
  private pending = new Map<Worker, Map<number, PendingJob>>();
  private nextId = 1;
  constructor(private size: number) {}

  private spawn(): Worker {
    const w = new Worker(WORKER_URL);
    this.pending.set(w, new Map());
    w.on('message', (msg: WorkerMsg) => {
      const jobs = this.pending.get(w);
      const p = jobs?.get(msg.id);
      jobs?.delete(msg.id);
      if (p) {
        if (msg.ok) p.resolve(msg.result!);
        else p.reject(new Error(msg.error?.message ?? 'prCheckAsync worker error'));
      }
      this.idle.push(w);
      this.drain();
    });
    w.on('error', (err: unknown) => {
      for (const p of this.pending.get(w)?.values() ?? []) p.reject(err);
      this.pending.delete(w);
      this.workers = this.workers.filter((x) => x !== w);
      this.idle = this.idle.filter((x) => x !== w);
    });
    w.unref(); // an idle worker must never keep the server process alive on its own
    return w;
  }

  private drain(): void {
    while (this.idle.length && this.queue.length) {
      const w = this.idle.shift()!;
      const next = this.queue.shift()!;
      const id = this.nextId++;
      this.pending.get(w)!.set(id, next.job);
      w.postMessage({ id, opts: next.opts });
    }
  }

  run(opts: PrCheckOptions): Promise<PrCheckResult> {
    return new Promise((resolve, reject) => {
      if (this.workers.length < this.size) {
        const w = this.spawn();
        this.workers.push(w);
        this.idle.push(w);
      }
      this.queue.push({ opts, job: { resolve, reject } });
      this.drain();
    });
  }

  /** Test-only: terminate every worker (so a test file's process can exit cleanly without waiting on unref'd
   *  workers that vitest's watcher would otherwise still see as open handles under --reporter=verbose). */
  async terminateAll(): Promise<void> {
    await Promise.all(this.workers.map((w) => w.terminate()));
    this.workers = [];
    this.idle = [];
    this.pending.clear();
    this.queue = [];
  }
}

let pool: PrCheckPool | undefined;
function getPool(): PrCheckPool {
  const envSize = Number(process.env.MOLE_PRCHECK_CONCURRENCY);
  const size = Number.isFinite(envSize) && envSize > 0 ? Math.floor(envSize) : Math.max(1, Math.min(4, os.cpus().length));
  pool ??= new PrCheckPool(size);
  return pool;
}

/** Same result as prCheck(), computed in a worker thread pool instead of the caller's own thread. See this
 *  file's header for why; CLI and hooks keep using prCheck() directly. */
export function prCheckAsync(opts: PrCheckOptions): Promise<PrCheckResult> {
  return getPool().run(opts);
}

/** Test-only hook: drop the shared pool's workers between test files. Never called by production code. */
export async function __resetPrCheckAsyncPool(): Promise<void> {
  if (pool) await pool.terminateAll();
  pool = undefined;
}
