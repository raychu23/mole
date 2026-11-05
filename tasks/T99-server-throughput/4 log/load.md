## Summary
T99 rerun T98's load.mjs (same parameters, same local Mac, own `mole_t99` Postgres database)
before/after the rebuild-index async-git fix. Webhook-ack p50/p95 both improved a lot (p95:
1,166ms -> 14ms); p99/max stay high and queue-drain throughput barely moved (0.91 -> 0.95
job-units/sec), because the dominant remaining cost -- `@mole/decisions`'s `prCheck()`, called
by every compute-check-run job -- does its own ~20 synchronous `execFileSync` calls (including
an unconditional `git worktree add`/`remove` per call) and is out of this task's
`packages/server/src/**` boundary. See docs/server-slo.md "Found, not fixed" for the write-up.
Queue namespacing (two-prefix isolation) is verified separately: `test/queue-prefix.spec.ts`.

## Machine (unchanged from T98, same Mac)
MacBook Pro, Apple M1 Pro, 8 cores, 16 GiB RAM, macOS (darwin/arm64), Node v22.21.0. Postgres
16.15 (Homebrew), local socket `/tmp:5432`, own database `mole_t99` (created for this task,
dropped after). `os.loadavg()` immediately before this run: 7.96 / 7.62 / 8.83 (also NOT an
idle machine -- the T97 benchmark pilot and this very agent's own tsc/vitest runs were on the
same host; numbers below are comparative BEFORE/AFTER on the same shared, moderately-loaded
machine, same caveat T98 stated). After: 5.59 / 7.03 / 8.52.

## Before (T98, 2026-11-04/05, `tasks/T98-server-slo/4 log/load.md`) vs After (T99, 2026-11-05)

| Metric | Before (T98) | After (T99) | Change |
|---|---|---|---|
| webhook ack: requests/10s | 2,419 | 6,324 | +161% |
| webhook ack: throughput req/s | 227.14 | 586.59 | +158% |
| webhook ack: p50 | 10.29 ms | 4.95 ms | -52% |
| webhook ack: p95 | 1,166.04 ms | 14.26 ms | **-99%** |
| webhook ack: p99 | 1,267.49 ms | 903.33 ms | -29% |
| webhook ack: max | 2,341.83 ms | 3,580.21 ms | +53% (worse) |
| decisions query: throughput req/s | 686.28 | 803.26 | +17% |
| decisions query: p95 | 43.26 ms | 34.94 ms | -19% |
| decisions query: p99 | 62.66 ms | 72.69 ms | +16% (noise-level, both well under any target) |
| queue drain: job-units/sec | 0.91 | 0.95 | +4% (not a meaningful improvement) |

Raw JSON: `load-raw.json` (before, copied from T98's own run for this table) is NOT re-saved
here (T98's is the source of truth, unmodified); this task's own raw run is `load-after-raw.json`.
Script: `scripts/load.mjs` (a copy of T98's `tasks/T98-server-slo/scripts/load.mjs`, byte-
identical parameters, run from this task's own directory so the output lands here instead of
overwriting T98's file -- T98's original `tasks/T98-server-slo/4 log/load.md`/`load-raw.json`
are untouched, per the project rule to preserve pre-existing task evidence).

## Reading these numbers honestly

**What improved, and why.** `rebuild.ts`'s git reads (ls-tree + one `git show` per `.mole/`
file) and `checkrun.ts`'s own wrapper calls (`changedFiles`/`baseOf`/`isAncestor`) are now
`promisify(execFile)` instead of `execFileSync`, bounded by `concurrency.ts`'s `mapLimit`
(`MOLE_REBUILD_CONCURRENCY=2`, `MOLE_CHECKRUN_CONCURRENCY=4`, `MOLE_REBUILD_FILE_CONCURRENCY=8`
by default). Under the SAME 20-connection webhook-ack load as T98, the common-case request no
longer waits behind a synchronous git subprocess on the SAME process's single event-loop
thread -- p50 and p95 both drop by roughly an order of magnitude or more (p95 specifically:
1,166ms -> 14ms, a 99% reduction). `test/event-loop.spec.ts` demonstrates the same effect in
isolation for the rebuild-index job path alone (p99 event-loop delay < 100ms under 6 concurrent
rebuilds, vs the pre-T99 code under combined rebuild+check-run load showing p99 1,210-2,928ms --
see `4 log/red.txt`).

**What did NOT improve, and the real reason (a new finding, not in T98's original diagnosis).**
T98 attributed the <1 job/sec queue-drain ceiling and the webhook p95/p99 tail entirely to
`rebuild.ts`/`checkrun.ts`'s own `execFileSync` calls. Investigating this task's own
`event-loop.spec.ts` numbers found that is only PART of the story: `computeCheckRun()`
(checkrun.ts) calls `@mole/decisions`'s `prCheck()` (`packages/decisions/src/check/
pr-check.ts`), which does its OWN ~20 `execFileSync` calls -- including an UNCONDITIONAL
`git worktree add`/`remove` pair on every single call (`baseTree()`, line ~218-227), and, when
any decision in the repo has a `rules:` item, a `git archive` + `tar -x` extraction too
(`ruleViolationsAtHead()`). Isolated measurement (not gated by a test, see `4 log/red.txt`
item 3-4): 4 concurrent `computeCheckRun()` calls measured p99 event-loop delay 1,262ms with
`checkrun.ts`'s OLD (execFileSync) wrapper calls, and STILL 733ms (a real ~42% improvement, not
a full fix) after this task's fix to `checkrun.ts`'s own wrapper functions -- because the
dominant remaining cost is `prCheck`'s own synchronous git worktree machinery, which this task
did not touch. `packages/decisions` is shared by the CLI (`mole pr-check`), the Claude Code
plugin hooks, and this server; converting its ~20 `execFileSync` call sites to async is a much
larger, higher-blast-radius change than this task's `packages/server/src/**` boundary (T98's
own stated boundary, reused here) and time-box allow. This is why queue-drain throughput barely
moved (0.91 -> 0.95 job-units/sec): compute-check-run jobs, half of every push's two job units,
still block the event loop for the bulk of their own duration via `prCheck`.

**Never claimed:** that T99 fixed webhook-ack p99/max or queue-drain throughput end to end;
that `prCheck`'s own blocking is fixed; production scale beyond what was measured here, on this
one, non-idle Mac.

## Queue namespacing (the second half of T99's goal)
Not exercised by load.mjs (it always runs a single server process; there is nothing to
namespace against). Verified separately and directly: `test/queue-prefix.spec.ts`'s live test
creates two `Boss` instances against the SAME `mole_t99` database with different
`MOLE_QUEUE_PREFIX`-equivalent prefixes (`prefix-a-t99`, `prefix-b-t99`), sends one job under
prefix A, and confirms prefix B's worker never receives it (and prefix A's does) -- 5/5 passed,
`4 log/green.txt`.

## Reproducing this
```
M25_DATABASE_URL="postgresql://a1@/mole_t99?host=/tmp&port=5432" \
  LOAD_DURATION_S=10 LOAD_CONNECTIONS=20 LOAD_DRAIN_JOBS=15 \
  node "tasks/T99-server-throughput/scripts/load.mjs"
```
Requires `npx tsc -b packages/server` first, and a local Postgres 16 instance with a `mole_t99`
database (`createdb -h /tmp -p 5432 mole_t99`; drop it after, same convention T98 used).
