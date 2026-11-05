# Profile: one `prCheck` call (before this task's fix)

Method: `pr-check.ts`'s own `git()`/`gitOrNull()`/`execGit()` helpers were instrumented with a timer, gated behind
`MOLE_PRCHECK_PROFILE=1` (zero cost otherwise -- a single env read). Script:
`tasks/T102-prcheck-throughput/4 log/profile-before.mjs`. Run against this repo's own `.mole/decisions` and real
git history, `HEAD~15..HEAD` and `HEAD~5..HEAD` (two different real commit ranges, same repo, same machine).

(Monkeypatching `node:child_process.execFileSync` from outside the module does NOT work for this: Node's builtin
module named exports are resolved once from the internal binding, not a live getter over the mutable default-
export object, so a module that does `import { execFileSync } from 'node:child_process'` keeps the ORIGINAL
function even after a consumer overwrites `child_process.execFileSync` -- confirmed with a 2-file repro before
settling on the in-source timer the task itself suggested as the fallback.)

## `HEAD~15..HEAD` (168 files, 2 governed)
```
total wall time: 3169.3 ms
total git subprocess calls: 15, total git time: 1476.3 ms
  worktree add            2     784.6 ms  avg 392.31 ms
  worktree remove         2     491.5 ms  avg 245.74 ms
  diff                    2      74.0 ms  avg 37.00 ms
  rev-parse               4      54.6 ms  avg 13.66 ms
  show                    2      28.7 ms  avg 14.33 ms
  archive                 1      17.3 ms  avg 17.32 ms
  merge-base              1      13.4 ms  avg 13.42 ms
  grep                    1      12.2 ms  avg 12.18 ms

worktree add+remove share of total git time: 86.4%
```

## `HEAD~5..HEAD` (37 files, 2 governed)
```
total wall time: 5024.8 ms
total git subprocess calls: 15, total git time: 3208.3 ms
  worktree add            2    1530.1 ms  avg 765.04 ms
  worktree remove         2    1369.1 ms  avg 684.57 ms
  archive                 1     105.4 ms  avg 105.44 ms
  diff                    2      70.3 ms  avg 35.17 ms
  rev-parse               4      56.8 ms  avg 14.21 ms
  show                    2      36.6 ms  avg 18.32 ms
  merge-base              1      25.2 ms  avg 25.22 ms
  grep                    1      14.6 ms  avg 14.58 ms

worktree add+remove share of total git time: 90.4%
```

Two worktree add/remove PAIRS per call on this repo specifically: `baseTree()`'s own (records at merge base --
unconditional, every call when `recordsRoot` is inside the checked repo) plus `ruleViolationsAtHead`'s (gated on
`hasRuleRecords`, but this repo's own `.mole/decisions` DOES have `rules:` items, e.g. `0013-cli-loads-heavy-
modules-lazily.md`, so it fires on every real range tried here -- a realistic, not cherry-picked, workload).

**Finding: worktree add+remove is 86-90% of this package's own git subprocess time; the single largest lever.**
Raw data: `profile-before-raw.json` (HEAD~5 range) / `profile-before-raw-head15.json` (HEAD~15 range).
