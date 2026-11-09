status (2026-11-08)  BUILT, targeted tests pass, T46 re-run done, not yet reviewed or merged
owner: queue-agent-q10
repo: /Users/a1/Desktop/CS Code/Project/Mole
branch: ledger/t117-glob-negation
worktree: /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T117-glob-negation
base: main (at worktree creation)

```notes
T117-glob-negation   Q10 (queue/brief.md "Added 11-08")
    goal              make Mole handle negated scopes in `match: in:` glob fields correctly (the T110 v2
                      side finding: `**/!(index).{ts,tsx}`, Backstage adr004, is a dead rule -- extglob
                      negation `globToRegExp` does not implement), prefer an existing maintained glob
                      library over hand-rolling more glob syntax, and add a compile-time warning when an
                      `in:` glob matches zero files in the repo (a dead rule surfaced instead of silently
                      passing).
    found             picomatch is ALREADY a transitive dependency (via `dependency-cruiser`, @mole/decisions'
                      own direct dep; pinned 4.0.7 in package-lock.json, zero deps of its own, 116 KB on
                      disk, already hoisted to root node_modules) -- no new install, no bundle-size cost
                      (T101). minimatch/micromatch would need a genuinely new dependency; picomatch does
                      not. Verified picomatch reproduces every existing globToRegExp test case (**, *, {a,b})
                      unchanged and correctly handles `**/!(index).{ts,tsx}` (matches a/foo.ts, rejects
                      a/index.ts) -- see 4 log/picomatch-equivalence-check.txt.
    fix               packages/decisions/src/check/options.ts: globToRegExp now delegates to
                      `picomatch.makeRe(glob, { dot: true })` instead of a hand-rolled char-by-char glob->
                      regex compiler (full Bash extglob support, `!(...)`/`+(...)`/`@(...)`, for free).
                      New `deadInGlobProblems(root, anchors)`: given a record's parsed content anchors and
                      the repo's real file listing (reuses anchors.ts's own `Git`/`repoFiles`, now exported,
                      not a second file-walk), returns a Problem at the record's file:line for any `in:`
                      glob with zero matches -- same shape/sink as the existing invalid-regex / nested-
                      quantifier problems contentAnchorsOf already pushes, so `mole decisions` / `mole
                      pr-check` surface it with no new plumbing. packages/decisions/package.json: picomatch
                      added as an explicit dependency (was only transitive); src/check/picomatch.d.ts: a
                      minimal ambient module declaration (picomatch v4 ships no .d.ts and no @types/
                      picomatch package exists for v4).
    tests             Red saved BEFORE the fix: 4 log/red1.txt (5 failing: the 4 new extglob-negation
                      assertions + deadInGlobProblems not exported). packages/decisions/test/pr-check-
                      options.test.ts: new extglob-negation case in the existing `globToRegExp` describe
                      block (matches a/foo.ts and foo.tsx, rejects a/index.ts and index.tsx) + a new
                      `deadInGlobProblems` describe block (warns on a glob matching 0 files, silent on a
                      glob matching a real file, no-op with no in:, and confirms the FIXED adr004-shaped
                      extglob pattern itself is no longer "dead" against the test fixture's real files).
                      All existing **/*/{a,b} cases re-asserted unchanged in the same block. 28/28 pass
                      (packages/decisions/test/pr-check-options.test.ts); `npx tsc --noEmit -p
                      packages/decisions` clean. Full `npx vitest run` in this worktree has 14 unrelated
                      pre-existing failures (missing .github/, .mole/, dist/ build artifacts -- sparse-
                      checkout scope gaps, not this change; brief says targeted tests only).
    measured          T110 v2 T46-cascade check-only re-run (compiled_adrs_v2.json reused, no recompile, no
                      model call), packages/decisions built in THIS worktree (npx tsc -b packages/decisions)
                      and pointed at from a copy of run_t46_cascade_v2.mjs
                      (tasks/T110-history-replay-bench/run/run_t46_cascade_v2_T117.mjs, output written to
                      arm_t46_cascade_v2_T117.json so main's frozen arm file is untouched): adr004 DOES now
                      fire, on h2v2-bs-18540-prefix, via the exact previously-dead pattern
                      (`^\s*export\s*(\*|\{[^}]*\})\s*from\s*['"]` scoped `in: "**/!(index).{ts,tsx}"`).
                      T46 cascade recall 0.250 (1/4) -> 0.500 (2/4), 95% Wilson CI 0.150-0.850; false-alarm
                      unchanged 0.143 (1/7). The other 2 previously-masked cases (h2v2-bs-20007-prefix,
                      h2v2-bs-6882-prefix) still miss -- checked their real diffs, neither touches a
                      non-index .ts/.tsx file with a matching re-export line at all, a genuine compiler-
                      drafted-pattern miss, not a glob-engine artifact. Dated note added to results-v2.md
                      ("T117 follow-up (2026-11-08)"); results-v2.md's CORRECTED headline numbers (the
                      merged file-scope-fix arm, scored_v2.json) deliberately left untouched -- this is a
                      separate branch/task, not a rescoring of that merged result.
    not-run           No npm install (picomatch already present); no change to any `.mole/decisions/*`
                      record; main's frozen `arm_t46_cascade_v2.json` / `scored_v2.json` not overwritten
                      (brief: never touch frozen benchmark keys outside this task's own evidence file).
    boundary          packages/decisions/src/check/options.ts, packages/decisions/src/anchors.ts (one
                      export added), packages/decisions/src/check/index.ts (re-export), packages/decisions/
                      package.json, packages/decisions/src/check/picomatch.d.ts, packages/decisions/test/
                      pr-check-options.test.ts, tasks/T117-glob-negation/**, tasks/T110-history-replay-
                      bench/results-v2.md (dated note only) + run/run_t46_cascade_v2_T117.mjs +
                      run/arm_t46_cascade_v2_T117.json (new files, evidence only)
    non-goals         Wiring deadInGlobProblems into a CLI "doctor"/"check" command directly (no such
                      command exists yet in this package -- it's exported and test-covered, ready for a
                      future CLI task to call from `mole decisions`/`mole pr-check`'s problem-reporting
                      path, same sink those already use). Fixing h2v2-bs-20007-prefix / h2v2-bs-6882-prefix
                      (real compiler-drafted-pattern misses, not a glob-engine bug).
    came from         Queue item Q10, context/product-plan/systems/queue/brief.md "Added 11-08"; T110 v2
                      side finding, tasks/T110-history-replay-bench/DEFECT_V2_FILESCOPE.md
    links             tasks/T117-glob-negation/4 log/{prior-art,picomatch-equivalence-check,red1,
                      t46_rerun_output,wilson_ci}.{md,txt}
    harness           hermes
```
