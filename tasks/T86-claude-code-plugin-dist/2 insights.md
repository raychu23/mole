## Summary (D97 follow-up merged in -- see "D97 update" below for what is now true)

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
MCP `initialize`/`tools/list` handshake -- all green, alongside the full pre-existing plugin test suite
(55/55) and the repo-wide `mole rules` gate (0 violations).

## D97 update (T85 merged in, same task): what is now true

- **One npm package, `mole-code`, now carries all three things D97 asked for**: the bundled `mole` CLI,
  the `mole-mcp` MCP stdio server, AND these plugin files (`.claude-plugin/plugin.json`, `hooks/hooks.json`,
  `scripts/*.mjs`, `.mcp.json`). It lives at `release/mole-code/` -- outside the `packages/*` workspace
  glob (verified: a root `npm install` in this worktree no longer sees a `mole`/`mole-mcp` bin collision;
  `node_modules/.bin/mole` still resolves to `packages/daemon`'s own bin). `plugins/claude-code` stays the
  single source of truth for the four files above; `release/mole-code/tools/build.mjs` COPIES them at
  build time, never hand-duplicated.
- **`.claude-plugin/marketplace.json` now uses the documented npm plugin source**, fetched from
  `code.claude.com/docs/en/plugins/marketplace-reference` on 2026-11-03: `{"source": "npm", "package":
  "mole-code"}`, replacing the old relative-path source (`"./plugins/claude-code"`). The undocumented
  `author`/`license` keys at the marketplace-entry level are dropped (per that same page: those fields
  belong in `plugin.json`, which an npm-sourced entry still reads as the manifest).
- **One shared bundle module**, `scripts/bundle-daemon.mjs` (repo root), replaces the near-duplicate
  esbuild blocks that used to live separately in `apps/vscode/esbuild.mjs`, `release/mole-code/tools/build.mjs`
  (the former `packages/cli-dist/scripts/build.mjs`), and this plugin's own `scripts/build.mjs`.
  `apps/vscode/esbuild.mjs` adopted it for its daemon+worker step with ZERO output change: verified
  byte-identical `sha256sum` on `dist/daemon.cjs` and `dist/worker.cjs` before and after the refactor.
- **One native-dependency strategy, picked with evidence, replacing T85's original "list as a real npm
  `dependency`" for dependency-cruiser**: both dependency-cruiser and better-sqlite3 (and now `typescript`,
  see the bug below) are **vendored** -- copied, with dependency-cruiser's full transitive closure, into
  `dist/node_modules/` at build time from this repo's own already-resolved install -- not left as
  `dependencies` of the shipped package. Evidence: Claude Code's own npm-plugin-source docs say "The
  package's install scripts ... never run, and its dependencies aren't installed during the fetch. If the
  package has a supported lockfile ..., Claude Code installs those ... in a separate step, also with
  scripts disabled" -- a real `dependency` is not guaranteed to be there when the plugin needs it, and D97
  explicitly chose "npm source with bundle in the tarball" over the alternatives for exactly this reason.
- **A real bug found and fixed in review, not the one T85 originally suspected**: vendoring
  dependency-cruiser's OWN directory (without its 18 further npm dependencies) crashes immediately
  (`Cannot find package 'safe-regex'`); fixed with a new shared `vendorPackageTree()` that recursively
  vendors a package's full `dependencies` closure. Once that crash was gone, `mole rules` still silently
  reported 0 violations instead of the expected 1 on a planted fixture rule -- reproducibly, but ONLY when
  the CLI's `dist/` was not nested inside this monorepo (a plain `cp -R dist` elsewhere, or a real `npm
  install`, always reproduced it; the original build location inside the repo never did, which is why T85's
  own isolated-install test and this task's original `dist-standalone.test.ts` both missed it -- neither
  ever left the monorepo's own node_modules ancestry). Root cause: dependency-cruiser's TypeScript-AST pass
  (`tsPreCompilationDeps`, needed to parse a `.ts` import for rule matching at all) does its own `await
  tryImport('typescript')` and silently treats every import as rule-compliant the moment that import fails
  -- which it does unless a real `typescript` package is resolvable from `dist/`'s own node_modules or an
  ancestor of it. Fixed by also vendoring `typescript` (see `scripts/bundle-daemon.mjs`'s
  `vendorPackageTree`). This -- not a dependency-cruiser version mismatch -- is almost certainly what T85's
  original "caret resolves to a patch version that silently misses the violation" symptom actually was; see
  `tasks/T85-mole-cli-bundle/2 insights.md`'s correction for the 3 checks that ruled the version theory out.
- **One MCP bundling strategy for both this plugin and `mole-code`, replacing T85's separate real-ESM
  `dist/mole-mcp.mjs`**: both now share `scripts/mcp-entry.ts` (repo root; moved from this plugin's own
  `scripts/` directory) and bundle it to CommonJS (`dist/mcp.cjs`), via `bundleDaemon`'s `mcpEntry` option.
- **LICENSE is copied into `release/mole-code` at build time**; `npm pack --dry-run` lists it under `files`
  (asserted in `release/mole-code/tools/test-install.mjs` and `plugins/claude-code/test/mole-code-pack.test.ts`).
- **Tests**: `plugins/claude-code/test/mole-code-pack.test.ts` is the clean-dir test D97 asked for --
  `npm pack`s `mole-code`, installs the tarball into a fresh dir with no access to this repo's
  `node_modules`, treats the installed package directory as the Claude Code plugin root, and runs all 4
  hooks with documented stdin against a tiny temp git repo carrying a `.mole` decision, the MCP
  initialize/tools-list handshake, `mole rules` finding a planted violation, and a daemon
  start(via `map`)/status/stop round trip. `plugins/claude-code/test/marketplace-npm-source.test.ts` is the
  marketplace-clone test: `git clone`s this committed worktree into a temp dir and checks
  `marketplace.json` parses, names the npm package, and that no `dist/` exists anywhere in the clone.

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
