---
state: built, needs review
owner: deleg-t102
repo: /Users/a1/Desktop/CS Code/Project/Mole
branch: ledger/t102-prcheck-throughput
worktree: /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T102-prcheck-throughput
base: 1565dee
status: built, not yet reviewed or integrated
next: adversarial review (sdlc 4-verify/4-adversarial-review), then ledger integrate
---
```notes
T102-prcheck-throughput      the measured remaining bottleneck from T99 (docs/server-slo.md "Found, not fixed"
                              item 1): @mole/decisions prCheck() does ~20 synchronous git calls and an
                              unconditional `git worktree add`/`remove` per call; every server compute-check-run
                              job calls it, so jobs/s stays ~0.9.
    goal                      (1) profile one prCheck call; (2) remove the per-call worktree (cached, reused
                              per-repo worktree -- see 2 insights.md for why `git show`/`cat-file --batch` alone
                              could not replace it), batch what git calls remain, offer prCheckAsync (worker
                              thread pool) for the server while prCheck (sync API) stays unchanged for the
                              CLI/hooks; (3) prove identical results old vs new on the repo's own pr-check test
                              fixtures + 20 real commit ranges; (4) measure latency before/after, median of 10.
    done-when                 4 log/profile-before.md (git-call breakdown, one real prCheck call); worktree-
                              cache.ts (cached reused worktree, 0 unconditional add/remove per call);
                              pr-check-async.ts + pr-check-worker.ts (prCheckAsync, worker-thread pool, bounded
                              concurrency via MOLE_PRCHECK_CONCURRENCY); 4 log/identical-output.md (26/26 old vs
                              new comparisons byte-identical: 6 fixture scenarios + 20 real commit ranges);
                              4 log/latency.md (median of 10, before/after, real speedup); `npx vitest run
                              packages/decisions` green (536 tests, 1 pre-existing unrelated MCP-stdio flake
                              reproduced on main too -- see 2 insights.md); `npx tsc -b` clean.
    boundary                  packages/decisions/src/check/{pr-check,worktree-cache,pr-check-async,
                              pr-check-worker,index}.ts, packages/decisions/test/pr-check-async.test.ts,
                              packages/decisions/test/pr-check-review-fixes.test.ts (one assertion updated: see
                              2 insights.md "test changed"), tasks/T102-prcheck-throughput/**.
    non-goals                 flags.ts/anchors.ts's own git calls (computeFlags/checkAnchor; shared with `mole
                              check` and other commands, out of this task's bounded scope -- see 2 insights.md);
                              rules/check.ts's dependency-cruiser cruise cost itself (unrelated to git calls);
                              wiring prCheckAsync into packages/server's job path (left to the T99 merge, per the
                              task's own instruction: "leave server wiring to the T99 merge").
    proof                     4 log/profile-before.md, 4 log/identical-output.md, 4 log/latency.md,
                              4 log/profile-after.md, 4 log/green.txt.
    stop                      review, then ledger integrate.
```
