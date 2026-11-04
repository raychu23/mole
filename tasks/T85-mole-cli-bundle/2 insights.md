## Summary
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
