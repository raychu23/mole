# T102-prcheck-throughput: insights

## Why a cached reused worktree, not `git show`/`git cat-file --batch` alone
The task's suggested fix was lazy per-blob reads (`git show <sha>:<path>` / `git cat-file --batch`) instead of a
real checkout. Read first (per `prior-art-first`): `anchors.ts`'s `checkAnchor()` (called from `flags.ts`'s
`computeFlags`, which `prCheck` runs whenever `recordsRoot === root`, the common case) does `isFile`/`readFileSync`
against `join(root, path)` for an ARBITRARY scope-anchor path anywhere in the repository -- not just the `.mole`
record files -- and `rules/check.ts`'s dependency-cruiser cruise needs a real resolvable module graph on disk.
Both need the WHOLE tree at the merge base, not a lazy per-file fetch, and both are separate, synchronous call
paths shared with `mole check` and other commands well beyond `prCheck` -- rewriting them to read through a
virtual, cat-file-backed filesystem is a much larger, riskier change than this task's bounded scope (and would
have to prove identical results against every OTHER caller of `computeFlags`/`checkRules`, not just `prCheck`).
The task named a second option explicitly ("or reuse one cached worktree per repo"): implemented in
`worktree-cache.ts`. A real worktree stays the on-disk contract those readers rely on; only the PER-CALL
add+remove cost is removed.

## Where the time actually went (profile-before.md)
`git worktree add` + `git worktree remove` were 86-90% of this file's own git subprocess time on real commit
ranges of this repo (two pairs per call on this repo specifically, since it already has `rules:` decision records
-- see profile-before.md). Replacing them with one `git checkout --detach -f` + `git clean -fdx` against a reused
directory cut each pair from ~650-1450ms to ~60-80ms (profile-after.md) -- a 4.5-10x cut in this package's own git
subprocess time. The REMAINING, unrelated wall-clock cost (module imports, `loadGraph`'s markdown/YAML parsing,
`rules/check.ts`'s dependency-cruiser cruise) is untouched by this task and is why the end-to-end speedup
(median-of-10, `latency.md`) is a more modest 1.57x rather than matching the git-time reduction 1:1 -- stated
honestly rather than implying the whole call got 5-10x faster.

## The tradeoff this fix makes, stated plainly
A cached worktree is ONE directory per (repo root, purpose). Two `prCheck`/`prCheckAsync` calls needing DIFFERENT
revisions for the SAME repo must not check out concurrently, so `worktree-cache.ts` serializes them with
`proper-lockfile` (already a dependency of this package; see `priorities.ts`'s own header for why it was chosen).
Calls against DIFFERENT repos never contend. This trades same-repo `prCheck` concurrency for removing the
per-call worktree cost -- for the server's actual load shape (one job queue per org/repo, jobs for the SAME repo
naturally serialize on real PR activity anyway) this is the right tradeoff, but it is a real, not hidden, one.
`pr-check-async.test.ts`'s second and third tests prove correctness under this serialization (two/six concurrent
calls at different revisions for the same repo each get their own correct, un-cross-talked result).

## Why `prCheckAsync` is a worker-thread pool, not promisified `execFile` everywhere
`pr-check.ts`'s OWN ~15 git calls could be converted call-by-call to `execFile` + `await`. But `computeFlags`
(`flags.ts`) and `checkAnchor` (`anchors.ts`) -- both invoked synchronously from inside `prCheckIn` -- make their
OWN synchronous git calls via a private `Git` class, and are used by `mole check`/`mole decisions` well beyond
`prCheck`; converting them too is out of this task's bounded scope (and would need separate proof against every
other caller). A worker-thread pool sidesteps the question entirely: blocking work inside a worker's OWN event
loop never blocks the caller's, which is Node's own documented reason worker threads exist ("Worker threads are
useful for performing CPU-intensive JavaScript operations; they do not help much with I/O-intensive work... but
can also be used when expensive synchronous work that cannot be refactored must run" --
nodejs.org/api/worker_threads.html, "When to use Worker threads"). `prCheckAsync` runs the LITERAL SAME `prCheck`
implementation inside the worker (not a reimplementation), so identical output is structural, not just tested --
and it is also tested (`pr-check-async.test.ts`'s first test, plus the 26-comparison old-vs-new proof which
exercises the same code `prCheckAsync` calls). Bounded concurrency via `MOLE_PRCHECK_CONCURRENCY` (default
`min(4, cpu count)`), the same shape as pg-boss's own `teamConcurrency`/`batchSize` knobs (cited in
`tasks/T99-server-throughput`). Wiring `prCheckAsync` into the server's job path is left to the T99 merge, per
the task's own instruction.

## Test changed: `pr-check-review-fixes.test.ts`
One pre-existing assertion (`git worktree list` count === 1, "no leftover worktree") encoded the OLD mechanism
(create+remove every call) and necessarily fails once a worktree is deliberately kept and reused. Updated to the
new invariant the design actually promises: the count is bounded (<=2: the repo's own checkout + the cached one)
and does not grow on a third call (reuse, not a leak) -- same spirit (no leak), updated for the new mechanism.
No other test was edited; this is the only existing assertion that encoded worktree-per-call as the observable
behavior.

## Pre-existing failure, not caused by this change
`packages/decisions/test/cli.test.ts`'s `MCP mole_decisions` test fails with "MCP error -32000: Connection
closed" both on this branch AND run in isolation against an unbuilt `packages/mcp` (its dist doesn't exist in
this worktree -- confirmed via `Cannot find module '.../packages/mcp/dist/cli.js'` on a direct run). Unrelated to
`prCheck`; not touched.

## Review fix (11-05, FAIL deleg_4f165c05): never a registered worktree, never under `os.tmpdir()`

The review's first run FAILED the merge on three findings against the above design, all about the cache's
LOCATION and git REGISTRATION, not its correctness (tsc/vitest/the 26-case identical-output proof all held):
1. **CRITICAL**: `$TMPDIR/mole-prcheck-worktree-cache` slots were never removed -- 120 dirs / 55 MB from two
   test runs, orphaned forever if the origin repo is deleted (nothing points back to them).
2. **HIGH**: every slot was a real, registered `git worktree` (`git worktree add`), so it is permanently visible
   in `git worktree list` / an IDE's worktree panel.
3. **MEDIUM**: the lock's `stale: 120_000` meant a killed hook blocked the next call for up to 120s.

Fix (`worktree-cache.ts`, full rationale in its header comment; cache location documented in `docs/pr-check.md`):
- **Location**: `$(git rev-parse --git-common-dir)/mole/prcheck-cache/<purpose>-<worktree-hash>/` -- inside the
  repo's own `.git`, so it dies with the repo (`rm -rf <repo>` or `rm -rf .git/mole`) and never touches
  `os.tmpdir()`. The worktree-hash suffix exists because `--git-common-dir` is SHARED by every linked worktree
  of one repo (verified: Mole itself has a dozen active `ledger/*` worktrees tonight) -- `purpose` alone would
  let two worktrees doing `prCheck` concurrently at different revisions stomp the same slot.
- **Not a worktree**: a hand-built "admin" directory (its own `gitdir`/`commondir`/`HEAD`) that the slot's
  `tree/.git` file points at, exactly like `git worktree add` builds, EXCEPT never placed under
  `$GIT_COMMON_DIR/worktrees/` -- which is specifically what makes `git worktree list`/`prune` track an entry.
  Verified empirically (a throwaway repo) that this hand-built attachment supports `checkout --detach`/`log`/
  `show`/`diff`/`rev-parse` exactly like a real linked worktree, while `git worktree list` from the real repo
  never lists it. `checkoutInto` then reuses the ORIGINAL (review-proven-correct) recipe unchanged:
  `checkout --detach --force` + `clean -fdx` -- no new index-diffing logic was needed once the tree is a real
  git working directory again.
  - A FIRST fix attempt tried to avoid even that (a private `GIT_INDEX_FILE` + `read-tree`/`checkout-index` into
    a plain, non-git directory, diffing the private index for stale-file removal) specifically to dodge any
    worktree-shaped mechanism. It built and type-checked, but the 26-case identical-output proof caught a real
    regression: `anchors.ts`'s `Git` class and `computeFlags`'s "has the anchored code changed since
    confirmation" logic run their OWN `git -C <recordsRoot> log/diff/show`, which silently fail (`Git.ok ===
    false`) against a directory with no `.git` -- so every history-based citator flag (`scope_changed`,
    evidence/test-report checks) silently stopped firing (19/26 DIFFed). Reverted in favor of the unregistered
    real-worktree approach above, which keeps those readers working unmodified. Logged here so the next change
    to this file does not re-attempt the index-only route without first re-reading this paragraph.
- **Lock**: `stale: 15_000` (`STALE_MS`, exported) with `proper-lockfile`'s `update` heartbeat (default
  `stale/2`) keeping a LIVE holder's lock fresh -- a killed process now blocks the next caller for at most ~15s.
- **Tamper safety**: `assertSafeSlot` lstat+realpath-checks a slot path before any destructive op; a slot
  replaced by a symlink (e.g. into the repo's own worktree) is refused rather than written into or removed
  through (`worktree-cache.test.ts`'s symlink test).
- **Eviction**: a slot's mtime is refreshed on use; slots unused 14 days, or the oldest once the whole cache
  passes 500 MB, are evicted on the next `acquireCachedWorktree` call against that repo.

Tests added: `packages/decisions/test/worktree-cache.test.ts` (never registers a worktree; nothing created
under `os.tmpdir()` survives the call; the cache lives under `.git` and disappears when the repo is deleted;
`clearWorktreeCache(root)`; the symlink-tamper refusal; a killed-process lock recovers within `STALE_MS`, not the
old 120s). `pr-check-review-fixes.test.ts`'s `git worktree list` count assertion was tightened from "`<= 2`,
no growth on a third call" (the old design's best achievable invariant) to "exactly 1, forever" (the new
design's actual invariant: NOTHING is ever registered).

Re-verified after the fix: `npx tsc -b` clean; `npx vitest run packages/decisions` green twice (50/50 files,
541/541 tests); the 26-case identical-output proof 26/26 (`identical-output.md`); latency median-of-10 still a
real speedup, 2.37x on this re-run's range (`latency.md`; the fix changed WHERE/HOW the cache attaches to git,
not the checkout-reuse savings). Also cleaned up, against the actual Mole repo per the review's own instruction:
the two registered `mole-prcheck-worktree-cache` worktrees (`git worktree remove --force` x2 + `git worktree
prune`), the 52 MB `$TMPDIR/mole-prcheck-worktree-cache` leftover, and ~47 MB of this task's own earlier dev
iterations' stale (now out-of-naming-scheme) cache slots under the real repo's `.git/mole/prcheck-cache`.
