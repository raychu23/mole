# Identical-output proof: old prCheck (main, pre-T102) vs new prCheck (this branch)

Script: `identical-output.mjs`. Loads `prCheck` from TWO compiled modules -- main's unmodified
`packages/decisions/dist/src/check/pr-check.js` (old) and this branch's (new) -- and runs BOTH against the SAME
inputs, diffing the full `PrCheckResult` JSON (minus `ms`, a wall-clock measurement, not a decided result).

26 comparisons: 6 of the package's own `pr-check.test.ts` fixture scenarios (symbol anchor, silent, superseded,
folder anchor, deletion, rename-unanchored), rebuilt here identically, + 20 real commit ranges of this repo
itself (`HEAD` against 20 evenly-spaced older commits from the last 400, so file counts and decision coverage
vary across the sample).

```
=== T102 identical-output check: 26 comparisons (fixture 6, real 20) ===
  OK   fixture:foo
  OK   fixture:bar
  OK   fixture:docs
  OK   fixture:rename
  OK   fixture:pkg
  OK   fixture:dropFoo
  OK   real:ee668cc..1565dee
  OK   real:a4bf0ba..1565dee
  OK   real:7047116..1565dee
  OK   real:4f80e73..1565dee
  OK   real:90090f5..1565dee
  OK   real:f5e244c..1565dee
  OK   real:d859be9..1565dee
  OK   real:0fc4bd8..1565dee
  OK   real:4950c93..1565dee
  OK   real:ddcfe30..1565dee
  OK   real:2ee4fc1..1565dee
  OK   real:7b12631..1565dee
  OK   real:62f5d29..1565dee
  OK   real:28908a1..1565dee
  OK   real:d9630f5..1565dee
  OK   real:77a1746..1565dee
  OK   real:4f5e7e8..1565dee
  OK   real:f3f3f5c..1565dee
  OK   real:358c6b8..1565dee
  OK   real:ca0cfa0..1565dee

mismatches: 0 / 26
PASS: old and new prCheck produce IDENTICAL results on every comparison.
```

Full per-comparison data (including the stripped JSON on any mismatch, none occurred): `identical-output-results.json`.

**Re-run after the review fix (11-05, FAIL deleg_4f165c05)**: the cache redesign (`.git/mole/prcheck-cache` +
an unregistered worktree admin dir, `docs/pr-check.md`) re-ran clean the first time only after a real bug was
caught BY this exact proof: the first fix attempt (a private `GIT_INDEX_FILE`-based checkout with no `.git` in
the cached tree) silently broke `anchors.ts`'s `Git` class and `computeFlags`'s "has the anchored code changed
since confirmation" check -- both run their own `git -C <recordsRoot> log/diff/show`, which fail (`Git.ok ===
false`) against a plain directory with no `.git`, so every "code changed since confirmed" / history-based flag
silently went missing (19/26 comparisons DIFFed, e.g. `0007`'s flag `yellow` (partly-superseded, scope_changed)
in the old module vs `green` in the broken new one). The second fix (an unregistered-but-real worktree
attachment, so `git` plumbing works exactly as before) re-ran 26/26 identical:

```
=== T102 identical-output check: 26 comparisons (fixture 6, real 20) ===
  OK   fixture:foo
  OK   fixture:bar
  OK   fixture:docs
  OK   fixture:rename
  OK   fixture:pkg
  OK   fixture:dropFoo
  OK   real:476a905..ee13154
  OK   real:980e6a6..ee13154
  OK   real:aa1db61..ee13154
  OK   real:0624e94..ee13154
  OK   real:e1d2a51..ee13154
  OK   real:3478adc..ee13154
  OK   real:83ec74f..ee13154
  OK   real:3f19606..ee13154
  OK   real:0585454..ee13154
  OK   real:6a375ef..ee13154
  OK   real:c12580f..ee13154
  OK   real:fa0de38..ee13154
  OK   real:52c2819..ee13154
  OK   real:b870876..ee13154
  OK   real:50012c7..ee13154
  OK   real:662e57e..ee13154
  OK   real:dc60f00..ee13154
  OK   real:eddeb26..ee13154
  OK   real:aa90129..ee13154
  OK   real:9994247..ee13154

mismatches: 0 / 26
PASS: old and new prCheck produce IDENTICAL results on every comparison.
```

(`identical-output-results.json` is overwritten by the re-run above.)

`pr-check-async.test.ts` extends this same proof to `prCheckAsync` (the worker-thread variant): it must return
byte-identical results to the sync `prCheck` on the same inputs, and stays correct when run concurrently against
the same repo at different revisions (the cached-worktree's lock serializes the checkout, never the result).
