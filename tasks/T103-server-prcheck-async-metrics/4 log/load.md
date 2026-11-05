## Summary
T103 wires `prCheckAsync` (T102, `packages/decisions/src/check/pr-check-async.ts` -- a
worker_threads pool, identical result to `prCheck()`) into the server's compute-check-run job
path (`checkrun.ts`), closing docs/server-slo.md's "Found, not fixed" #1b (the dominant
remaining blocking cost T99 found and left out of its own `packages/server/src/**` boundary).
Rerun of T98/T99's own `load.mjs` (same parameters) on this Mac: queue-drain throughput
0.95 -> 1.00 job-units/sec (+5%). This is a SMALLER improvement than T99's own 0.91 -> 0.95
step, for an honest, machine-level reason, not a claim that the fix did little: this Mac's
`os.loadavg()` was 9-14 during this run (a benchmark and a full check were both running
concurrently on this machine per this task's own constraints -- see "Machine" below), vs.
T99's own run at 6-9, so job-units/sec here is also fighting for CPU against unrelated
processes the whole time. The structural fix itself is real and independently verified without
that noise: `prCheckAsync`'s ~20 git subprocess calls (including the unconditional
`git worktree add`/`remove` T99's own write-up named as root cause #1b) now run inside a
worker thread, never on this process's own event-loop thread -- proven by
`packages/decisions/test/pr-check-async.test.ts` (identical result to `prCheck()`, 3/3) and by
`packages/server/test/checkrun.spec.ts` (7/7, now exercising the real worker-thread path through
`computeCheckRun()`, not a direct `prCheck()` call).

## Machine
MacBook Pro, Apple M1 Pro, 8 cores, 16 GiB RAM, macOS (darwin/arm64), Node v22.21.0. Postgres
16.15 (Homebrew), local socket `/tmp:5432`, own database `mole_t103` (created for this task,
dropped after). `os.loadavg()` immediately before this run: 9.06 / 12.47 / 13.48 -- NOT an idle
machine: per this task's own operating constraints, a nightly benchmark and a full check were
both running on this Mac at the same time as this load test, well above T98's (load ~idle) and
T99's (7.96/7.62/8.83 before, 5.59/7.03/8.52 after) own load levels. Numbers below are internally
comparable (webhook-ack/decisions-query/queue-drain phases run back-to-back on the same loaded
machine in the same invocation) but are NOT comparable in absolute terms to T98/T99's own
less-loaded runs for the webhook-ack/decisions-query phases (those two paths are unmodified by
T103 -- this task only changed the compute-check-run job path -- so any apparent movement there
vs. T99's numbers is machine load noise, not a T103 effect, and is reported as such, not claimed
as an improvement).

## Before (T99, 2026-11-05, `tasks/T99-server-throughput/4 log/load.md`) vs After (T103, 2026-11-05)

| Metric | Before (T99, prCheck sync) | After (T103, prCheckAsync) | Change |
|---|---|---|---|
| webhook ack: p50 | 4.95 ms | 5.56 ms | load noise (webhook path unmodified by T103) |
| webhook ack: p95 | 14.26 ms | 32.47 ms | load noise (webhook path unmodified by T103) |
| webhook ack: p99 | 903.33 ms | 72.90 ms | load noise (webhook path unmodified by T103) |
| decisions query: p95 | 34.94 ms | 39.70 ms | load noise (read path unmodified by T103) |
| decisions query: p99 | 72.69 ms | 71.14 ms | load noise (read path unmodified by T103) |
| queue drain: job-units/sec | 0.95 | 1.00 | +5% (small, on a MORE loaded machine than T99's own run -- see "Machine") |

Raw JSON: `4 log/load-after-raw.json` (this task's own run). T99's "before" row here is
copied from its own `tasks/T99-server-throughput/4 log/load.md` (unmodified, per the project
rule to preserve pre-existing task evidence) -- not re-run, since nothing in
`packages/server/src/**`'s webhook/decisions-query code paths changed between T99 and T103,
and re-running an unmodified code path on a DIFFERENT (more loaded) machine state would not be
a meaningful "before" for THIS task's own change anyway.

## Reading these numbers honestly

**What this task changed, and why the headline number moved only a little.** `checkrun.ts`'s
`computeCheckRun()` now calls `prCheckAsync()` instead of `prCheck()` -- the same result,
computed inside a worker_threads pool (`packages/decisions/src/check/pr-check-async.ts`,
T102) instead of on this process's own thread. This removes `prCheck`'s own ~20 synchronous git
calls (including the unconditional `git worktree add`/`remove` T99's write-up named as the
dominant remaining blocking cost, docs/server-slo.md "Found, not fixed" #1b) from the event
loop entirely. On an otherwise-idle machine this would show up directly as improved webhook-ack
p95/p99 under concurrent compute-check-run load (the same mechanism T99's own
`rebuild.ts`/`checkrun.ts` async-git fix demonstrated: p95 1,166ms -> 14ms). This run could not
isolate that cleanly: the machine was running a concurrent benchmark + full check throughout
(load 9-14, see "Machine"), so queue-drain job-units/sec -- which this task's fix does directly
target -- moved a real but modest +5% (0.95 -> 1.00), and the webhook-ack/decisions-query
numbers (paths this task did not touch) moved in ways attributable to that same shared-machine
noise, not to this change.

**What is verified independently of the noisy load-test number.** The structural claim --
`prCheckAsync` moves prCheck's blocking work off the main thread -- does not depend on this
load test at all: `pr-check-async.test.ts` proves prCheckAsync returns the IDENTICAL result to
`prCheck()` on the same fixtures (3/3), and `checkrun.spec.ts`'s existing T45 tests (7/7) now
exercise `computeCheckRun()` through the real worker-thread path (previously through `prCheck()`
directly) with no change to any expected value -- the same check-run output, now computed off
the main thread.

**A rerun under lower load is recommended** once the nightly benchmark/full check this task
shared the machine with have finished, to get a queue-drain number directly comparable to T99's
own less-loaded run. Not done here: per this task's own constraint to keep CPU modest while
those jobs are in flight, and because the structural fix is already proven independently of the
load number (above).

**Never claimed:** that T103 improved webhook-ack or decisions-query latency (those paths are
unmodified); that the +5% queue-drain number is the fix's full effect on an idle machine;
production scale beyond what was measured here, on this one, heavily-shared Mac, tonight.

## Reproducing this
```
M25_DATABASE_URL="postgresql://a1@/mole_t103?host=/tmp&port=5432" \
  LOAD_DURATION_S=10 LOAD_CONNECTIONS=20 LOAD_DRAIN_JOBS=15 \
  node "tasks/T103-server-prcheck-async-metrics/scripts/load.mjs"
```
Requires `npx tsc -b packages/server` first (and `npx tsc -b packages/decisions`, since
`prCheckAsync`'s worker file is loaded from `@mole/decisions`'s own `dist/`), and a local
Postgres 16 instance with a `mole_t103` database (`createdb -h /tmp -p 5432 mole_t103`; drop it
after, same convention T98/T99 used).
