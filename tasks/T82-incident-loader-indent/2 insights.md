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

Files: `packages/decisions/src/graph.ts` (fix), `packages/decisions/test/incident-loader-indent.test.ts` (red→green
reproducer + regressions), `packages/decisions/test/incident-loader-indent-snapshot.test.ts` (before/after sweep).

Checks: `npx tsc -b` clean; `npx vitest run packages/decisions packages/daemon` 500/500 passed (45 files); `node
packages/daemon/dist/cli.js rules --root .` → 0 violations.
