## Summary
packages/server is a working GitHub-webhook-driven team server (Postgres, pg-boss queue,
transactional outbox, OAuth-bearer MCP endpoint, OTel spans) but had four real production
gaps before T98: no SIGTERM handling at all, an outbox relay path with zero production
callers (queued check-runs were never delivered), liveness/readiness conflated into one
`/health` route, and no request/connection timeouts. All four were fixed in T98, with tests,
against the REAL compiled entrypoint (not a mock). T98 load-tested on this Mac: webhook ack and
the decisions query were both fast; the job queue those acks feed was throughput-bound to under
1 job/sec by synchronous git subprocess calls -- found and measured, not fixed in T98 (time-
boxed out of that task's scope). Full T98 numbers: `tasks/T98-server-slo/4 log/load.md`.

**T99 (server-throughput, 2026-11-05)** picked up that finding: `rebuild.ts`'s and
`checkrun.ts`'s own git calls are now async (`promisify(execFile)`, bounded concurrency via a
small `mapLimit` helper), and pg-boss queue names are now namespaced by a configurable prefix
so two deployments sharing one Postgres instance never steal each other's jobs. Rerunning
T98's own load.mjs (same parameters) shows a real, large webhook-ack latency improvement
(p95 1,166ms -> 14ms) but queue-drain throughput barely moved (0.91 -> 0.95 job-units/sec),
because T99's own investigation found the DOMINANT remaining blocking source is
`@mole/decisions`'s `prCheck()` (called by every compute-check-run job), which does its own
~20 synchronous git calls including an unconditional `git worktree add`/`remove` -- out of
T99's `packages/server/src/**` boundary and a new "Found, not fixed" item below. Full numbers:
`tasks/T99-server-throughput/4 log/load.md`.

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

## Prior art (T99, fetched + dated 2026-11-05)
- Node.js docs, `child_process` "Asynchronous Process Creation" vs "Synchronous Process
  Creation" (nodejs.org/api/child_process.html): "the synchronous methods can have significant
  impact on... performance due to blocking the event loop while [they] complete" -- the exact
  mechanism behind T98's measured <1 job/sec queue-drain ceiling. `util.promisify(execFile)`
  (Node core, zero new dependency) was chosen over `simple-git` (npmjs.com/package/simple-git,
  a popular third-party git wrapper with a chained-command builder and its own queueing):
  every call site here is already a single plain `git <args>` invocation via the Node core
  API, with no need for simple-git's higher-level chaining; adding a dependency to replace a
  one-line `promisify()` call would also cut against T101 (package-size, same wave), which is
  independently working to reduce this tarball's runtime dependency count.
- pg-boss docs site, `pgboss.io/api/workers` (fetched via search snippet 2026-11-05; the live
  page extractor was unavailable in this environment): documents a `localConcurrency` option
  ("per-node, controls total parallel processing capacity") and `batchSize`/
  `pollingIntervalSeconds` on `work()`. Checked against THIS repo's installed pg-boss
  (`node_modules/pg-boss/package.json`, v10.4.2) via its own `types.d.ts`: `WorkOptions` has
  `includeMetadata`/`priority`/`batchSize`/`ignoreStartAfter` only -- no `localConcurrency`
  field exists in the installed version (grepped `node_modules/pg-boss/src/*.js` too: no
  match). Rather than claim an option this version doesn't have, bounded concurrency is
  implemented in `concurrency.ts`'s `mapLimit` (a small, dependency-free bounded-fan-out
  helper used inside each `boss.work()` batch handler) -- same effect (bound how many jobs/
  subprocess-reads run at once), different mechanism, documented honestly in
  `concurrency.ts`'s header comment.
- GitHub webhook best practices (cited above, unchanged): this task's queue-prefix default
  ('' -- the exact pre-T99 unprefixed names, fixed after review round 1 below) follows the same
  "safe zero-config default, explicit opt-in" shape GitHub's own guidance uses for retry/backoff
  config.

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

## What was built (T99, file:line)
- `packages/server/src/concurrency.ts` (new): `mapLimit()`, a dependency-free bounded-
  concurrency map (see "Prior art (T99)" above for why this exists instead of pg-boss's
  `localConcurrency`).
- `packages/server/src/rebuild.ts`: `git()`/`listMoleFilesAtRef()`/`readFileAtRef()` are now
  `async` (`promisify(execFile)` instead of `execFileSync`); `rebuildIndexFromGit`'s per-file
  reads run through `mapLimit` (`MOLE_REBUILD_FILE_CONCURRENCY`, default 8).
- `packages/server/src/checkrun.ts`: `changedFiles()`/`baseOf()`/`isAncestor()`/`resolveBase()`
  are now `async`; `computeCheckRun()` awaits them. (See "Found, not fixed" #1b: the call into
  `@mole/decisions`'s `prCheck()` inside this function still blocks, NOT fixed here.)
- `packages/server/src/queue.ts`: `queueName()`, `defaultQueuePrefixFromUrl()`,
  `resolveQueuePrefix()`; `createQueue()` takes an optional `prefix` (default `''`, exact
  pre-T99 behavior). `resolveQueuePrefix()`'s own default (MOLE_QUEUE_PREFIX unset) is ALSO `''`
  as of review round 1 (2026-11-05) -- see "Found, not fixed" #2 below for why that review round
  existed (the first cut defaulted to the database name, a blocking finding).
- `packages/server/src/webhook.ts`: `WebhookHandlerOptions.queuePrefix` (default `''`); sends
  to `queueName(prefix, 'rebuild-index'|'compute-check-run')` instead of the literal names.
- `packages/server/src/index.ts`: `buildApp()` resolves `queuePrefix` via
  `resolveQueuePrefix(dbUrl, env)`, passes it to `createQueue`/`createWebhookHandler`, and
  registers `boss.work()` under the prefixed names; both job handlers run their batch through
  `mapLimit` (`MOLE_REBUILD_CONCURRENCY` default 2, `MOLE_CHECKRUN_CONCURRENCY` default 4)
  instead of a sequential `for` loop.
- Tests: `packages/server/test/queue-prefix.spec.ts` (8 tests: pure `queueName`/
  `resolveQueuePrefix` behavior including the unset-default and `auto` opt-in, a live
  two-`Boss`-instance isolation test, and a live restart-simulation test proving a job queued
  under the old unprefixed name before a restart is still claimed after it with the env unset),
  `packages/server/test/event-loop.spec.ts` (1 test, rewritten in review round 1 -- see "Found,
  not fixed" #1 below: a fake, sleeping `git` on PATH plus a `setInterval` heartbeat, not
  `monitorEventLoopDelay`, which was found blind to this exact bug class on this Node version).
- Load test rerun: `tasks/T99-server-throughput/scripts/load.mjs` (a copy of T98's script, same
  parameters), `tasks/T99-server-throughput/4 log/load.md` (before/after table) +
  `load-after-raw.json`.

## Found, not fixed (out of scope for this task, logged for a follow-up)

- **Fixed after review (11-04):** `headersTimeout` stayed at Node's 60 s because Fastify sets `requestTimeout` after
  constructing the server; now set explicitly to 9 s (`packages/server/src/index.ts`, test in `test/health.spec.ts`).
- **Test isolation:** `relayOutboxOnceDetailed` selects outbox rows across all orgs, and `index.spec.ts` /
  `index-temporal-e2e.spec.ts` leave rows behind, so rerunning the server suite against the same long-lived
  database fails `outbox.spec.ts` ("relayed exactly once": 3 vs 1). Pre-existing on main; fresh database passes.
1. **PARTIALLY FIXED BY T99 (2026-11-05).** `rebuild.ts`/`checkrun.ts` called `execFileSync('git',
   ...)` directly, several times per job, blocking the event loop (`4 log/load.md` §3). T99
   converted both to `promisify(execFile)` with bounded concurrency (`concurrency.ts`'s
   `mapLimit`, `MOLE_REBUILD_CONCURRENCY`/`MOLE_CHECKRUN_CONCURRENCY`/
   `MOLE_REBUILD_FILE_CONCURRENCY` env vars). Measured effect: webhook-ack p95 under the same
   load dropped 1,166ms -> 14ms (a 99% reduction). Verified non-blocking directly:
   `test/event-loop.spec.ts` puts a fake, sleeping `git` on PATH (every call costs >= 300ms
   deterministically, not fixture-size- or load-dependent) and asserts a concurrent
   `setInterval` heartbeat never falls more than 150ms behind -- 5/5 runs pass at 13-19ms max
   against this fix, 5/5 runs FAIL at 5.4-5.6s max against the pre-T99 synchronous code
   (`tasks/T99-server-throughput/4 log/event-loop-review1.txt`). That file also documents a
   review round 1 finding independent of this task's own code: `perf_hooks.
   monitorEventLoopDelay` (this test's ORIGINAL technique, and the one `4 log/red.txt`'s
   isolated `node --input-type=module` measurements also used) does not register delay from
   `execFileSync`/`spawnSync` blocking at all on this Node version (v22.21.0), verified with a
   standalone reproduction completely outside this task's fixtures -- so the original
   event-loop.spec.ts's p99 < 100ms assertion was not just thin-margin-flaky (2/4 CI runs) but
   structurally blind to the exact bug class it claimed to guard; replaced with the heartbeat
   technique above, which is directly verified to detect it. Queue-drain throughput, however,
   barely moved (0.91 -> 0.95 job-units/sec) -- see finding #1b below, a NEW root cause T99
   found that T98 did not isolate.
   1b. **NEW (T99, not fixed, deeper and larger than #1).** The dominant blocking cost on the
       compute-check-run job path is NOT `checkrun.ts`'s own git calls (now async) but
       `@mole/decisions`'s `prCheck()` (`packages/decisions/src/check/pr-check.ts`), which
       `computeCheckRun()` calls on every job. `prCheck` does its own ~20 `execFileSync` calls,
       including an UNCONDITIONAL `git worktree add` + `git worktree remove` pair on every
       single invocation (`baseTree()`, ~line 218-227) and, when any decision in the repo has a
       `rules:` item, a `git archive` + `tar -x` extraction too (`ruleViolationsAtHead()`,
       ~line 50-88). Isolated measurement (4 concurrent `computeCheckRun()` calls):
       p99 event-loop delay 1,262ms with `checkrun.ts`'s OLD wrapper calls, STILL 733ms (a real
       ~42% improvement, not a fix) after T99's fix to `checkrun.ts`'s own wrapper functions --
       confirming `prCheck` itself, not `checkrun.ts`, is the larger remaining cost. (Those two
       numbers were measured with `monitorEventLoopDelay`, same as the original event-loop.spec
       .ts; given the blind spot documented above for plain `execFileSync` calls, `prCheck`'s
       own unconditional `git worktree add`/`remove` + `tar -x` calls evidently involve enough
       incidental I/O/yield points for that instrument to pick up a signal here, unlike the
       simpler `git show`/`ls-tree` calls on rebuild.ts's own path -- this is a secondary,
       unverified observation, not re-confirmed with the heartbeat technique, since converting
       `prCheck` itself is out of this task's boundary regardless.) Converting `prCheck`'s ~20
       call sites to async is a materially larger change than T99's `packages/server/src/**`
       boundary: `packages/decisions` is also the CLI's `mole pr-check` and the Claude Code
       plugin hook path, not just this server, so the blast radius and review burden are much
       higher. Time-boxed out of T99; a real follow-up task, not claimed fixed here. Evidence:
       `tasks/T99-server-throughput/4 log/red.txt` items 3-4, `4 log/load.md`.
2. **FIXED BY T99 (2026-11-05), review round 1 BLOCKING finding corrected (2026-11-05).**
   pg-boss queue names were global to the Postgres instance, not scoped per deploy/org set: a
   server process that died (crash, redeploy, or a test harness's intentional kill) could leave
   jobs queued for orgs it alone knew the repo dir for; any other process sharing the same queue
   names in the same DB would then claim, fail (`no repo dir configured for org X`), and
   retry/eventually dead-letter them -- consuming worker capacity meant for its own, unrelated
   jobs. T99: every real pg-boss queue name is now `${prefix}:${base}` (`queue.ts`'s
   `queueName()`). `prefix === ''` reproduces the exact pre-T99 literal names.

   The FIRST cut of this fix defaulted an unset `MOLE_QUEUE_PREFIX` to the database name parsed
   from the connection string -- review round 1 caught this as BLOCKING: it silently renamed
   every existing deployment's queues on a plain in-place upgrade (no env var touched), which is
   the exact silent-breakage shape this writeup originally (incorrectly) claimed did not exist.
   Corrected: `resolveQueuePrefix()`'s default (MOLE_QUEUE_PREFIX unset) is now `''` -- zero
   behavior change on any upgrade, matching `createQueue()`'s own long-standing default.
   Namespacing is opt-in: `MOLE_QUEUE_PREFIX=<name>` for an explicit prefix, or
   `MOLE_QUEUE_PREFIX=auto` to derive one from the connection string's database name (the old
   default, now explicit). Set it ONLY when two deployments (or two server processes / test
   suites) share ONE Postgres instance and schema and would otherwise steal each other's jobs
   (the T98 finding above) -- a deployment with its own dedicated database never needs it.

   How to turn it on without stranding in-flight jobs: before the first restart with
   `MOLE_QUEUE_PREFIX` set, drain the existing unprefixed backlog (deploy with it left unset
   until `select name, count(*) from pgboss.job where name = any(array['rebuild-index',
   'compute-check-run','relay-outbox']) and state not in ('completed','cancelled','failed')
   group by name;` returns 0 rows for every name), THEN set the var and restart. Setting it
   before the backlog drains does not lose those jobs -- no worker is registered under the old
   unprefixed names once a prefix is in effect, so they sit un-worked until the var is unset
   again -- but draining first avoids that window entirely.

   Verified: `test/queue-prefix.spec.ts` (8/8), including a LIVE test with two `Boss` instances
   on one Postgres database with two different prefixes (proving a job sent under one prefix is
   never received by the other) and a LIVE restart-simulation test (a job sent by one `Boss`
   instance under the unprefixed name, that instance closed, then a SECOND `Boss` instance
   created with the same unset-env resolution still claims it -- the actual in-place-upgrade
   scenario, not just the pure default value).
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
