## Summary
Fixed the T58 review 2 reproducer: a `.mole` incident (or decision/ADR) block list whose items increase indent
partway through (`- a` at 2 spaces then `- b` at 4) isn't a `yaml` parse error — YAML's own plain-scalar folding
silently merges the later line into the previous item's text, so the list quietly lost members with no error at
all. `frontMatter()` in `packages/decisions/src/graph.ts` now walks the parsed tree for a continuation line that
itself looks like another list item and turns it into a `Problem` with file:line; every existing caller
(`loadIncidents`, `loadMoleDecisions`, `loadIntent`, `loadAdrDir`) already converts a `frontMatter()` error into a
reported Problem instead of a silent skip, so the fix needed no caller-side changes. Decreasing-indent (the other
half of the reproducer) was already a real `yaml` parse error and already reported correctly — kept as a named
regression test. Genuinely different but internally-consistent indentation between sibling lists is unaffected.
Swept every record in `packages/decisions/bench/corpora` + `test/fixtures` through the old and new `frontMatter()`
side by side: zero vendored records changed result (see `4 log/snapshot-diff.txt`).

Review fix (HIGH false positive): `foldedListItem()` originally checked EVERY plain scalar node in the front
matter tree for a dash-looking continuation line, so ordinary prose like `description: root cause was X\n  -
this happened because of Y` (no list anywhere) was wrongly reported as a YAML error and the whole record got
flagged. A list item can only be silently lost when the folded scalar is itself an ITEM of a YAML sequence
(`isSeq(parent)`) — a plain map VALUE, however it is indented, is not a list and loses nothing. `foldedListItem`
now threads an `isSeqItem` flag through the recursion: `true` only for the direct children of a seq's `items`
list, `false` for every map key and map value (even a map value that lives inside a seq item, which folds into
that VALUE, not a sibling seq item). Added false-positive regression tests: the reviewer's prose reproducer, a
map value nested inside a seq item whose continuation line starts with `-`, a block scalar (`|`) body, and a
quoted scalar — all now correctly load with no error. The two original true-positive cases (2-space-then-4-space
increasing indent, and the 4-space-then-2-space decreasing-indent YAML error) and the sibling-lists regression
stay green. Re-ran the before/after corpora snapshot sweep: still 0 diffs.

Files: `packages/decisions/src/graph.ts` (fix), `packages/decisions/test/incident-loader-indent.test.ts` (red→green
reproducer + regressions + 4 new false-positive guards), `packages/decisions/test/incident-loader-indent-snapshot.test.ts`
(before/after sweep, re-run clean).

Checks: `npx tsc -b` clean (decisions + daemon); `npx vitest run packages/decisions packages/daemon` 504/504
passed (45 files, up from 500 before the review-fix tests were added).
