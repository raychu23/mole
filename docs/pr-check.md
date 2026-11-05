# `prCheck`'s merge-base cache

`prCheck()`/`prCheckAsync()` (`packages/decisions/src/check/pr-check.ts`) need a full checkout of the
repository at the PR's merge base (and, when any decision has a `rules:` item, a second checkout at the PR's
head) so that scope-anchor lookups and the dependency-cruiser rules engine see a real, resolvable file tree --
not just the `.mole/decisions` files. Re-creating that checkout from scratch on every call was ~86-90% of
`prCheck`'s own git subprocess time on real commit ranges (`tasks/T102-prcheck-throughput/4 log/profile-before.md`),
so it is cached and reused across calls.

## Where the cache lives

`$(git rev-parse --git-common-dir)/mole/prcheck-cache/<slot>/`, i.e. inside the repository's own `.git`
directory (the MAIN repo's `.git`, shared by every linked worktree of that repo). Each `<slot>` is one checkout
purpose (`records`, `rules-head`) for one calling worktree, named `<purpose>-<hash of the worktree's real
path>` so two linked worktrees of the same repo never share, or stomp, each other's checkout.

Consequences of living inside `.git`:
- It dies with the repository: `rm -rf <repo>` removes it, there is nothing left under a shared top-level
  temp directory to leak or to orphan.
- It is bounded: each slot's last-use time is refreshed on every `prCheck` call; a slot unused for 14 days, or
  the oldest slots once the whole cache passes 500 MB, are evicted automatically on the next call.
- **It is not a `git worktree`.** `prCheck` builds the checkout's git attachment by hand (a private admin
  directory under the slot, with its own `gitdir`/`commondir`/`HEAD`, pointing back at the repo's shared object
  store) instead of calling `git worktree add`, specifically so it is never registered under
  `$GIT_COMMON_DIR/worktrees/` and therefore never shows up in `git worktree list` or an IDE's worktree panel.
  See `packages/decisions/src/check/worktree-cache.ts`'s header comment for the mechanism and why it is safe
  (git resolves a repository purely by following the `.git` file's `gitdir:` pointer chain; nothing requires
  that chain to live under `.git/worktrees/`).
- Checking out a new revision into an existing slot never touches the real repository's own index or HEAD --
  the slot's admin directory has its own `HEAD`, and `checkout --detach`/`clean -fdx` run scoped to the slot's
  own tree directory only.

## Deleting it

Tools that walk the repo with their own exclude list replacing the default (vitest `test.exclude`, custom file
walkers) must keep `**/.git/**` in it, or they will see the cached checkouts (Mole's own vitest config had to).
Each slot also keeps one ref, `refs/mole/prcheck/<slot>`, pointing at the commit it has checked out, so `git gc`
never prunes a commit only the cache uses (an unregistered checkout's HEAD is not a gc root). Delete those with
`git for-each-ref --format='%(refname)' refs/mole/prcheck/ | xargs -n1 git update-ref -d`.
`rm -rf $(git rev-parse --git-common-dir)/mole` (or just `rm -rf .git/mole` from the repo root) removes every
slot for every purpose and every worktree of that repo. `prCheck`'s next call rebuilds whatever it needs.
Programmatically: `clearWorktreeCache(root)` in `worktree-cache.ts` (test/ops hook; never called by `prCheck`
itself).

## Concurrency

Two calls needing DIFFERENT revisions for the SAME (worktree, purpose) are serialized with `proper-lockfile`
(`stale: 15s`, with a heartbeat `update` so a live holder's lock is never mistaken for stale mid-checkout --
see the npm `proper-lockfile` README). A process that is killed while holding the lock (no chance to release)
blocks the next caller for at most that ~15s stale window, not indefinitely. Calls against different repos, or
the same repo's different purposes, never contend.
