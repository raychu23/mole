## Summary

Made the Claude Code plugin at `plugins/claude-code` installable outside the Mole repo. Added
`plugins/claude-code/scripts/build.mjs` (esbuild, following `apps/vscode/esbuild.mjs`'s pattern) that
bundles `@mole/daemon`'s CLI + worker and a new CJS-safe MCP entry point into `plugins/claude-code/dist/`,
self-contained including a vendored better-sqlite3 native binary. `.mcp.json` and `scripts/lib.mjs`'s
`findMole()` now resolve everything through `${CLAUDE_PLUGIN_ROOT}`-relative paths, checking the plugin's
own bundled `dist/cli.js` first. `plugin.json` is 0.2.0 with `displayName` added; a repo-root
`.claude-plugin/marketplace.json` lists the plugin at `source: "./plugins/claude-code"`.
`scripts/export-public.mjs`'s allowlist now includes `plugins/` and `.claude-plugin/`, excluding the
plugin's private `bench/`/`test/` dirs (they embed internal ledger task-directory names) and with two
plugin/marketplace-author exceptions added to its forbidden-string scan allowlist.
`plugins/claude-code/test/dist-standalone.test.ts` builds the plugin, copies ONLY the distributable files
to a fresh temp dir outside the repo, and runs every hook script against documented sample stdin plus the
MCP `initialize`/`tools/list` handshake — all green, alongside the full pre-existing plugin test suite
(55/55) and the repo-wide `mole rules` gate (0 violations).

## Notes

- **MCP bundling detour**: `packages/mcp/src/cli.ts` has a top-level `await`, which rules out esbuild's CJS
  output; esbuild's ESM output then can't shim this server's own CJS dependencies' dynamic `require` calls
  (hit it with `typescript`, then `yaml`). Solved with a new entry point,
  `plugins/claude-code/scripts/mcp-entry.ts`, that is byte-identical to `cli.ts`'s logic except the awaits
  live inside an `async main()` — lets the whole bundle stay CommonJS like the other two. `packages/mcp/src`
  itself is untouched (outside this task's boundary).
- **`dist/cli.js` is named `cli.js`, not `daemon.cjs`**, on purpose: `@mole/daemon`'s `ensureDaemon()`
  (`client.ts`'s `defaultCli()`) falls back to `<dir of caller>/cli.js` for any process that isn't itself
  named `daemon.cjs`, and the bundled MCP server relies on exactly that fallback to find and spawn the
  daemon with zero changes to `@mole/mcp`'s source.
- **better-sqlite3 handled, not just degraded**: the build copies this machine's prebuilt `.node` binary
  into `dist/node_modules/better-sqlite3/`, so `mole collisions`/`runs`/`tried`/`agents` actually work on
  the build platform. A different OS/arch falls back to the pre-existing graceful degrade (hooks already
  swallow any CLI failure); documented in the plugin's README.
- **dependency-cruiser stays external, undistributed** (ESM + top-level await, same constraint
  `apps/vscode/esbuild.mjs` already documents): `mole rules` needs a real `npm install` of it next to the
  bundled CLI. Same degrade path as better-sqlite3's cross-platform case.
- **export-public.mjs**: the full repo already fails its own private-string scan today, independent of this
  task (packages/* comments reference internal `T##-name` task directories throughout) — out of this task's
  boundary to fix repo-wide. Verified only that this task's own additions (plugin + marketplace files) scan
  clean on their own.
- **`dist/` stays gitignored** (repo-wide `dist/` rule, unchanged): distributing the plugin means running
  `build.mjs` once before publishing a release / adding the marketplace, not committing ~37 MB of bundled
  JS to the branch. Documented in the plugin's README's new "Install outside the Mole repo" section.
- Two pre-existing private references were genericized as part of this change (not functional): a
  `tasks/T74-steering-dials/4 log/red.txt` path cited in two comments (replaced with "this task's own
  internal log"), and a `(Raymond 10-29 15:30)` aside in a comment — both inside files this task's build now
  ships, so they'd otherwise leak into the exported plugin.
