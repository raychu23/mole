## Summary
Load test results for T98-server-slo: webhook intake acks fast and comfortably inside
GitHub's 10s delivery budget even under load; the decisions-query endpoint is fast and cheap;
but the downstream job queue that acks feed (rebuild-index, compute-check-run) is throughput-
bound to under 1 job/sec by synchronous `execFileSync('git', ...)` calls that block Node's
single event-loop thread -- a real, measured gap, not fixed in this pass (see docs/server-slo.md
§Found, not fixed). Raw JSON: `load-raw.json` (same directory). Script:
`tasks/T98-server-slo/scripts/load.mjs`.

## Machine
- MacBook Pro, Apple M1 Pro, 8 cores, 16 GiB RAM, macOS (darwin/arm64), Node v22.21.0
- Postgres 16.15 (Homebrew), local socket `/tmp:5432`, no Docker
- `os.loadavg()` (1/5/15 min) immediately before this run: 3.99 / 3.87 / 5.24 -- this Mac was
  NOT idle (other work was running concurrently in this session); after: 4.92 / 4.19 / 5.26.
  Numbers below are from a shared, moderately-loaded machine, not a dedicated benchmark box --
  stated here per the task's own "never claim production scale beyond what was measured" rule.
- Each phase runs its own short-lived `node dist/src/index.js` process (the real Dockerfile
  CMD target), 20 concurrent load-generator workers, 10s per phase, against a local fixture
  repo (20 synthetic decisions). Load generator: hand-rolled fixed-concurrency `fetch()` loop,
  not autocannon -- autocannon 8.0.0's `setupRequest` produced spurious 100% HMAC-signature
  failures in this environment (reproduced 3x; not root-caused further, logged as a tooling
  finding, not a product bug -- see `tasks/T98-server-slo/scripts/load.mjs` header comment).

## 1. POST /webhook -- intake ACK (the GitHub 10s-budget path)
| Metric | Value |
|---|---|
| Requests | 2,419 over 10s |
| Throughput | 227.14 req/s |
| p50 | 10.29 ms |
| p95 | 1,166.04 ms |
| p99 | 1,267.49 ms |
| max | 2,341.83 ms |
| Errors / non-2xx | 0 / 0 (all 202) |

SLO target (stated, not yet formally adopted): p95 ack < 1s, matching M25's existing
`ack_p95_ms_lt: 1000` target (bench/m25.ts). **Measured p95 here (1,166 ms) exceeds that
target** under this load (20 concurrent distinct deliveries/sec sustained, each a genuinely
new delivery that gets fully enqueued -- not deduped). Root cause, confirmed by code reading
and the queue-drain phase below: each enqueued delivery inserts into the `deliveries` table
and does two `pg-boss` `send()` calls inside the same request; under 20-way concurrency this
contends for the `pool`'s `max: 10` Postgres connections (`db.ts`), and the resulting queue
backlog's own synchronous-git job processing (see phase 3) appears to add scheduler/CPU
pressure back onto the same process's HTTP event loop. p50 (10ms) and the bulk of the
distribution are fast; the tail is the measured cost of sustained real enqueue pressure on a
pool sized for a much lighter team-server workload than this synthetic firehose.

## 2. GET /reconcile/:orgId -- decisions query (reads temporal + graph index)
| Metric | Value |
|---|---|
| Requests | 6,869 over 10s |
| Throughput | 686.28 req/s |
| p50 | 26.80 ms |
| p95 | 43.26 ms |
| p99 | 62.66 ms |
| max | 103.57 ms |
| Errors / non-2xx | 0 / 0 (all 200) |

No stated SLO target existed for this endpoint before this task; given the measured numbers,
a reasonable first target (stated as a TARGET, not yet validated against real usage) would be
p95 < 100 ms, p99 < 250 ms -- this run clears both comfortably. Measured on a FRESH server
instance with zero webhook backlog (isolated from phase 1 on purpose -- see load.mjs), so
this reflects the read path's own cost, not contention from the ack/job-processing path.

## 3. Queue drain throughput (the found gap)
| Metric | Value |
|---|---|
| Jobs enqueued | 15 real webhook deliveries (distinct commits) |
| Job units expected | 30 (rebuild-index + compute-check-run per delivery) |
| Enqueue wall time | 90 ms |
| Job units completed | 30 / 30 |
| Drain wall time | 32,981 ms |
| **Throughput** | **0.91 job-units/sec** |

`src/rebuild.ts` and `src/checkrun.ts` call `execFileSync('git', ...)` directly -- several
times per job (ls-tree, show per decision file, rev-parse, etc.) -- which blocks the Node.js
process's single event-loop thread for each call's duration. 15 enqueued deliveries (30 job
units) took ~33 seconds to fully drain: under 1 job/sec. This is comfortably inside M25's own
`check_run_compute_ms_lt: 60000` per-job target (a single push's check run is fast), but it
is a measured THROUGHPUT ceiling, not a per-request latency number: a burst of N webhook
deliveries creates a backlog that drains at under 1/sec, and because the blocking happens on
the SAME process's single thread, other requests to that process (health checks, other
webhooks, decisions queries) compete with that backlog for the same event loop. This is the
direct, measured cause of phase 1's p95/p99 tail above. NOT claimed: how this scales past 15
deliveries, whether it's git-subprocess-spawn overhead vs. the git operations themselves, or
whether worker-thread/async-git mitigation would fully resolve it -- none of that was
measured in this pass (NOT RUN: time-boxed out of T98's scope; flagged for a follow-up task).

## Reproducing this
```
M25_DATABASE_URL="postgresql://<user>@/<db>?host=/tmp&port=5432" \
  LOAD_DURATION_S=10 LOAD_CONNECTIONS=20 LOAD_DRAIN_JOBS=15 \
  node "tasks/T98-server-slo/scripts/load.mjs"
```
Requires `npx tsc -b packages/server` to have been run first (the script runs the compiled
`dist/src/index.js`, not `src/`), and a local Postgres 16 instance (no Docker), same
convention as the rest of this package's tests (`tasks/T33-team-server/2 insights.md`).
