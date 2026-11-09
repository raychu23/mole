# T108-ci-green

goal: Private repo CI "check" green on main, full suite stable under load (queue Q1, brief
systems/queue/brief.md). (a) reproduce `npm run check` as CI runs it and fix any failure
after the key guard. (b) fix the vitest "Timeout calling onTaskUpdate" RPC flake under load:
research documented options, pick one, prove with 2 consecutive full checks under load
avg >= 8 green. (c) orchestrator pushes after merge, not this task.

done-when:
- (a) MET: fresh `git worktree add` + `npm ci` + key-guard + `npm run check` reproduced 2 real
  failures after the key guard (neither pre-existing on `main`'s long-lived disk, both real on
  a truly fresh checkout = what CI does); both fixed, reverified green.
- (b) PARTIAL: documented, same-version mitigation applied (teardownTimeout); the actual
  upstream fix needs vitest >=4.0.0-beta.4 (out of scope, version-compat risk, not done).
  2 consecutive full checks green under load avg >= 8 achieved (see log), but with the
  mitigation alone, not a guarantee -- a later run under heavier load still hit the flake once.
- (c) N/A to this task (orchestrator's job).

status: submitted (branch ledger/t108-ci-green, sha 0a2eabc)

next: orchestrator reviews + merges to main, pushes. If a true fix for (b) is wanted later,
it is a vitest 3.x -> 4.x+ major-version upgrade (breaking changes repo-wide, needs its own
task + review), not a config tweak.

```notes
what changed      .gitignore (1 file exception) · generated data/m0-engine-report.json (committed,
                  68K, was the only untracked source among packages/bench/keys/reused-keys.json's
                  frozen-key sources) · scripts/ci/chmod-bins.mjs (new, postbuild hook) ·
                  package.json (+postbuild script) · vitest.config.ts (+teardownTimeout: 30_000)
why (a)           fresh checkout != main's long-lived disk: (1) gitignored generated-data file
                  never existed on a clean clone, only on main's disk by accident of history ·
                  (2) tsc -b's fresh dist/ has no exec bit (default umask); main's dist/cli.js
                  happened to be chmod'd once, long ago, and tsc -b's incremental build never
                  rewrote it since, masking the gap until a truly fresh build (CI, or any new
                  worktree) hit it
why (b)           vitest-dev/vitest#8164 + #11082: birpc's RPC-ack timeout is hardcoded 60s in
                  vitest 3.x, no config reaches it; real fix ships in vitest 4.0.0-beta.4+ (#8297).
                  Full citations + dates: 4 log/prior-art.md
evidence          4 log/check-run1.txt (red, pre-fix) · 4 log/test-after-fix-1.txt +
                  check-after-fix-run2.txt (green x2, pre-teardownTimeout, load avg 27-36) ·
                  check-after-fix-run3-teardown.txt (flake once, load avg >30, teardownTimeout
                  present) · check-after-fix-run4.txt (green, teardownTimeout present)
not fixed         vitest RPC flake's true root cause (needs vitest major bump) · a separate,
                  disclosed load-sensitivity gap in packages/daemon/test/daemon.test.ts (20s
                  poll window missed once under avg load ~30-37) -- different mechanism, not
                  this item's named flake, not touched
disk              worktree ../Mole-worktrees/T108-ci-green, ~28M checked out; did not approach
                  the 500MB scratch cap or the 4GB free-disk stop threshold
```

- 11-08 review FAIL (deleg_ebac273d): committing T1's gitignored report leaked a machine path and overrode reused-keys.json's own note -> reverted; tests skip that one regenerated source when absent (h2h.ts stays strict). Merged b8eec35 (authors reset from "ci <ci@localhost>").

## Q1b continuation (GitHub CI on ea31173 still red)

goal: make the real GitHub Actions `check` workflow green (github-ci-ea31173-failed.txt: 8
packages/temporal/test/* files + 1 packages/decisions/test/export-okf.test.ts assertion).

done-when:
- (a) MET: root cause = ubuntu-latest has no Postgres (`ECONNREFUSED ::1:5432`/`127.0.0.1:5432`,
  then an `afterAll` TypeError cascade from the never-assigned pool -- one root cause, not two).
  Fixed: `.github/workflows/check.yml` gets a `postgres:16` service, `POSTGRES_HOST_AUTH_METHOD:
  trust` (matches this repo's own local pg_hba.conf: `local/host all all trust`), `MOLE_T38_TEST_PG:
  postgres://postgres@localhost:5432/postgres` (the image's built-in superuser, needed by
  schema.sql's `CREATE EXTENSION btree_gist` + `CREATE ROLE mole_temporal_app`).
- (b) MET: root cause = a real git-version difference, not flakiness. `git show -s --format=%cI`
  started rendering a zero UTC offset as `Z` instead of `+00:00` in a 2024 git change (ISO
  8601-1:2020-12 requires `Z` for zero offset); CI's runner ships that newer git, this repo's local
  dev git doesn't. Fixed the test's regex to accept either form (both are valid output of the same
  command) -- not an environment-detection skip, the old regex was simply wrong about git's output.
- (c) N/A to this item (push + watch is the orchestrator's job).

status: submitted (branch ledger/t108b-ci-github)

next: orchestrator reviews, merges, pushes, watches the real Actions run -- the service-container
step itself never ran here (Docker is off-limits locally per the brief); the closest possible local
check is the regex-logic confirmation + a run against this machine's own trust-auth Postgres as a
stand-in for the same auth model.

```notes
what changed      .github/workflows/check.yml (+postgres:16 service + MOLE_T38_TEST_PG) ·
                  packages/decisions/test/export-okf.test.ts (regex: Z or +HH:MM offset)
proof (fail)      4 log/q1b-repro-no-postgres.txt: MOLE_T38_TEST_PG pointed at a dead port ->
                  same 8-file failure shape as the real CI log
proof (green)     4 log/q1b-repro-with-postgres-fixed.txt: pointed at local trust-auth Postgres
                  (same role/auth model the fixed workflow gives the CI service) -> 9/9 files,
                  234/234 tests, twice
proof (targeted)  4 log/q1b-final-green.txt: packages/decisions/test + packages/temporal/test
                  together -> 60/60 files, 781/781 tests green
not verified      the real ubuntu-latest + postgres:16 service container (Docker off-limits
                  locally); regex correctness independently confirmed with a 3-case Node check
                  (Z / +00:00 / -06:00 all match)
collisions note   "collisions spawnSync ETIMEDOUT" in the CI log (23:15:34) is a printed hook
                  warning, not a failing test -- the next line is the hook test file passing;
                  out of this item's 9 named failures, not touched
```

## Q1c (GitHub run 9dc54b8 / 42535930765: test step green, last red = bench M13 mlflow loader)

goal: fix the last red `check` step, "bench M13 (T16, traces + MLflow runs + this workflow's key
guard red/green)" -- `node packages/telemetry/dist/bench/m13.js`'s mlflow loader
(`scripts/mlflow/load_runs.py`) crashing, root cause not the frozen M13 key.

done-when: MET. Root cause (reproduced in a scratch venv, mlflow-skinny==3.17.2, Python 3.12/3.13,
identical traceback to the CI log): `load_runs.py` builds MLflow tag/metric **names** straight from
`tasks/*/4 log/runs.jsonl`'s free-text `"metrics"` keys (e.g. `tasks/T43-.../runs.jsonl` line 5:
`"M-B dev B3 arm, post-review-fix"`, a prose evidence label, not a slug). MLflow's
`validate_param_and_metric_name` only allows `[A-Za-z0-9_.\- :/]` in a tag/param/metric *name*
(not a value -- values are free text, length-capped only); the comma in that label made
`_validate_tag_name` raise, which `create_run`/`log_batch` never catches, so the whole load aborts
before any run is written. Two call sites built names from the raw label: (1) the `mole.raw.<k>` tag
name (line ~158) and (2) `parse_metrics`' `parse_metric(str(k), ...)`, whose own metric names are
`f"{key}.{sanitized_label}"` -- `key` itself (`str(k)`) was never sanitized, so the *second* load
also failed on `"M-B dev ... .vs_v2_hand-made_B2"` once (1) was fixed alone.
Fix: added `_tag_name()` (replaces any char outside MLflow's charset with `_`, then collapses
doubled `/`/`.` runs so `posixpath.normpath` round-trips -- `path_not_unique`'s other check) and
applied it to the `mole.raw.<k>` tag name; sanitized `parse_metrics`' `k` through the existing
`_name()` helper before use as a metric-name prefix. The raw text itself is untouched in
`runs.jsonl` and in the tag's *value* (`mole.raw.<name>`'s value, no charset limit) -- nothing
about the M13 key, the frozen benchmark key, or any evidence file was weakened or edited.
Verified: full `node packages/telemetry/dist/bench/m13.js` green end to end against the fixed
loader (321/321 runs loaded, second load adds 0, 10/10 parse cases match the frozen key's `expect`
values, `at target: true`, exit 0) -- `4 log/q1c-m13-full-bench-details.json`.

bootstrap note (asked by the task): M13's `"ci green <n> red <n>"` numbers do **not** come from
GitHub's real Actions run history -- `m13.ts`'s CI section never calls `gh`/the Actions API (grepped,
none found). It spins up its own detached temp git worktree of `HEAD` and runs the workflow's
"key guard" shell command directly, 4 times: once as-is (expect exit 0 = green), once after editing
and committing a protected key in that temp worktree (expect nonzero = red), once with an approved
hash ruling added (green again), once with a wrong-hash ruling (red again). So it is self-contained
and self-bootstrapping: the very first run of `m13.js` on a repo that has never had a GitHub Actions
run produces real green/red numbers, because it manufactures both states itself rather than reading
history. There is no "needs a prior green CI run to go green" cycle in the actual code -- that was
this item's working assumption, not what `m13.ts` does; the only thing the bench depends on
externally is `.github/workflows/check.yml` existing with the right step name/command (checked by
YAML parsing, not run history).

status: submitted (branch ledger/t108c-m13)

next: orchestrator reviews, merges, pushes, watches the real Actions `check` run go green.

```notes
what changed      scripts/mlflow/load_runs.py (+_tag_name() tag/metric-name sanitizer; applied to
                  the mole.raw.<k> tag name and to parse_metrics' key)
why               mlflow-skinny 3.17.2's _validate_tag_name/validate_param_and_metric_name reject
                  any tag/metric NAME containing a char outside [A-Za-z0-9_.\- :/]; runs.jsonl's
                  free-text metric labels aren't slugs and can contain commas/parens; values have
                  no such restriction, only names -- fix sanitizes names only, leaves all raw
                  evidence text (runs.jsonl + the tags' values) untouched
repro (red)       4 log/q1c-repro-red.txt: scratch venv (mlflow-skinny==3.17.2, Python 3.13),
                  pre-fix load_runs.py against the real tasks/ tree -> identical
                  MlflowException("Invalid value \"mole.raw.M-B dev B3 arm, post-review-fix\" ...")
                  to the GitHub log (4 log/q1c-github-run-42535930765-full.log line 1815)
repro (green)     4 log/q1c-repro-green.txt: same venv, fixed load_runs.py -> 321/321 lines loaded,
                  0 errors, second load adds 0 (skips all 321)
full bench        4 log/q1c-m13-full-bench-details.json: real node packages/telemetry/dist/bench/
                  m13.js run against the main checkout (fixed load_runs.py swapped in for the run,
                  then restored -- git diff confirmed clean after) -> stage coverage 100%, mlflow
                  runs 321/321 (second load 0), parse 10/10, ci green 0 red 1 ruled 0, at target true
not touched       packages/telemetry/bench/m13-key.json (the frozen key) · any tasks/*/4 log/
                  runs.jsonl (the raw evidence, including T43's comma-bearing metric label)
disk              worktree ../Mole-worktrees/T108c-m13, sparse (scripts/mlflow, packages/telemetry,
                  this task folder, .github); scratch venv under
                  /Users/a1/.hermes/cache/scratch/t108c, deleted after this item
```
