## Summary
- Moved the steering write side (types/store/validate/index/cli) from `@mole/agentstate/src/steer`
  into a new package `@mole/steer`, with proper-lockfile moving as its dependency.
- `query.ts` (read-only, built on agentstate's own `getRun`) stayed in `@mole/agentstate`;
  `AgentStateSnapshot` now lives there too, exported from agentstate's index and re-exported by `@mole/steer`.
- `agentstate` dropped its `proper-lockfile` dependency; `@mole/steer` depends on `@mole/agentstate` (for query) + `proper-lockfile`.
- daemon's `mole steer` entry now lazily imports `@mole/steer/dist/src/cli.js` instead of `@mole/agentstate/dist/src/steer/cli.js`.
- Moved `steer.test.ts` / `steer-stress.test.ts` into `packages/steer/test/`, fixing their relative dist/src paths; `steer-hook.test.ts` (plugins/claude-code) needed no change -- it only shells out to the built `mole` CLI.
- `mole rules --root .`: 7 violations of decision 0014 before -> 0 violations after.

## Notes
- Package layout mirrors `packages/proposals` (flat `src/{index,cli,...}.ts`, not a nested `src/steer/` subfolder)
  since `@mole/steer` *is* the steer package now -- only the old agentstate-internal path had the extra nesting.
- Added `packages/steer` to the root `tsconfig.json` references and to `packages/daemon/tsconfig.json`'s references
  (daemon imports the steer CLI); added `@mole/steer` to `packages/daemon/package.json` dependencies.
- `npm install` picked up the one new local workspace package (`@mole/steer`) + its already-present `proper-lockfile`
  dependency; `node_modules/better-sqlite3/build` was restored from the main repo's checkout afterward per the task's
  native-build-recovery step.
- Decision 0014's record and its rule (`mole-0014-1`) were never touched -- the fix is the call sites moving out of
  `@mole/agentstate`, not a change to the rule.
- Targeted runs: `packages/decisions/test/rules-check.test.ts` (8/8), `packages/steer` + `packages/agentstate` +
  `packages/daemon` (13 files / 158 tests), `plugins/claude-code` (12 files / 50 tests) -- all green before the full check.
- Full `npm run check` (tsc -b + vitest run, workspace root): clean build, 136 test files passed / 8 skipped,
  1219 tests passed / 19 skipped. No failures.
