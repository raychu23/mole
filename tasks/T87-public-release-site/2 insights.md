## Summary

Extended `scripts/export-public.mjs` to publish today's product (packages, apps/vscode, plugins/claude-code,
release/mole-code, docs, site) and pass its own private-string scan (0 hits for /Users/a1, raymond, .hermes,
tasks/, context/, ledger, AGENTS.md); excluded `agentstate`/`coverage` (built around the author's private
Hermes/ledger workflow, not an end-user feature) and all bench/test dirs; added comment-only redaction for
stray task-slug/context citations, verified it doesn't break TS/JSON syntax (247 files parsed clean).
Implemented `mole demo` (one lazy import in `packages/daemon/src/cli.ts`) using the real `rules:` enforcement
mechanism; verified end-to-end through a packed `mole-code` tarball in a clean install dir (transcript in
`4 log/demo-transcript.txt`). Wrote the public README (pitch, demo, install for every surface, verified
numbers with honesty caveats including the T63 no-productivity-gain result, a dated competitor table), 5
docs/ pages, and a static `site/index.html` with an animated terminal replay of the real transcript (no
fabricated output; screenshot not run — no `playwright` in this repo, per the task's fallback).

### Review fixes (round 2)

**HIGH — exported repo didn't build.** Root `tsconfig.json` and `packages/daemon`/`steer`/`mcp`'s
`tsconfig.json` referenced `packages/agentstate` and `packages/coverage`, which the export excludes (author-
machine workflow) — `npx tsc -b` failed TS5083/TS6053 on a clean export. Evidence showed steer/mcp/daemon have
real runtime (not just type) calls into those two packages, so genericizing them would misrepresent what they
do; chose the documented fallback instead: their compile-time dependency is now a lazy, non-literal dynamic
import (`packages/mcp/src/optional-agentstate.ts`, `optional-coverage.ts`, `packages/steer/src/index.ts`,
`packages/daemon/src/cli.ts`) — verified empirically (tsc 5.9.3) that a literal `import('@mole/agentstate')`
is statically resolved and fails once the package is gone, a variable specifier is typed `any` and never
resolved, so these degrade to a clear "not available in this build" error in the export while behaving as a
plain import in the private repo and the published npm package (which bundles both regardless of this source
mirror). `export-public.mjs` now rewrites the dangling tsconfig references + package.json deps. Same-shape bug
also found and fixed: root `tsconfig.json` also referenced the excluded, dev-only `packages/bench`.
`vitest.config.ts` now sets `passWithNoTests: true` since the export ships zero test files by design (every
package's `test/` is excluded) and vitest's default would otherwise fail `npm test` on that alone. Verified:
`node scripts/export-public.mjs`, `npm install && npm run check` (and `npx tsc -b && npm test`) all pass clean
in a fresh export dir; full output in `4 log/public-build.txt`, including a re-run of the reviewer's privacy
grep list (0 real hits) independent of the export script's own scan. Private repo `npm run check` still
passes unchanged (1347/1347 tests) — behavior-preserving.

**MEDIUM — hand-copied demo timings had drifted.** `scripts/public-README.md` and `site/index.html` showed
899 ms / 43 ms, not present in the saved transcript (which had 418 ms / 46 ms) — a stale hand-edit. Re-captured
the transcript fresh through a packed `mole-code` tarball (726 ms / 70 ms this run) and added
`scripts/demo-assets-lib.mjs` + `scripts/sync-demo-assets.mjs`, which derive both the README demo block's two
timing numbers and `site/index.html`'s entire `LINES` animation array mechanically from
`4 log/demo-transcript.txt` (idempotent — a second run is a no-op). `scripts/demo-assets-sync.test.ts` asserts
both files equal what the transcript derives (red when hand-edited off, verified by deliberately corrupting
README's timing and watching the test fail before fixing it back).
