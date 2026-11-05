# Profile: one `prCheck` call (after the cached-worktree fix)

Same methodology and range (`HEAD~15..HEAD`, 168 files, 2 governed) as `profile-before.md`, run twice in a row in
one process to show cache-cold (first call for this repo) vs cache-warm (reuse). Script:
`tasks/T102-prcheck-throughput/4 log/profile-after.mjs`. `worktree-cache.ts` was given the same
`MOLE_PRCHECK_PROFILE` instrumentation as `pr-check.ts` so its `checkout`/`clean` calls are counted too.

## Cold (first call for this repo in this process)
```
total wall time: 1750.7 ms
total git subprocess calls: 15, total git time: 329.7 ms
  diff                    2      74.5 ms  avg 37.23 ms
  clean -fdx              2      71.3 ms  avg 35.65 ms
  rev-parse               4      56.7 ms  avg 14.17 ms
  checkout --detach       2      47.5 ms  avg 23.77 ms
  show                    2      28.2 ms  avg 14.11 ms
  archive                 1      20.8 ms  avg 20.84 ms
  grep                    1      16.6 ms  avg 16.56 ms
  merge-base              1      14.1 ms  avg 14.11 ms
```

## Warm (second call, same repo, same process)
```
total wall time: 1422.3 ms
total git subprocess calls: 15, total git time: 328.7 ms
  diff                    2      85.2 ms  avg 42.59 ms
  clean -fdx              2      78.4 ms  avg 39.21 ms
  rev-parse               4      50.1 ms  avg 12.53 ms
  checkout --detach       2      39.1 ms  avg 19.53 ms
  show                    2      28.5 ms  avg 14.24 ms
  grep                    1      17.1 ms  avg 17.05 ms
  archive                 1      16.6 ms  avg 16.62 ms
  merge-base              1      13.8 ms  avg 13.81 ms
```

(No `worktree add`/`worktree add` on either run: the FIRST call for a repo still pays one `git worktree add` per
purpose the very first time a repo is seen in a process's/host's lifetime -- not captured above because this
repo's cache slot already existed from an earlier manual run during development; `identical-output.mjs` and
`latency.mjs` both exercise true cold-cache adds too, see those logs' timings.)

**Result: `checkout --detach` + `clean -fdx` together cost ~60-80ms per worktree purpose, vs ~650-1450ms for
`worktree add` + `worktree remove` before (profile-before.md) -- a 4.5-10x cut in this package's own git
subprocess time** (1476-3208ms before -> ~330ms after, same range). The remaining wall-clock cost (module
imports, `loadGraph` parsing, the rules engine's dependency-cruiser cruise) is untouched by this task -- see
`latency.md` for the resulting end-to-end speedup, and `2 insights.md` for why that number is smaller than the
git-time reduction.
