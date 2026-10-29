# T22 bench: M14 hand-back test selection

Run: `npm run check && node packages/verify/dist/bench/m14.js` (exit 0 only when M14 is met). Per round: `tasks/T22-hand-back-test-selection/run-check.sh`.

## What is measured
10 planted regressions (`patches/*.diff`): 5 in Mole at 70a2989, 5 in Excalidraw at e7b5346 (`packages/*` source).
For each, the bench applies the patch in a scratch checkout (never this worktree), builds (Mole: `tsc -b`), calls
`selectTests(<checkout>, { worktree: true })`, runs the selection with `runTests` (vitest, by `file:line`), and reverts.

- caught: a test the selection ran FAILS and the key lists it as failing (same file + full name).
- share: tests the selection ran / the key's `reach.tests`, averaged over the 10 regressions.
- target: caught >= 9 of 10 AND mean share <= 1/3 (Meta predictive test selection: >99.9% of regressions at 1/3 of tests).
- baselines: run all = each row's full-suite run (catches every valid regression by construction); run none = 0.

## The key (`keys/m14-key.json`), made before the selector existed
`make-key.mjs` computes it with the repo's own runner, never with @mole/verify or @mole/indexer:
- failing: test cases that fail in the FULL suite with the patch applied, fail again when their files are rerun with the
  patch (flake filter), and did not fail in an unpatched full run of the same invocation.
- reach (the denominator, "tests that transitively reach the change"): test cases run by `vitest related <edited files>`
  with the patch applied: vite's module graph of the test file contains the edited file. For Mole the compiled
  `dist/*.js` of each edited `src/*.ts` is passed too, because cross-package imports resolve to `dist`.
  Tests that reach the code only through a spawned process (Mole's CLI tests) are outside `reach`; a selection may run them,
  and they count in the numerator.
- valid: at least one failing test. A patch no test catches is not a regression the suite can see: it is listed under
  `replaced` and the frozen set takes the next candidate (`--freeze`: first 5 valid Mole ids + first 5 valid Excalidraw ids
  in id order).
- every patch's sha256 is in the key; the bench refuses a patch that changed (R2).

## Checkouts (env overrides)
- Mole: `MOLE_BENCH_MOLE_CHECKOUT` (default `~/.hermes/cache/scratch/mole-builder-5/mole-t22-bench`, a detached
  `git worktree` at 70a2989 with `node_modules` cloned from this checkout; created when missing).
- Excalidraw: `MOLE_BENCH_EXCALIDRAW_COPY` (default `.../mole-builder-5/excalidraw-T22`, an APFS clone `cp -cR` of the
  read-only coordinator clone `MOLE_BENCH_EXCALIDRAW_SRC`; created when missing).
- Call graphs are cached per repo + base under `.mole/local/bench/m14/` (gitignored); per-run details go to
  `.mole/local/bench/m14-details.json` when `--details` is given.
