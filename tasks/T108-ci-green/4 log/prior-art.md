# T108-ci-green: prior-art note

Dated sources consulted before touching config/code (prior-art-first):

1. 2026-11-07 vitest docs — testTimeout / hookTimeout / teardownTimeout / pool / poolOptions.forks.maxForks
   (https://vitest.dev/config/testtimeout, /hooktimeout, /teardowntimeout, /pool, CLI poolOptions.forks.maxForks).
   Confirms these are wall-clock / worker-count knobs, not the same mechanism as the birpc RPC ack timeout.
2. 2026-11-07 github.com/vitest-dev/vitest issue #8164 "Timeout calling \"onTaskUpdate\"" (opened against
   vitest 3.x) — root-causes the error to birpc's hardcoded 60s DEFAULT_TIMEOUT on the worker->host RPC
   channel, independent of testTimeout.
3. 2026-11-07 github.com/vitest-dev/vitest issue #11082 "Worker RPC timeout (birpc DEFAULT_TIMEOUT 60s) is
   not configurable — green runs exit 1 on loaded CI runners" — confirms no vitest 3.x config exposes this
   timeout; "capping maxWorkers reduced load but did not eliminate the timeout" on their CI; links the fix
   to PR #8297 (shipped vitest 4.0.0-beta.4, stable in 4.1.6).
4. 2026-11-07 github.com/BerriAI/litellm PR #32078 "fix(ci): stop ui_unit_tests vitest onTaskUpdate RPC
   timeout flake" — a real, shipped same-version (vitest 3.x) mitigation: lower maxForks so the coordinator
   process keeps a free core, plus raise teardownTimeout to 60s for extra slack. Used as the model for this
   task's vitest.config.ts change (teardownTimeout: 30_000, matching this repo's existing testTimeout/
   hookTimeout value) since a vitest 4 major-version bump is out of scope / unverified against this repo's
   other deps (apps/vscode etc.).
5. 2026-11-07 this repo, prior fix: vitest.config.ts's existing comment block (Raymond 10-30 "fix the
   blocked") already documents T23/T36/T37 hitting this same flake and a first mitigation (testTimeout/
   hookTimeout raised to 30s, maxForks capped to half the CPU count) — read in full before adding to it,
   not duplicating its citations.
6. 2026-11-07 this repo, tasks/T43-full-rationale-records/2 insights.md, tasks/T39-import-agent-session-
   logs/2 insights.md, context/agents/a20-mole-builder-15.md — independently document the SAME
   "generated data/m0-engine-report.json missing in a fresh worktree" failure as a known, repeatedly-hit
   gap (copied from main's disk each time, never fixed at the root). Confirms it is not new and not
   specific to this agent's worktree.

Conclusion acted on: the vitest RPC flake has a real upstream fix (vitest >=4.0.0-beta.4) that this task
does not apply (major-version risk, out of scope); the two actual CI-breaking bugs found by reproducing
`npm run check` fresh (matching CI's own checkout+build, not main's long-lived disk) were unrelated to the
RPC flake -- see 0 start.md.
