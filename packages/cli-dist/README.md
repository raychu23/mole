# mole-code

The Mole CLI (`mole`) and MCP stdio server (`mole-mcp`), bundled as one installable npm package.
Not published yet (T85); built here so a person outside this monorepo can `npm install` it without a
full repo checkout.

## Install

```sh
npm install -g mole-code      # or: npx mole-code --help
```

Requires Node >= 22.13 (uses the built-in `node:sqlite`, which is stable but still warns
"SQLite is an experimental feature" on the console — that warning is expected).

## What you get

- `mole` — the daemon CLI: `mole map`, `mole impact`, `mole check`, `mole rules`, `mole decisions`,
  `mole note add`, `mole memory`, and more. Run `mole --help` for the full list.
- `mole-mcp` — the same functionality as an MCP stdio server, for Claude Code / Cursor / any MCP client.
  Point your MCP client's command at `mole-mcp` (no args; `MOLE_ROOT` env var picks the repo, default cwd).

Both commands work from any TypeScript repository; most subcommands (`rules`, `decisions`, `check`,
`note`, `memory`) need no daemon and no build step. `map`/`impact`/`daemon` spawn a short-lived
background daemon per repo (see `dist/worker.cjs` next to `mole.cjs`: do not remove it).

## How it is built

`scripts/build.mjs` bundles `packages/daemon/src/cli.ts` (+ its worker thread) and
`packages/mcp/src/cli.ts` straight from TypeScript source with esbuild — the same approach
`apps/vscode/esbuild.mjs` uses to bundle the daemon into the VS Code extension. Differences from the
vsix build, both forced by things that cannot be bundled:

- `dependency-cruiser` (ESM, top-level await) and `better-sqlite3` (native addon, pulled in
  transitively by `@mole/agentstate`'s langgraph sqlite checkpointer) are both marked `external` and
  listed as real `dependencies` of this package, so `npm install` fetches dependency-cruiser's JS and
  better-sqlite3's prebuilt binary for the target machine normally.
- `mole-mcp` itself has top-level `await` (the MCP SDK's `server.connect()`), which the `cjs` output
  format cannot express, so it ships as real ESM (`dist/mole-mcp.mjs`); a `createRequire` banner makes
  the handful of dynamic `require()` calls deep inside bundled CJS deps (TypeScript's `getNodeSystem`,
  `yaml`'s environment feature-detection) resolve for real instead of throwing esbuild's "Dynamic
  require is not supported" stub.

```sh
npm run build   # -> dist/mole.cjs, dist/worker.cjs, dist/mole-mcp.mjs
npm test        # npm pack + install the tarball into an isolated temp dir + exercise both bins
```

## Testing in isolation

`scripts/test-install.mjs` runs `npm pack`, installs the resulting tarball into a fresh temp directory
that has **no access to this repo's `node_modules`**, then from there: `mole --help`, `mole rules` and
`mole check --worktree` against a tiny scratch git repo with one `.mole/decisions` rule, plus a real
MCP `initialize` + `tools/list` JSON-RPC exchange with `mole-mcp` over stdio. It never publishes
anything.
