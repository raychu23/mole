## Summary
packages/server is a working GitHub-webhook-driven team server (Postgres, pg-boss queue,
transactional outbox, OAuth-bearer MCP endpoint, OTel spans) but had four real production
gaps before this task: no SIGTERM handling at all, an outbox relay path with zero production
callers (queued check-runs were never delivered), liveness/readiness conflated into one
`/health` route, and no request/connection timeouts. All four are fixed here, with tests,
against the REAL compiled entrypoint (not a mock). Load-tested on this Mac: webhook ack and
the decisions query are both fast; the job queue those acks feed is throughput-bound to under
1 job/sec by synchronous git subprocess calls -- found and measured, not fixed (time-boxed
out of this task's scope). Full numbers: `tasks/T98-server-slo/4 log/load.md`.

## Audit (what existed, what was missing)
Read: `packages/server/src/*`, `packages/server/bench/m25.ts`, `context/0 start.md` (T33/T47
notes pointed at `tasks/T33-team-server/*` -- the team server's original build task -- and
`tasks/T47-...` multiversion/property tests, neither of which touches this task's scope).

| Area | Before | Gap |
|---|---|---|
| Idempotent webhook delivery | **Already done.** `webhook.ts` dedupes on `X-GitHub-Delivery` via a DB unique-key insert (`deliveries` table), survives a restart. | none found |
| Graceful shutdown | **Missing entirely.** `index.ts` had zero `process.on('SIGTERM'/'SIGINT')` handlers; the Dockerfile's `node dist/src/index.js` would hit Node's default signal handling (immediate exit, no drain) on any orchestrator stop/rolling deploy. | fixed |
| Outbox relay in production | **Wired nowhere.** `relayOutboxOnce()` existed and was unit-tested, but the only callers were `bench/m25.ts` and tests -- a real running server queued `outbox` rows (check-run notifications) and delivered **zero** of them, forever. | fixed |
| Retry/backoff + dead-letter on the outbox | **Missing.** `relayOutboxOnce` claimed up to 50 rows and resolved them in ONE transaction: a single failing row rolled back every row in that batch (including already-succeeded sends), and a permanently-failing row was re-claimed and re-sent on every tick with no backoff or give-up point. | fixed |
| `/healthz` + `/readyz` | **Conflated.** One `/health` route answered both "is the process alive" and "should traffic be routed here" -- the k8s/SRE convention is to split them (a draining-but-alive process is a different signal than a dead one). | fixed |
| Request/connection timeouts | **Unset.** Fastify's `requestTimeout`/`connectionTimeout` were never configured; a hung client could hold a connection indefinitely, inconsistent with GitHub's own 10s webhook delivery budget. | fixed |
| Migrations | `db.ts`'s `runMigrations` is idempotent (`create table if not exists` + an advisory lock against concurrent-DDL races) but is not a versioned migration tool (no up/down, no migration log). | audited, NOT changed (not in the top-4 picked; see Non-goals) |
| Structured logs | Fastify's `logger: true` already emits structured (pino) JSON logs with request IDs. | already adequate |
| Prometheus `/metrics` | **Missing** (OTel tracing exists via `telemetry.ts`'s in-memory exporter; no metrics exporter, no `prom-client`). | audited, NOT built (see Non-goals) |

## Prior art (fetched + dated 2026-11-04/05)
- Google SRE book, ch.4 "Service Level Objectives" (sre.google/sre-book/service-level-objectives)
  and the SRE workbook ch.2 "Implementing SLOs" (sre.google/workbook/implementing-slos):
  SLIs/SLOs/error budgets; an SLO document states a target + how it was derived (measured vs.
  assumed) -- followed here: every number in `4 log/load.md` is labeled measured, every target
  is labeled target, never conflated.
- GitHub Docs, "Best practices for using webhooks" (docs.github.com/en/webhooks/using-webhooks/
  best-practices-for-using-webhooks): respond 2xx within 10 seconds or GitHub marks the
  delivery failed; use a queue so the ack path never waits on the real work. `webhook.ts`
  already followed this (verify -> dedupe -> enqueue, ack immediately); this task's request-
  timeout addition (9.5s, strictly under GitHub's 10s) and the queue-drain load-test finding
  are both framed against this same budget.
- OpenTelemetry semantic conventions, `http.server.request.duration` /
  `http.server.active_requests` (github.com/open-telemetry/semantic-conventions, v1.38.0 +
  release/v1.23.x): the standard shape for HTTP server metrics. Read for the (not built this
  pass) `/metrics` gap -- see Non-goals.
- autocannon (npmjs.com/package/autocannon, 8.0.0; github.com/mcollina/autocannon): the
  standard Node HTTP load-testing tool, cited as R0 prior art for the load test. Tried first;
  its `setupRequest`-based per-request body/header mutation produced spurious 100% HMAC-
  signature failures against this server (reproduced 3x with no other variable changed,
  confirmed the SAME fixed body+headers passed via top-level options works at 202/100%
  success) -- not root-caused further (budget), logged as a tooling finding, and the load test
  fell back to a small hand-rolled fixed-concurrency `fetch()` loop (same methodology:
  p50/p95/p99 of per-request latency, fixed duration, fixed connection count).
- pg-boss README / source (`node_modules/pg-boss`, v10.x): `stop({graceful, timeout})` lets
  in-flight jobs finish before a worker stops; `retryLimit`/`retryDelay`/`retryBackoff`/
  `deadLetter` bound how long a failing job is retried before being set aside. `queue.ts`
  already used the latter for pg-boss's OWN queue; this task applies the same retry/backoff/
  dead-letter SHAPE to `outbox.ts`'s relay loop, a separate failure domain pg-boss's own
  settings don't cover.
- Several 2026 Node.js graceful-shutdown write-ups (thenodebook.com "Node.js Signals, Exit
  Codes, and Graceful Shutdown"; devlift.dev "Node.js Graceful Shutdown"; openreplay.com blog,
  "Shutting Down a Node Server Gracefully"): the standard SIGTERM sequence -- flip readiness to
  503, stop accepting new connections (`server.close()`), drain in-flight work, close
  resources in dependency order, force-exit after a grace timeout shorter than the
  orchestrator's own grace period. Followed in `index.ts`'s `shutdown()` (isMain block) and
  `ServerHandle.close({graceful, timeoutMs})`.

## What was built (file:line)
- `packages/server/src/index.ts`: `/healthz` (pure liveness, never touches the DB),
  `/readyz` (stores reachable AND not draining -> 503 while shutting down), `/health` kept as
  an exact-contract alias of `/readyz`; `requestTimeout`/`connectionTimeout` on the Fastify
  constructor (env-overridable, `MOLE_REQUEST_TIMEOUT_MS`/`MOLE_CONNECTION_TIMEOUT_MS`); an
  outbox relay `setInterval` wired into `buildApp()` (env `OUTBOX_RELAY_INTERVAL_MS`, default
  5000, `0` disables it); `beginDraining()` + `ServerHandle.close({graceful, timeoutMs})`;
  real `process.on('SIGTERM'/'SIGINT')` handlers registered ONLY in the `isMain` block (never
  inside `buildApp`/`startServer` themselves, so in-process tests never attach a listener to
  the actual test-runner process) with a force-exit timer (`MOLE_SHUTDOWN_GRACE_MS`, default
  20000) shorter than any orchestrator's own grace period.
- `packages/server/src/outbox.ts`: `relayOutboxOnceDetailed()` claims and resolves EACH row in
  its OWN transaction (a failing row can never roll back another row's successful delivery),
  exponential backoff (`next_attempt_at`) and a `dead_letter` flag after `maxAttempts` (default
  8). `relayOutboxOnce()` kept as a back-compat wrapper (same return shape bench/m25.ts and
  pre-existing tests already use).
- `packages/server/src/checkRunSink.ts` (new): a pluggable delivery sink --
  `createHttpCheckRunSink(url)` POSTs to a configurable webhook URL (dev/staging recorder;
  works against `fakeGithub.ts`'s own `/check-runs` contract), `createUnconfiguredSink()`
  throws a clear, logged error on every attempt when nothing is configured (feeds the SAME
  retry/backoff/dead-letter path a real send failure would, rather than silently no-op-marking
  rows delivered). Mole never registers a real GitHub App (non-goal, `tasks/T33-team-server/0
  start.md`), so this is as far as "wired to production" goes without Raymond's accounts.
- `packages/server/src/db.ts`: migration adds `outbox.attempts`, `.next_attempt_at`,
  `.last_error`, `.dead_letter`.
- Tests: `packages/server/test/outbox.spec.ts` (+4: per-row isolation, backoff, dead-letter,
  back-compat shape), `packages/server/test/health.spec.ts` (new, 4 tests: healthz/readyz/
  health + draining), `packages/server/test/crash-restart.spec.ts` (new, 2 tests: a REAL
  `node dist/src/index.js` child process, SIGTERM-drains-cleanly-and-the-job-still-completes-
  after-restart, and kill -9-mid-queue-restart-no-lost-or-duplicated-job).
- Load test: `tasks/T98-server-slo/scripts/load.mjs` + `tasks/T98-server-slo/4 log/load.md` +
  `load-raw.json`.

## Found, not fixed (out of scope for this task, logged for a follow-up)
1. **Synchronous git subprocess calls block the event loop.** `rebuild.ts`/`checkrun.ts` call
   `execFileSync('git', ...)` directly, several times per job. Measured: 15 webhook deliveries
   (30 job units) drain at under 1 job/sec (`4 log/load.md` §3) -- a real throughput ceiling,
   and because the blocking is on the SAME process's single thread, a backlog competes with
   HTTP request handling (the measured webhook-ack p95/p99 tail under load is consistent with
   this). A fix (worker threads, or `execFile` + `await`) is a real change to a hot path used
   by every job type; time-boxed out of T98.
2. **pg-boss queue names are global to the Postgres instance, not scoped per deploy/org set.**
   Found while building the load test: a server process that dies (crash, redeploy, or a test
   harness's intentional kill) can leave jobs queued for orgs it alone knew the repo dir for;
   ANY other process sharing the same queue names in the same DB will then claim, fail
   (`no repo dir configured for org X`), and retry/eventually dead-letter them -- consuming
   worker capacity meant for its own, unrelated jobs. This is inherent to pg-boss's queue
   model as used here (one global queue name per job type, no per-deploy namespace); a
   mitigation (namespaced queue names per deploy generation, or validating org existence
   before accepting a job) is a real design decision, not attempted here.
3. **Migrations are idempotent `CREATE TABLE IF NOT EXISTS`, not a versioned tool.** Fine for
   this stage; would need `node-pg-migrate` (already a prior-art candidate per
   `tasks/HANDOFF.md`) or similar before a second deploy needs an actual schema migration
   (renaming/dropping a column, backfilling data).
4. **No Prometheus `/metrics`.** OTel tracing (`telemetry.ts`) exists; a metrics exporter
   (`prom-client` or OTel metrics SDK, per the semantic-conventions cited above) was read
   about but not built -- picking the TOP 3-4 gaps by user impact (the task's own
   instruction) put graceful shutdown, outbox delivery, health-check correctness, and
   request timeouts ahead of it; the outbox's own `attempts`/`dead_letter` columns and the
   queue-drain load-test numbers above are the closest thing to a metric this pass produced.
5. **Cross-test-file pg-boss contention in this package's own test suite**, unrelated to
   product code: `test/index.spec.ts` and `test/index-temporal-e2e.spec.ts`, run concurrently
   (vitest's default), can steal each other's jobs off the shared global queue and flake.
   Reproduced on byte-for-byte unmodified `main`. Not fixed (test-infrastructure issue, not
   this task's scope); every test file in this task's own evidence was verified individually,
   per this package's own "targeted tests" convention. Details: `4 log/green.txt`.

## Non-goals (carried over from T33, still true here)
No real GitHub App registration, no paid API calls, no Docker (local Homebrew Postgres 16
only), no Raymond accounts/logins. Never claim production scale beyond what `4 log/load.md`
actually measured on this one Mac.
