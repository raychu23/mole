# R5 fresh review: T35-agent-coverage

Fresh review, no implementer transcript read -- only `0 start.md`, `2 insights.md`, `git log`/`git diff`
against `main`, and an independent re-run of the checks, in the worktree.

## Boundary compliance -- confirmed
`git diff main...HEAD --stat` (21 files, 3060 insertions / 2 deletions):
- `packages/coverage/**` -- all new (package.json, tsconfig.json, src/{index,cli}.ts, bench/{build-key.mjs,
  m27.ts,m27-key.json}, test/index.test.ts, README.md). In scope.
- `packages/agentstate/src`, `packages/memory/src`, `packages/history/src`, `packages/verify/src` -- **zero
  touches** in the diff. Read-only boundary respected (insights.md says attribution logic reuses their
  readers but reimplements the two un-exported functions it needed locally rather than editing them --
  consistent with what the diff shows).
- `packages/daemon/src/cli.ts` -- exactly one added line: one dynamic `import('@mole/coverage/dist/src/
  cli.js')` + one `coverageCli(...)` call, inserted into the existing `if (cmd === ...)` dispatch chain.
  Matches "one import + one call."
- `packages/mcp/src/server.ts` -- exactly one new `server.registerTool('mole_coverage', ...)` block added;
  no existing tool registrations touched. Matches "one new tool."
- `package-lock.json`, `tsconfig.json` (root path reference), `packages/daemon/package.json`/`tsconfig.json`,
  `packages/mcp/package.json`/`tsconfig.json` -- mechanical workspace-wiring diffs (new workspace dep
  references), expected for adding a new package.
- Frozen key: `git log -- packages/coverage/bench/build-key.mjs packages/coverage/bench/m27-key.json` shows
  **one commit only** (`8086aaa`, the R1 freeze). Neither file was touched in any later commit, including
  the two "resumed-session fix" rounds that found the key's over-counting problem -- confirms the implementer
  logged the finding (`4 log/key-changes.md`) instead of editing the frozen key, per R2.

No boundary violation found.

## Independent re-run (this worktree, not trusting the implementer's numbers)
- `npm run build -w @mole/coverage` -- builds clean, `dist/bench/m27.js` and `dist/src/*.js` produced.
- `npm run check` (full repo `tsc -b` + vitest) -- **green**: `499 passed, 14 skipped, 0 failed` (66 test
  files passed, 7 skipped), exit 0. Matches insights.md's claimed "499 passed, 14 skipped, 0 failed."
- `node packages/coverage/dist/bench/m27.js` output, independently re-run:
  - **M27a**: precision `0.9982`, recall `0.4269`, tp 569 / fp 1 / fn 764 -- **MISS on recall** (target
    >=0.95 both). Per-builder: mole-builder-3 `14.3%` recall, mole-builder-4 `65.3%`, mole-builder-5
    `32.4%`, mole-builder-6 `94.2%`. **Matches the claimed numbers exactly**, digit for digit.
  - **M27b**: `sampled: 20, wrong: 0` -- **MET**, matches claim.
  - **M27c**: `queryP95Ms: 0` (<=200ms target) -- **MET**; `fullScanMs: 23552.6` (~23.6s, <=60s target) --
    **MET**, matches claim (insights.md notes 18-48s variance by machine load; 23.6s here is within that
    range and comfortably under the 60s ceiling).

All claimed numbers independently reproduced. No discrepancy between what's reported and what the code
actually does when run fresh.

## Findings
No P0. No P1. No P2.

One observation, not a finding: `fullScanMs` ~23.6s leaves real headroom under the 60s ceiling in this run,
but insights.md itself flags it as "close to the 60s ceiling" on a loaded machine (up to 48s observed) since
the scan walks every session in `~/.hermes/state.db`, not just in-scope ones. That's an already-disclosed,
already-logged speed caveat for a future round, not an undisclosed gap -- not raising it as a finding.

## R2 cross-check
The M27a recall miss's root cause (`build-key.mjs`'s `git log <branch>` over-counting commits via shared
trunk history on serial integration branches) was independently re-verified against real git history in
this review (see `4 log/key-ruling-1.md`): the claim holds, and the implementer correctly did not touch the
frozen key to chase the number -- consistent with what this diff shows.

## VERDICT: PASS
Grounds:
- `npm run check` and the M27 bench both independently reproduce exactly what's claimed -- this is not a
  self-reported number taken on faith.
- The M27a miss is a logged, honest miss (R7), not a loosened check: the bench target, the key, and the
  scoring code are all unchanged from their frozen/initial form; the number is real.
- The cause is correctly diagnosed (not guessed) and handed off as a key-change request rather than fixed by
  manufacturing false positives, which the task's own rules forbid.
- M27b and M27c are both met; failure-case and privacy done-when items are implemented and tested per
  insights.md (not independently re-verified test-by-test in this review beyond the full `npm run check`
  pass, which covers them).
- Boundary is clean: no edits outside `packages/coverage/**` beyond the explicitly allowed one-line
  daemon/mcp hooks, and the frozen key was never touched.

Per R7 ("a missed target changes the claim built on it, not the metric"): integrate at the real number
(precision 0.998 / recall 0.427), with the recall gap recorded as a known, diagnosed limitation pending the
R2 key-fix ruling in `4 log/key-ruling-1.md`.
