# T110 v2 review FAIL #2 -- defect record (file-scope bug in the T46 cascade arm)

Reviewer verdict (full transcript: `/Users/a1/.hermes/cache/delegation/live/deleg_a8536aae/task-0.log`):
**FAIL**. Independent fresh adversarial review confirmed v2's 4 positives were genuinely fixed (v1's
defect, `DEFECT.md`), then found a second, separate defect: `run/run_t46_cascade_v2.mjs`'s `checkStep()`
applies every compiled `match:` pattern to ALL of a case's diff ADDED lines, ignoring the pattern's own
`in:` glob scope entirely. Real Mole (`packages/decisions/src/check/pr-check.ts:318`) scopes a content
anchor to the files its `in:` glob covers BEFORE testing the pattern:

```ts
if (f.newPath === null || (c.inRe && !c.inRe.test(f.newPath))) continue;
```

## What was wrong

`compiled_adrs_v2.json`'s adr004 has 2 `match:` patterns: one scoped `in: "**/index.{ts,tsx}"`, the other
scoped `in: "**/!(index).{ts,tsx}"` (non-index files). The original `checkStep()` tested BOTH patterns
against every added line in the WHOLE diff, regardless of which file the line was in. This produced false
hits: `h2v2-bs-18540-fixed`'s diff adds `export * from './types';` to `index.ts` as the fix the maintainer
asked for; the unscoped check matched this line against the non-index-scoped pattern and reported a false
positive. The same mechanism inflated `h2v2-bs-18540-prefix`, `h2v2-bs-20007-prefix`, `h2v2-bs-6882-prefix`
(real positives, correctly labeled violate, but the compiled pattern that "hit" them was the WRONG,
non-index-scoped one matching lines in files the pattern was never meant to cover) and `h2v2-bs-6882-fixed`
(another false positive from the same mechanism).

## Fix (2026-11-08)

`checkStep()` now parses each case's diff into per-file added-line blocks (`filesWithAddedLines()`,
tracking each file's `newPath`, null for a deletion/`+++ /dev/null`), computes each pattern's `inRe` via
Mole's own `globToRegExp` (`packages/decisions/src/check/options.ts`, exported from `check/index.js` --
reused, not reimplemented), and only tests a pattern against a file's lines when
`f.newPath !== null && (!p.inRe || p.inRe.test(f.newPath))` -- the exact inverse of pr-check.ts:318's
`continue` condition. See `run/test_file_scope_fix.mjs` for a standalone assertion-based demonstration
using `h2v2-bs-18540-fixed`'s real diff: the index.ts `export * from './types'` line matches the
non-index pattern's regex TEXT but not its file scope, and the fixed `checkStep()` no longer predicts
violate for that case.

Re-run was CHECK-ONLY: `compiled_adrs_v2.json` (the 2 real compiled ADRs, one `hermes` call each from the
original run) was reused unchanged -- no recompile, no model call. Pre-fix predictions kept at
`run/arm_t46_cascade_v2.json.PRE_FILESCOPE_FIX.bak` for the diff. `scored_v2.json`'s `t46_cascade` block
and the T53-vs-T46-cascade McNemar pair were recomputed (`run/rescore_t46_filescope_fix.py`) and
`results-v2.md` corrected in place (see its own "CORRECTION (2026-11-08...)" note at the top).

## A real, separate, NOT-fixed finding this exposed

Once correctly scoped, adr004's `in: "**/!(index).{ts,tsx}"` pattern matches NO real file path: it uses
`!(...)` extglob negation syntax that `globToRegExp` (gitignore-style glob -> regex: `**`, `*`, `?`,
`{a,b}`) does not implement -- it is compiled as the literal string `!(index)`, which no real file is
named. This means 3 of T46 cascade's originally-reported 4 "true positives" were hitting through a
pattern that, correctly scoped, is dead -- the file-scope bug had been MASKING this separately-broken
pattern. Fixing `globToRegExp`'s extglob gap (or having T46's compiler avoid drafting glob syntax it
doesn't support) is a real improvement but is explicitly NOT this task's scope; reported here, not hidden.

## Net effect on the v2 T46 cascade numbers

Recall: 1.000 (4/4) -> 0.250 (1/4). False-alarm: 0.429 (3/7) -> 0.143 (1/7). Only `h2v2-bs-17875-fixed`
remains a genuine false positive (adr003's `^export default\b`, correctly scoped, legitimately still
matching an unrelated `export default {` elsewhere in that diff).
