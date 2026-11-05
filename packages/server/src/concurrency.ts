// T99 server-throughput: a small, dependency-free bounded-concurrency map, used to run a
// pg-boss batch's jobs with at most N in flight at once instead of either (a) one at a time
// (wastes the gain of making the underlying git calls async -- see rebuild.ts/checkrun.ts) or
// (b) all at once (unbounded subprocess fan-out under a burst). pg-boss 10.4.2 (this repo's
// installed version, node_modules/pg-boss/package.json) has no `localConcurrency` WorkOptions
// field (checked node_modules/pg-boss/types.d.ts's WorkOptions: includeMetadata, priority,
// batchSize, ignoreStartAfter only) even though pg-boss's own docs site (pgboss.io/api/workers,
// fetched 2026-11-05 via search snippet -- the live extractor was unavailable in this
// environment) documents `localConcurrency` as "per-node, control total parallel processing
// capacity" for a newer release; rather than claim an option this installed version doesn't
// have, bounded concurrency is implemented here, inside the batch handler, same effect.
export async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  const errors: unknown[] = [];
  let next = 0;
  const workerCount = Math.max(1, Math.min(limit, items.length));
  async function worker() {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      try {
        results[i] = await fn(items[i]!, i);
      } catch (e) {
        errors.push(e);
      }
    }
  }
  await Promise.all(Array.from({ length: workerCount }, worker));
  // Preserve the pre-existing "a batch fails as one unit if anything in it failed" contract
  // (rebuild.ts/checkrun.ts callers rethrow to let pg-boss mark the job(s) failed/retried) --
  // only the FIRST error is rethrown (pg-boss's own job-failure payload only has room for one
  // error anyway); every item still runs to completion first (no early cancellation of
  // in-flight siblings), unlike a plain `for` loop with `await` that stops at the first throw.
  if (errors.length > 0) throw errors[0];
  return results;
}
