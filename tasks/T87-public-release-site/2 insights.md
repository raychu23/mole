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

### Review fixes (round 3)

**HIGH — round 2's non-literal/dynamic-import trick broke every build, not just the export.** Round 2's fix
for the TS5083 export build failure (loading `@mole/agentstate`/`@mole/coverage` through a variable import
specifier, `packages/mcp/src/optional-agentstate.ts`/`optional-coverage.ts`, `packages/steer/src/index.ts`,
`packages/daemon/src/cli.ts:113-120`) solved tsc but broke esbuild the same way: esbuild can only bundle an
`import()` whose argument is a string literal, so every bundle built from this source — the installed
`mole-code` npm tarball's `dist/cli.js`/`dist/mcp.cjs` and the VS Code extension's `dist/daemon.cjs` — silently
dropped both packages and answered "not available in this build" for `mole runs/agents/claims`, `mole steer
query` and the `mole_coverage`/`mole_claims`/`mole_tried`/`mole_collisions`/`mole_agent_intent` MCP tools, in
every build (private repo, public release, VS Code), not just the public source export the fix targeted.
Confirmed red on 6425bc5 by extending `release/mole-code/tools/test-install.mjs` to build+pack+install the
tarball into a clean dir and call those CLI/MCP surfaces on a tiny temp git repo (`tasks/.../4 log/red.txt`):
all four new steps failed with "not available in this build".

Fixed structurally, per the review: the product source (`packages/mcp/src/server.ts`, `collisions-tool.ts`,
`packages/steer/src/index.ts` + `types.ts`, `packages/daemon/src/cli.ts`) is back to the exact plain literal
imports `main` has (diffed byte-for-byte against `main` except the unrelated `mole demo` addition); deleted
`optional-agentstate.ts`/`optional-coverage.ts`. The export-time swap now lives ONLY in
`scripts/export-public.mjs`: `writeOssStub()` generates one small local stub module per package per consumer
package (e.g. `packages/mcp/src/_oss-agentstate-stub.ts`), with the real function names and real call-site
shapes (reusing the same structural interfaces round 2's deleted files had — `CoverageScanResult` etc — so
`noImplicitAny` still passes on every `.filter`/`.map`/spread the real callers do), each one throwing "is not
part of the open-source Mole build" when actually called; `rewriteImportSite()` then does a literal, asserted
string replacement of the four real import specifiers (`@mole/agentstate` → `./_oss-agentstate-stub.js`, etc.)
in the exported copy only — a normal literal import of a real (if stub) file, so both tsc and esbuild handle
it like any other local module; no "optional"/non-literal anything anywhere. `dropTsconfigRefs`/
`dropPackageDeps` are unchanged from round 2 (still needed since `packages/agentstate`/`coverage` stay
excluded from the export).

Verified: (a) `release/mole-code/tools/test-install.mjs`'s new steps are green on this fix (private repo build
— tarball bundles the real packages): `mole runs`/`agents`/`steer query` give the real "no run(s)"/"no agent
run" messages (same as `main`, never "not available"), and `tools/call` for all 5 MCP tools returns real
data/real not-found errors, never "not available" (`4 log/green-test-a.txt`; note the agentstate scan of this
machine's real `~/.claude`/`~/.codex`/`~/.hermes` session history can take 20–30s, so the test polls for
responses instead of a fixed sleep). (b) `node apps/vscode/esbuild.mjs` then `dist/daemon.cjs` contains real
agentstate symbols (`agentIntentsFor`/`scanAgents`/`queryAgentState`, 8 hits) and zero occurrences of "not
available in this build" or the stub helpers. (c) `node scripts/export-public.mjs <dir>` → `npm install && npm
run check` passes clean (`tsc -b` + `vitest run`, 0 errors) in a fresh export
(`4 log/green-test-c-export-check.txt`); privacy scan (both the script's own and the reviewer's grep list)
stays 0 real hits (`hermesLlmClient` is a pre-existing public API identifier, not a leak). Private repo
`npm run check` still passes unchanged (1347/1347 tests, same as before this fix). `node
packages/daemon/dist/cli.js rules --root .` stays 0 violations.

**MEDIUM — `.tgz` not excluded from the export.** A stray `npm pack` output left in `release/mole-code/`
during local dev would have been copied into the public export (it already has its own
`release/mole-code/.gitignore` entry but `export-public.mjs`'s own exclude list didn't). Added `/\.tgz$/` next
to the existing `/\.vsix$/` entry.
