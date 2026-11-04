## Summary (superseded by T86/D97 -- see "D97 update" below for what is now true)
- One public npm package, `mole-code` (npm 404-checked free; `mole-cli` is taken), bundles the `mole` CLI
  and `mole-mcp` MCP stdio server from TypeScript source with esbuild, reusing the vsix esbuild approach.
- No real native dependency exists in this codebase (`node:sqlite`, not `better-sqlite3`, for the graph
  DB); the only native transitive dep is `better-sqlite3` via `@mole/agentstate`'s langgraph sqlite
  checkpointer, used only by `mole runs|agents|collisions`. It and `dependency-cruiser` (ESM,
  top-level await) are `external` in the esbuild bundle and real `dependencies` of the dist package, so
  `npm install` fetches dependency-cruiser's JS + better-sqlite3's prebuilt binary normally.
- `mole-mcp` has top-level await (MCP SDK `connect()`), incompatible with cjs output; it ships as real
  ESM (`dist/mole-mcp.mjs`) with a `createRequire` banner so bundled CJS deps' dynamic `require()` calls
  (TypeScript's `getNodeSystem`, `yaml`'s env detection) resolve instead of throwing esbuild's stub.
- Found and fixed a real bug during the isolated-install test: `dependency-cruiser@^18.7.0` resolves to
  18.7.2 on a fresh install and silently reports 0 violations where the repo's pinned 18.7.0 reports 1;
  pinned the dependency to the exact `18.7.0` the rest of the repo uses.
- `packages/cli-dist/scripts/test-install.mjs`: build -> `npm pack` -> install the tarball into an
  isolated temp dir with no access to this repo's `node_modules` -> `mole help`, `mole rules` (1
  violation on a tiny fixture), `mole check --worktree`, and a real MCP `initialize` + `tools/list`
  JSON-RPC exchange with `mole-mcp` over stdio. All 6 steps pass (exit 0).
- Did not publish anything. `npx tsc -b` + `node packages/daemon/dist/cli.js rules --root .` report 0
  violations; `npx vitest run packages/decisions packages/daemon packages/mcp` = 575/575 passed.

## D97 update (T86 merge, same review pass): what is now true
- **The dependency-cruiser "silently misses the violation" claim above did NOT reproduce.** Checked 3
  independent ways in review: (1) built this task's own `mole-code` tarball, installed it into two isolated
  temp dirs, forced one to `dependency-cruiser@18.7.2` (the exact version a bare `^18.7.0` resolves to
  today) and the other to the repo's pinned `18.7.0`, ran the identical fixture through both -- both report
  the violation identically (exit 1, same `breaks 0001` line); (2) diffed the two versions' installed files
  (`diff -rq`) -- real code changes exist between patches, but none behaviorally relevant here;
  (3) confirmed the caret-resolves-to-18.7.2 premise is still true today (`npm install 'dependency-cruiser@^18.7.0'`
  with no lockfile → 18.7.2), then re-ran the fixture against that exact install and it still found the
  violation. The exact pin is **kept anyway** -- not because the claimed bug is real, but for
  determinism/reproducibility (matches the rest of the repo's lockfile) and because D97 moots the question
  entirely: `dependency-cruiser` is now **vendored** into `dist/node_modules/` at build time (copied, full
  dependency closure, from this repo's own already-resolved install) rather than left as an installable
  `dependency` of the shipped package, so no consumer-side `npm install` ever re-resolves its version at all.
- **A real, reproducible bug was found in its place** (by T86's review, while building the clean-dir /
  marketplace test this merge adds): `mole rules` against the SAME fixture, with dependency-cruiser
  correctly vendored, still silently reported 0 violations instead of 1 -- but only when the CLI's bundled
  `dist/` was NOT nested inside this monorepo (a plain `cp -R dist` to anywhere else, or a real npm install,
  reproduced it every time; the original build location inside the monorepo never did). Root cause:
  dependency-cruiser's own TypeScript-AST pass (`tsPreCompilationDeps`, required for `mole rules` to parse a
  `.ts` import at all) does `await tryImport('typescript')` and treats every import as rule-compliant
  the moment that import fails -- which it always does once `dist/` has no ancestor `node_modules/typescript`
  to find, which the repo's own hoisted install always supplies when testing from inside the tree. Fixed by
  also vendoring `typescript` into `dist/node_modules/` (see `release/mole-code/tools/build.mjs` and
  `tasks/T86-claude-code-plugin-dist/2 insights.md`).
- `packages/cli-dist` moved to `release/mole-code/` (outside the `packages/*` workspace glob -- the
  bin-collision risk this file's Notes section flagged as a TODO is now actually fixed, verified by a
  root `npm install` in the T86 worktree with `node_modules/.bin/mole` still pointing at `packages/daemon`).
- `mole-mcp` no longer ships as separate ESM (`dist/mole-mcp.mjs`); it now shares T86's CJS `mcp-entry.ts`
  wrapper (`dist/mcp.cjs`), one MCP bundling strategy for both the CLI package and the plugin instead of two.
- The package now ALSO carries the Claude Code plugin files (D97: one npm package for all three); see T86's
  insights for that half.

## Notes
- Tarball: 4,920,876 bytes (~4.8 MB, gzip). Unpacked bundles: `dist/mole.cjs` 13.3 MB, `dist/worker.cjs`
  9.5 MB, `dist/mole-mcp.mjs` 4.3 MB — large mostly from `@langchain/*` (agentstate), bundled because
  most of its surface (`mole runs|agents|collisions`) is reached only via dynamic `import()`, which
  esbuild still inlines into the main chunk without `--splitting` (not used here: a single-file CJS bin
  needs to stay a single file for `files:` to stay simple).
- `mole --help` exits 2 on purpose (pre-existing CLI quirk, not introduced here): the arg parser's
  `[cmd = 'help', ...rest] = argv` default only fires when `argv[0]` is `undefined`, so `--help` itself
  becomes `cmd = '--help'`, which the final `cmd === 'help' ? 0 : 2` branch does not match. `mole help`
  or no args exits 0. Documented in `packages/cli-dist/README.md`; test script uses `mole help`.
- `packages/cli-dist` is a real (non-private) package.json living in `packages/*`, so npm workspaces
  would pick it up on a root `npm install` — its `mole`/`mole-mcp` bin names collide with
  `packages/daemon` and `packages/mcp`'s own bins. Deliberately never ran `npm install` at the worktree
  root for this task: `scripts/build.mjs` relies on Node's normal upward `node_modules` resolution from
  `packages/cli-dist/scripts/` to find the already-hoisted `esbuild` at the repo root, so no root install
  or lockfile change was needed. If this ships for real, cli-dist should move outside the `packages/*`
  glob (or the glob should exclude it) before anyone runs `npm install` at the root.
- Engines: `>=22.13` (matches root `package.json`). License: MIT (repo's existing `LICENSE`, copied into
  the tarball via `files:`).
- NOT RUN: actually publishing to npm (explicitly out of scope / forbidden); testing on Windows/Linux
  (this machine is macOS only, same limit the vsix's own PUBLISH.md already states); testing `mole map`
  /`mole impact`/`mole daemon` (the daemon + worker-thread path) end to end, since the isolated-install
  test deliberately stays on no-daemon subcommands for speed — `dist/worker.cjs` is built and shipped
  next to `dist/mole.cjs` but its daemon round-trip was exercised, pre-bundling, only via the repo's own
  vitest suite, not through the packed tarball.
