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
