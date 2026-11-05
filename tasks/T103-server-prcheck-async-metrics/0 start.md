---
state: built, needs review
owner: deleg-t103
repo: /Users/a1/Desktop/CS Code/Project/Mole
branch: ledger/t103-server-prcheck-async-metrics
worktree: /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T103-server-prcheck-async-metrics
base: c7bd86a
status: built, not yet reviewed or integrated
next: adversarial review (sdlc 4-verify/4-adversarial-review), then ledger integrate
---
```notes
T103-server-prcheck-async-metrics   closes both of T99's "Found, not fixed" items (docs/server-slo.md):
                              (1b) compute-check-run jobs still block the event loop via prCheck's own
                              ~20 sync git calls; (4) no Prometheus /metrics.
    goal                      (1) wire T102's prCheckAsync (worker-thread pool, identical result to
                              prCheck) into packages/server/src/checkrun.ts's computeCheckRun(); shut the
                              pool down on graceful close (SIGTERM test must still pass); (2) add a
                              Prometheus /metrics endpoint the standard way for this stack; (3) rerun
                              T98/T99's load.mjs before/after, publish jobs/s + webhook p50/p95/p99 in
                              docs/server-slo.md; (4) tests + tsc -b + targeted vitest runs.
    done-when                 checkrun.ts imports prCheckAsync not prCheck (1-line call-site change,
                              same CheckRunResult shape); index.ts calls shutdownPrCheckAsyncPool() in
                              ServerHandle.close(); packages/server/src/metrics.ts (OTel metrics +
                              @opentelemetry/exporter-prometheus, GET /metrics wired into index.ts,
                              reply.hijack() against the exporter's own request handler -- no second
                              HTTP server/port); metrics: http.server.request.duration (OTel semconv),
                              mole.job.duration/count by queue+outcome, mole.outbox.pending/dead_letter
                              gauges, mole.prcheck.pool.queue_depth gauge; packages/decisions/src/check/
                              pr-check-async.ts gets queueDepth()/getPrCheckPoolQueueDepth() and a
                              renamed-but-compatible shutdownPrCheckAsyncPool() (keeps the old
                              __resetPrCheckAsyncPool test name as an alias); test/metrics.spec.ts (4/4:
                              scrape parses as real Prometheus text format, http_server_request_duration
                              count moves after real requests, mole_job_count_total moves after a real
                              recordJob call, outbox gauges present); existing test/checkrun.spec.ts
                              (7/7, unchanged expectations, now exercising the real prCheckAsync path)
                              and packages/decisions/test/pr-check-async.test.ts (3/3) prove identical
                              results; test/crash-restart.spec.ts (2/2, real child process, unchanged --
                              SIGTERM still exits 0 with the pool shutdown added); tasks/T103-.../4 log/
                              load.md (queue-drain 0.95 -> 1.00 job-units/sec on a heavily-loaded shared
                              Mac, see that file for the honest load-noise accounting); npx tsc -b
                              packages/decisions + packages/server clean; every server test file run
                              individually (16/17 pass; packages/server/test/outbox.spec.ts fails only
                              when run AFTER other files share its long-lived DB -- pre-existing,
                              documented in docs/server-slo.md's own "Test isolation" note; passes 5/5
                              alone on a fresh database, confirmed).
    boundary                   packages/server/src/{checkrun,index,metrics}.ts,
                              packages/server/package.json + root package-lock.json (added
                              @opentelemetry/exporter-prometheus@0.300.0, @opentelemetry/
                              sdk-metrics@3.0.0 -- exact-pinned, version-matched to this package's
                              existing OTel deps), packages/server/test/metrics.spec.ts,
                              packages/decisions/src/check/{pr-check-async,index}.ts,
                              tasks/T103-server-prcheck-async-metrics/**.
    non-goals                  converting prCheck's own ~20 execFileSync call sites to async in place
                              (that is what T102's worker-thread pool sidesteps -- see docs/server-slo.md
                              1b's "T103's fix" paragraph); explicit Prometheus histogram bucket
                              boundaries for the http.server.request.duration metric (this version of
                              @opentelemetry/sdk-metrics has no View API -- documented limitation in
                              docs/server-slo.md item 4); a lower-load load.mjs rerun (left as a
                              documented follow-up once the concurrent benchmark/full check finish).
    proof                     tasks/T103-server-prcheck-async-metrics/4 log/load.md,
                              4 log/load-after-raw.json, docs/server-slo.md (Summary + audit row +
                              "Found, not fixed" #1b and #4, both now FIXED BY T103).
    stop                       review, then ledger integrate.
```
