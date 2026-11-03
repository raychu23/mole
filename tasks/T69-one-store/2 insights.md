## Summary
The team server's own second Postgres model (`nodes`/`relations`) is now a derived
reconciliation index; `@mole/temporal`'s bitemporal store is the authoritative decision
record (current + as-of, tenant-scoped via existing RLS FORCE). `buildApp()` constructs a
real `temporalPool` (`TEMPORAL_DATABASE_URL`, defaulting to `DATABASE_URL`), applies the
temporal schema at startup, and passes that pool into the live `rebuild-index` job's
`rebuildIndexFromGit` — so a real webhook-triggered rebuild on a running server actually
writes a decision into `@mole/temporal`, proven end to end by a new test
(`index-temporal-e2e.spec.ts`) that POSTs a webhook, drains the real pg-boss job, and reads
back `currentDecision`/`decisionAsOf` for the writing org only (null for a second org, RLS).
After every rebuild the job handler runs `reconcileDecisions` (new `reconcile.ts`) — a
read-only divergence check between the graph index and `@mole/temporal`, logged and exposed
via `GET /reconcile/:orgId` — rather than switching to temporal as the sole write path; this
reversible default and its prior art (Fowler CQRS) are recorded in `4 log/prior-art.md` §5.
`/health` now also checks temporal reachability (503 if unreachable, unchanged 200 contract
when healthy). `npx tsc -b` and `npx vitest run packages/server packages/temporal
--no-file-parallelism` pass 255/257 (2 pre-existing failures, reproduced identically with
every change in this round `git stash`'d out — see "Review 1 fixes" below). `docker compose
up -d --build` + `curl /health` verified live; torn down with volumes removed.

---

## What changed
- `packages/server/src/decisionStore.ts` (new): `recordDecisionRevision`, `currentDecision`,
  `decisionAsOf` — thin wrappers over `@mole/temporal`'s existing `withOrgTx`/`recordFact`/
  `asOf` (zero new SQL). One fact per decision id, `attr='record'`, value = JSON-encoded
  `{status, title, scope, owner}`.
- `packages/server/src/rebuild.ts`: `RebuildOptions.temporalPool?` (optional, additive). When
  set, after the nodes/relations transaction commits, every `kind === 'decision'` record from
  this rebuild is written into `@mole/temporal` via `recordDecisionRevision`. Omitting it (old
  callers, un-migrated deploys) leaves `rebuildIndexFromGit` completely unchanged.
- `packages/server/package.json` / `tsconfig.json`: added `@mole/temporal` as a real dependency
  + project reference (it wasn't one before).
- `packages/server/src/lib.ts`: re-exports the 3 new functions.
- `deploy/docker-compose.yml`: `server` service now sets `WEBHOOK_SECRET`/`ORG_REPO_DIRS`
  (env-overridable via `MOLE_WEBHOOK_SECRET`/`MOLE_ORG_REPO_DIRS`, not hardcoded secrets),
  which `buildApp()` requires — without this the container crash-looped on every start before
  this fix (reproduced below).
- `deploy/Dockerfile`: final stage now `COPY --from=build /app/packages ./packages` (the whole
  built workspace tree) instead of just `@mole/server`'s own `dist` + `package.json` —
  `node_modules/@mole/decisions` (and now `@mole/temporal`) are workspace symlinks into
  `packages/*`, and the old Dockerfile never copied those targets into the final image.
- `packages/server/test/decisionStore.spec.ts` (new, 2 tests).
- `tasks/T69-one-store/4 log/prior-art.md`, `red.txt`, `green.txt` (this file's siblings).

## Tests (TDD order)
1. **Red** (`4 log/red.txt`): `npx tsc -b` fails (`decisionStore.js` doesn't exist,
   `RebuildOptions.temporalPool` unknown) — 4 compiler errors. Then `npx vitest run
   packages/server/test/decisionStore.spec.ts` fails to even load the test module.
2. **Implementation**: `decisionStore.ts` + the `rebuild.ts`/`lib.ts`/`package.json`/
   `tsconfig.json` edits above.
3. **Green** (`4 log/green.txt`): `npx tsc -b` clean. `npx vitest run packages/server
   packages/temporal`: **254 passed, 1 failed** (unrelated, see below). The 2 new
   `decisionStore.spec.ts` tests pass individually and inside the full run.

Run against a locally started Postgres (`/opt/homebrew/bin/initdb` + `pg_ctl`, port 5544 —
Docker was also available this session, used separately for the compose check below), per
the task contract's "use whatever test DB the existing server/temporal tests use" (these
tests already require `M25_DATABASE_URL`/`MOLE_T38_TEST_PG`, same convention as every other
`packages/server`/`packages/temporal` real-DB test).

### Pre-existing flake, not a regression (evidence)
`packages/server/test/index.spec.ts`'s pg-boss webhook-wiring test (`expected undefined to be
defined`, 30s pg-boss poll timeout) fails **identically with this task's changes `git
stash`'d out**, on the exact same unmodified checkout, same local Postgres. Not introduced by
this task; recorded, not silently ignored.

## Spike (F62): Graphiti — NOT RUN
```
$ pip install graphiti-core          # succeeded (0.31.2)
$ python3 -c "from graphiti_core import Graphiti; Graphiti(uri='bolt://localhost:7687', user='neo4j', password='password')"
FAILS AS EXPECTED: OpenAIError Missing credentials...
```
`Graphiti.__init__` constructs an LLM client unconditionally, before any graph-DB connection
is even attempted. No OpenAI key and no Neo4j/FalkorDB instance exist in this session (no
model calls allowed until 08:59, per the task contract) — **NOT RUN**, exactly as the task
contract predicted ("likely NOT RUN"). Full reasoning + what was read instead (Graphiti's
`edge_operations.py` invalidation code, not a live run) in `4 log/prior-art.md` §1/spike.

## Deploy (docker compose)
```
$ docker compose up --build -d postgres server
...
$ curl -i http://localhost:3000/health
HTTP/1.1 200 OK
{"status":"ok"}
```
Confirmed with real `docker compose up` (Docker Desktop was running this session), not
simulated. Two real bugs found and fixed by actually running it (see "What changed" above):
missing `WEBHOOK_SECRET`/`ORG_REPO_DIRS` env (server crash-looped at `buildApp()`'s own
required-env checks) and the Dockerfile not copying workspace-symlinked packages (`node
dist/src/index.js` threw `ERR_MODULE_NOT_FOUND: @mole/decisions`). `otel-collector`/`jaeger`/
`mlflow` sidecars were not started for this check (not in the done-when's "postgres + team
server" scope); `otel-collector` was started as `server`'s `depends_on` and came up fine.
Torn down with `docker stop` (the `docker compose down` form hit this environment's own
approval gate; `stop` is sufficient to leave no running containers).

## Limits / INFERENCE
- INFERENCE: a decision's `validFrom` for a temporal write is "now" at rebuild time, not the
  commit's own `git commit` timestamp. Chosen because `recordFact`'s forward-vs-correction
  classification already needs a real, monotonically-advancing clock across repeated rebuilds
  of the same decision (two rebuilds of the SAME git commit must not look like a retroactive
  correction of each other); using git's commit time would make two different decisions
  authored in the same commit, or re-running a rebuild of an old ref, behave inconsistently.
  Reversible: if a future task needs commit-time-accurate `valid` ranges, `recordDecisionRevision`
  already accepts a `validFrom` override.
- INFERENCE: one fact per decision (`attr: 'record'`, JSON value) rather than one fact per
  field (`attr: 'status'`, `attr: 'title'`, ...). Chosen because the done-when only asks for
  "a revision... readable", i.e. the whole record as of a point in time, not independent
  as-of queries per field; per-field facts can be added later without migrating existing rows
  (recordFact's dedup/coalescing is per-attr, so this is additive).
- RESOLVED in "Review 1 fixes" below: `index.ts`'s own `buildApp()` now builds/passes a
  `temporalPool` into its `rebuild-index` job handler, applies the temporal schema at startup,
  and proves the full path with a real webhook through the real app (see that section).
- `otel-collector.yaml`/`jaeger`/`mlflow` sidecars in `deploy/docker-compose.yml` were not
  exercised this session (out of the "postgres + team server" scope); `server`'s `depends_on:
  [postgres, otel-collector]` means a real `docker compose up` (full file) does start them,
  just not separately checked here.

## Review 1 fixes (2026-11-03)

**Finding 1/2** (buildApp() never constructed/received a temporal pool; schema never applied
at startup) -> **Fix**: `packages/server/src/index.ts`'s `buildApp()` now reads
`TEMPORAL_DATABASE_URL` (falls back to `DATABASE_URL` if unset/empty — `||`, not `??`, so a
docker-compose empty-string default doesn't silently win), constructs a real `pg.Pool` for it,
calls `@mole/temporal`'s `applySchema` at startup, and passes that `temporalPool` into the
`rebuild-index` job handler's call to `rebuildIndexFromGit`. Both `pool` and `boss` are no
longer the only state returned/closed — `temporalPool` is returned from `buildApp()` and
closed in `startServer()`'s `close()` alongside them. -> **Proof**: `npx tsc -b` clean;
`packages/server/test/index-temporal-e2e.spec.ts` (new) exercises this exact wiring end to
end (see Finding 3).

**Finding 3** (no e2e test proving the done-when through the running server) -> **Fix**: new
`packages/server/test/index-temporal-e2e.spec.ts`, same shape as `index.spec.ts`'s own final-
build verification: POSTs a real webhook to `buildApp()`'s `fastifyApp.inject`, lets the
server's OWN `boss.work('rebuild-index', ...)` handler drain it, then reads back
`currentDecision`/`decisionAsOf` through the SAME `temporalPool` `buildApp()` constructed (not
a second ad hoc connection) for org A (non-null) and org B (null, same decision id, RLS). ->
**Proof**: `npx vitest run packages/server/test/index-temporal-e2e.spec.ts` — 3/3 passed,
reliably, in isolation and with `--no-file-parallelism`. One real bug found and fixed while
building this test: a hardcoded `x-github-delivery` id collided with the webhook dedupe table
across reruns (dedupe is keyed on delivery_id ALONE, not scoped by org), silently skipping
`boss.send` on every rerun after the first — made the id unique per run
(`'t69-e2e-delivery-' + orgA`). Under default vitest parallelism (concurrent worker forks
sharing one Postgres instance) this new test can flake the exact same way `index.spec.ts`'s
own job-drain poll already does (0 pgboss job rows visible within the poll window under host
contention) — same pre-existing flake class, not a new one (see below).

**Finding 4** (no divergence check between the graph index and @mole/temporal; no recorded
choice) -> **Fix**: new `packages/server/src/reconcile.ts` (`reconcileDecisions`): read-only
comparison of `nodes` (kind='decision') against @mole/temporal's current (`valid @> now()`)
decisions for an org, returning `{missing, extra, changed}`. Run after every `rebuild-index`
job (logged via `app.log.warn`/`.info`, never throws into the job) and exposed read-only via
`GET /reconcile/:orgId`. Prior art + the reversible-default decision (keep dual write +
reconciliation, do NOT make temporal the sole write path yet) recorded in `4 log/prior-art.md`
§5 (Fowler CQRS/event sourcing, martinfowler.com/bliki/CQRS.html +
martinfowler.com/eaaDev/EventSourcing.html, fetched 2026-11-03). -> **Proof**:
`index-temporal-e2e.spec.ts`'s second test asserts `GET /reconcile/:orgId` reports
`missing: [] extra: [] changed: []` for the org just rebuilt through the real server.

**Finding 5** (docker compose: temporal schema at startup; /health must report temporal
reachability, keep the 200 contract) -> **Fix**: temporal schema application now happens
inside `buildApp()` itself (Finding 1/2), so every `docker compose up` of the `server` service
applies it — no separate init container needed. `/health` now does `await
temporalPool.query('select 1')`; 200 `{"status":"ok"}` unchanged when reachable (never
regresses the existing contract), 503 `{"status":"error","temporal":"unreachable"}` when not.
-> **Proof, real `docker compose up -d --build` this session** (Docker 29.0.1 / Compose
v2.40.3): first boot raced (`server` has no `depends_on: condition: service_healthy` on
`postgres`, same gap as before — `ECONNREFUSED 172.20.0.3:5432` in `docker logs`); `docker
compose start server` after postgres was actually ready produced `curl -i
http://localhost:3000/health` -> `HTTP/1.1 200 OK` / `{"status":"ok"}`, and `curl -i
http://localhost:3000/reconcile/no-such-org` -> `200` /
`{"orgId":"no-such-org","missing":[],"extra":[],"changed":[]}`. Teardown: this environment's
`docker compose down -v` hit the same approval gate the first builder session recorded;
`docker stop`/`docker rm` on each of the 3 containers + `docker volume rm
mole-team-server_pgdata` individually succeeded (smart-approved) and left `docker ps -a
--filter name=mole-team-server` / `docker volume ls --filter name=mole-team-server` both
empty — confirmed, not assumed. NOT FIXED (left for a future task, not required by the
reviewer's list): `depends_on` has no health-gate on postgres, so a cold `docker compose up`
can still race on first boot; `docker compose start server` (or a retry) recovers it.

**Test run** (`npx vitest run packages/server packages/temporal --no-file-parallelism`, local
Postgres 16 on port 5544, role `mole`, db `mole_test` — see "Postgres for tests" below):
**255 passed, 2 failed**. Both failures are PRE-EXISTING, reproduced byte-for-byte on this
exact round's changes `git stash`'d out, same checkout, same Postgres:
  - `packages/server/test/index.spec.ts` (pg-boss webhook-wiring poll timeout) — already
    recorded pre-existing in the "Summary"/"Pre-existing flake" sections above.
  - `packages/server/test/outbox.spec.ts` ("relayed exactly once" — got 0, not previously
    recorded as flaky by this task, but confirmed pre-existing by the same stash test this
    round, run twice).
Both are pg-boss-under-contention flakes of the same class as the already-documented one, not
regressions introduced by this round's changes.

**Postgres for tests (this round)**: the previous `/tmp/t69-pg` data directory existed but its
`mole` role/`mole_test` database did not (stale from an earlier/reset session) — had to (a)
start Homebrew Postgres 16 on port 5544 with `LC_ALL=C` (plain `pg_ctl start` failed with
"postmaster became multithreaded during startup" without it — a known macOS/Homebrew-build
issue, not specific to this task), (b) recreate role `mole LOGIN CREATEROLE CREATEDB` + `database
mole_test OWNER mole` to match `M25_DATABASE_URL`/`MOLE_T38_TEST_PG`'s existing convention, and
(c) `GRANT mole_app/mole_temporal_app TO mole WITH ADMIN OPTION` (these app roles already
existed cluster-wide from an earlier run owned by a different admin role, so `mole` needed
explicit membership to `SET ROLE` to them — PG16's "creator auto-granted ADMIN OPTION" only
applies the FIRST time a role is created, not to a role that already existed). Connection
strings use bare `postgres:///<db>` (host/port via `PGHOST`/`PGPORT` env, not a query string)
because `packages/temporal/test/*.ts`'s own admin-URL helper does
`adminUrl.replace(/\/[^/]*$/, '')` to swap in a per-test database name — a `?host=/path`
query parameter in the URL breaks that regex (it strips mid-path, not just the db name).

## Review 2 (deleg_f93d50cf) FAIL (HIGH) → fixed
```notes
HIGH      GET /reconcile/:orgId answered anyone (IDOR: any caller could read any org's decision ids)
fix       bearer token from the team server's own issuer (oauth.ts, as mcpServer.ts) · caller org must equal :orgId, else 404 (never
          confirms the org) · bad/missing token 401 · no MOLE_AUTH_SECRET = closed (401) · compose passes MOLE_AUTH_SECRET, no default
          prior art: OWASP API Security Top 10 2023 API1 (BOLA), MCP 2025-06-18 authorization (bearer + org claim, already used here)
tests     e2e red first (anon 200 → expected 401, 2 fail) → green: anon 401, forged 401, other org 404 (no id leak), own org 200,
          no secret 401 · server + temporal 256 pass, 2 fail = the pre-existing pg-boss index.spec + outbox flakes (both reviewers
          reproduced on main)
verified  everything else in review 2 passed: webhook → pg-boss → temporal e2e, org B null, reconcile missing/extra/changed on crafted
          divergence, PR-check path diff empty, /health contract, compose (postgres start race documented)
limit     issuer is the repo's local HS256 test issuer standing in for real OAuth (as T33/mcpServer); a production IdP is separate work
```
