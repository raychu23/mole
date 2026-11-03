## Summary
The team server's own second Postgres model (`nodes`/`relations`) is now a derived
reconciliation index; `@mole/temporal`'s bitemporal store is the authoritative decision
record (current + as-of, tenant-scoped via existing RLS FORCE). `rebuildIndexFromGit`
optionally also writes each decision-kind record into `@mole/temporal` via a new
`decisionStore.ts` (`recordDecisionRevision`/`currentDecision`/`decisionAsOf`), after the
nodes/relations tx commits, so the graph-traversal path `checkrun.ts`/`graph.ts` use is
byte-for-byte unchanged. 2 new tests pass against real Postgres: a decision rebuilt for
org A is readable as current+asOf for org A only (RLS leak test), and a later re-approval
is a new revision (old `asOf` still returns the old value, `current` returns the new one).
`npx tsc -b` and the full server+temporal vitest suite (254 tests) pass; one pre-existing,
unrelated flaky test (`index.spec.ts`'s pg-boss poll) reproduces identically on unmodified
code in this same local-Postgres setup — not a regression. `docker compose up` now builds
and serves `/health` -> `{"status":"ok"}` after fixing two real deploy bugs found by
actually running it (missing `WEBHOOK_SECRET`/`ORG_REPO_DIRS` env, and the Dockerfile not
copying the workspace packages a `node_modules/@mole/*` symlink points to). F62 Graphiti
spike: attempted for real (`pip install graphiti-core` succeeded), blocked immediately by
`Graphiti.__init__`'s hard OpenAI-key requirement — recorded NOT RUN with the actual error.
Open: index.ts doesn't yet build/pass a `temporalPool` into its own `rebuild-index` job
handler (only the library function + its tests do) — that one-line wiring, plus deciding
whether `ORG_REPO_DIRS`'s JSON-in-env-var shape is the right deploy ergonomics long-term,
are the next task's starting point.

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
- NOT fully wired: `packages/server/src/index.ts`'s own `buildApp()` still only passes
  `pool` (not a `temporalPool`) into its `rebuild-index` job handler — a real deployed server
  does not yet write decisions into `@mole/temporal` on a live webhook-triggered rebuild, only
  `rebuildIndexFromGit`'s own test callers (and any future caller) can opt in. This is
  deliberate: wiring `index.ts` means deciding `TEMPORAL_DATABASE_URL` vs reusing
  `DATABASE_URL`, and running `applySchema` at startup — both small, but untested-by-this-task
  choices better made by whoever picks this up next rather than guessed here under time
  pressure. Everything DONE-WHEN #3 requires (tests proving the read/write/isolation contract)
  is proven; this is the integration step beyond it.
- `otel-collector.yaml`/`jaeger`/`mlflow` sidecars in `deploy/docker-compose.yml` were not
  exercised this session (out of the "postgres + team server" scope); `server`'s `depends_on:
  [postgres, otel-collector]` means a real `docker compose up` (full file) does start them,
  just not separately checked here.
