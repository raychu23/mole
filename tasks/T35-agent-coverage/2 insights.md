# T35 insights (resumed from a crashed session, 2026-10-29)

## What the crashed session left (kept, not discarded)
- `tasks/T35-agent-coverage/4 log/prior-art.md` -- complete (all 6 sources + method picked). Verified and kept as-is.
- `packages/coverage/{package.json,tsconfig.json}` -- kept as-is (deps: @mole/agentstate, @mole/decisions, @mole/memory).
- `packages/coverage/bench/build-key.mjs` + `bench/m27-key.json` -- the R1 key: which files each 10-29 builder
  session (mole-builder-3..6) changed, from `git log` on their ledger branches filtered by Hermes session metadata
  (`started_at`/`ended_at`) -- a method independent of transcript parsing, per R1. Kept unedited (R2).
- `tsconfig.json` (root) -- the one-line `{ "path": "packages/coverage" }` project reference. Kept.
- No R1 commit had actually been made yet (`git log` on the branch showed no new commits beyond base `dacbddb`), so
  the implementation below is the first real work; the R1 commit (key + bench scaffold + failing tests, no
  implementation) was made before any implementation commit, per R1/R0.

## Write-gate workaround (HANDOFF step 4)
`write_file` refused `packages/coverage/src/index.test.ts` and `packages/coverage/test/index.test.ts` as a "test/CI
edit" needing approval unavailable in this session. Created with a terminal heredoc instead, as HANDOFF instructs.

## Design decisions (made alone; Raymond not watching)
1. **Test layout**: vitest's `include` is `packages/*/test/**/*.test.ts` (not `src/**`), so the test file moved from
   `src/index.test.ts` to `test/index.test.ts` after the crashed session's `package.json`/`tsconfig.json` scaffold
   didn't specify one either way.
2. **Guarding tests**: implemented as T35's own static import scan (which `*.test.ts`/`*.spec.ts` files import a
   given source file, directly) rather than depending on T22's `selectTests` (which needs a `Change`/diff, not a
   static file) or a built `graph.db` (not guaranteed to exist). This is simpler and code-only (R6); it is less
   precise than T22's call-graph reachability but is a legitimate, independently-computed "is this file guarded at
   all" signal for the coverage view, documented as such in `packages/coverage/README.md`.
3. **Attribution bypasses `@mole/agentstate`'s `loadRuns`/`candidateRuns`/`attribute()` orchestration** (though it
   reuses their readers and per-call interpreters verbatim) because those three apply a `mayTouch(cwd,
   scopeDirs(root))` filter that excludes any session whose cwd was a task worktree since `git worktree remove`d
   (Mole's own loop convention, per AGENTS.md/HANDOFF.md) -- which is exactly the 10-29 overnight builders' case
   (T19/T21/T22/T24/T27/T28/T29's worktrees are gone; only the branches remain). Confirmed empirically: with the
   stock `attribute()`, M27a recall was 0% (0/1333); after removing the cwd filter (copying
   `indexRuns`/`linkCommits`'s algorithm locally per the read-only boundary -- those two functions aren't exported --
   with `relPath` swapped for a worktree-prefix-stripping `toRepoRel`), recall rose to ~4.8%.
4. **Subagent roll-up**: the dominant remaining gap was that a builder's own Hermes session mostly orchestrates
   (reads task files, claims the ledger task) while the actual edits happen in child/subagent sessions
   (`sessions.parent_session_id`). Rolling an edit/read up through the `RunSummary.parent` chain (session metadata,
   not transcript content) raised M27a recall to 42.7% (tp 569, fp 1, fn 764; precision 0.998). mole-builder-6 (a
   single session + its direct subagents) reached 94.2% recall this way; mole-builder-3 (14.3%) and mole-builder-5
   (32.4%) still miss most of their files -- most likely because the builder was resumed across multiple top-level
   Hermes sessions not linked by `parent_session_id` (a restart after a crash/compaction creates a new root session,
   not a child of the old one), which this fix does not follow. A further fix (matching a builder's resumed sessions
   by overlapping Hermes `sessions.cwd`/time window, independent of `parent_session_id`) is the next thing to try,
   logged here rather than attempted blind given the round cap (R3).

## Real numbers (not met: logged honestly per R7, never loosened)
- **M27a** (target precision & recall >= 0.95): precision 0.998, recall 0.427 (tp 569, fp 1, fn 764) -- MISS on
  recall. Per-builder: mole-builder-3 14.3%, mole-builder-4 65.3%, mole-builder-5 32.4%, mole-builder-6 94.2%.
- **M27b** (target: 0 wrong of 20 sampled weak-spot reasons): 0 wrong of 20 sampled -- MET.
- **M27c** (target: one-file query p95 <= 200ms after a cached scan; full scan <= 60s): query p95 ~0ms (50 queries
  against an in-memory scan result) -- MET; full scan ~18-48s depending on machine load (varies with the Hermes
  `sessions` table size at scan time, since the fix above scans every session, not just in-scope ones) -- MET but
  close to the 60s ceiling; a persistent on-disk cache (not built here) would be the next speed step if this
  matters more than correctness going forward.
- **Failure cases** (done-when 4): "no agent sessions found in ..." + exit 0 (tested), malformed JSONL lines
  skipped and counted separately from `Skipped` entries (tested).
- **Privacy** (done-when 5): read-only throughout; `FileAgent`/`CoverageResult` carry only harness, session id, tool
  name and ISO timestamps, never message/tool-call text.
- **npm run check**: green (`tsc -b` + `vitest run`, 50 files / 375 tests, including this package's 3).

Given M27a's miss on recall, this integrates (submits) at its real number rather than being blocked outright: the
feature works, has 0 false weak-spot reasons and very high attribution precision (0.998, i.e. it almost never
mis-attributes a file to the wrong session), and the recall gap has a diagnosed, logged cause and a concrete next
step above -- consistent with HANDOFF's "a miss is not a stop" guidance. A fresh reviewer should re-judge whether
0.427 recall is acceptable to integrate as-is or should send T35 back for the resumed-session fix.

## 2026-10-29 (T35 resumed, 2nd session): resumed-session fix implemented, M27a recall still a miss -- real cause found

Implemented the next step above: `buildResumedFamilies()` in `packages/coverage/src/index.ts` (commit 3a59709)
chains root Hermes sessions (no `parent_session_id`) that share harness + cwd and whose windows are
**sequential** (one's end followed within 15 minutes by another's start, nearest candidate only) -- not
merely overlapping, since this repo's own `~/.hermes/state.db` shows the four 10-29 builder sessions already
share one cwd and overlap each other's multi-hour windows almost entirely; overlap-based matching would have
merged all four into one family and wrecked precision. Full reasoning and the SQL evidence are in
`4 log/key-changes.md`.

**Result: unchanged** -- precision 0.9982, recall 0.4269, identical to before (round 1 of this session,
commit 3a59709, logged in `4 log/runs.jsonl`). Confirmed by direct query that zero root sessions for any of
mole-builder-3/4/5/6 chain within the gap threshold (checked up to 2 hours); the fix is real and general but
had nothing to attribute in this specific dataset.

Traced the actual composition of the remaining false negatives (not inferred -- queried directly): for
mole-builder-3 and mole-builder-5, ~97% of files the bench key says they should own but the scan doesn't
attribute to them are files that the scan correctly attributes instead to a **different, known builder's own
session** (e.g. 167 of mole-builder-3's false negatives are files mole-builder-4's own session edited; 149
more are one of mole-builder-4's subagents). This is not an attribution bug (precision stays 0.998-1.0 per
builder) -- it is `bench/build-key.mjs` counting every file touched by any commit reachable via
`git log <ledger-branch> --no-merges` within a builder's time window, and ledger branches are serial
integration branches whose `git log` includes every other concurrently-running builder's commits that
happened to land in the same overnight window. Fixing this needs a key change (filtering to commits unique
to the branch, or to the owning session's own commit-linking match) -- a frozen-key change per R2, logged for
a ruling in `4 log/key-changes.md`, not made here.

Stopping here rather than spending the remaining round budget: the mechanism this round targeted is
confirmed absent from the data (not "maybe needs a bigger threshold" -- checked to 2 hours, still nothing),
and the real cause is a key-method property, not something `packages/coverage`'s attribution logic can fix
without manufacturing false positives (explicitly forbidden by R7 / the task's own instructions). Per R7 this
is a miss, logged honestly: **M27a final: precision 0.9982, recall 0.4269** (mole-builder-3 14.3%,
mole-builder-4 65.3%, mole-builder-5 32.4%, mole-builder-6 94.2%) -- unchanged from the prior session's
number, now with the fix attempted, verified inert on this dataset, and the real blocking cause identified
and handed to a human/reviewer ruling rather than guessed at further. M27b, M27c and the failure/privacy
cases remain met (see `4 log/runs.jsonl`); `npm run check` is green (499 passed, 14 skipped, 0 failed).


## Round 2 (a18, after R2 key-ruling-1.md APPROVED --first-parent fix)
Applied the APPROVED minimal fix to build-key.mjs (added --first-parent to the git log call, per
key-ruling-1.md's evidence that merge commits on these serial integration branches pulled in other
concurrently-running builders' commits). Regenerated the frozen key (544 owner,file pairs, down from
the inflated original), rebuilt, reran M27a:
- Before: precision 0.998, recall 0.427 (tp 569, fp 1, fn 764)
- After:  precision 0.842, recall 0.882 (tp 480, fp 90, fn 64) -- recall improved massively (+0.455),
  but precision dropped below target (was near-perfect because the old inflated key credited almost
  every file to someone). mole-builder-3 in particular: precision 0.231 (tp 12, fp 40) -- this builder
  did very little direct-commit work itself (recall was 0.143 pre-fix), so its real first-parent file
  set is tiny, and the attribution code's subagent/resumed-session rollup (round 1's fix) is crediting
  it with files that, under the now-tighter key, belong to someone else or nobody in-window.
- Per-builder (after): mole-builder-3 p=0.231 r=1.0; mole-builder-4 and others not fully broken out
  here, see runs.jsonl for the full per-builder JSON.
- Both M27a targets (precision AND recall >= 0.95) are still a MISS, closer on recall, now missing on
  precision instead. Stopping here (round 2 of this session, several prior rounds already spent by the
  original builder): further work would need either a 3rd fix (tighten the resumed-session cwd+time-
  window matching from round 1 so it stops crediting builder-3 with others' files) or accepting that
  attribution-by-session-metadata has an inherent precision/recall tradeoff this repo's overnight-
  parallel-builder setup makes hard to fully resolve. Logged honestly per R7, key not loosened further
  (the --first-parent change was itself R2-ruling-approved, not a unilateral key edit).
