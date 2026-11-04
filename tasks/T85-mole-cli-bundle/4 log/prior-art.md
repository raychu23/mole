## T85 prior art: bundling a TS monorepo CLI + native/ESM deps into one npm package

Fetched 2026-11-03/04 (dates as returned by the search backend; all primary sources, not summaries):

1. https://github.com/evanw/esbuild/issues/1921 — "How to fix 'Dynamic require of "os" is not supported'"
   (esbuild maintainer repo, issue opened 2022-01-07, comments through 2026-01-06). Confirms the exact
   failure this task hit when bundling `mole-mcp` as ESM (TypeScript's `getNodeSystem`, `yaml`'s env
   detection doing `require(<dynamic>)`), and the fix used here verbatim: a `banner: { js:
   "import { createRequire } from 'module'; const require = createRequire(import.meta.url);" }` so
   esbuild's generated `__require` shim (which only falls back to a real `require` when
   `typeof require !== 'undefined'`) finds one. Applied in `packages/cli-dist/scripts/build.mjs`.

2. https://github.com/tinacms/tinacms/issues/6785 and
   https://nilaykabariya.blog/fixes/could-not-locate-the-bindings-file-sqlite3 — both describe the same
   failure mode for native addons under esbuild: a native module (better-sqlite3 in both cases) loaded
   through `bindings`/`__dirname`-relative lookup breaks once esbuild inlines its JS into a single bundle
   file, because the `.node` binary never moves with it and the relative path no longer points at
   `node_modules`. Both fixes are `external: ['better-sqlite3']` so Node loads it from `node_modules` at
   runtime instead. This task doesn't actually touch `better-sqlite3` from Mole's own code (the graph DB
   uses the Node-builtin `node:sqlite`), but `@mole/agentstate`'s langgraph sqlite checkpointer pulls it
   in transitively for `mole runs|agents|collisions`, so the same `external` + real-`dependency` pattern
   was applied in `packages/cli-dist/package.json`/`build.mjs`.

3. https://docs.npmjs.com/cli/v8/commands/npm-install/ — `npm install <tarball file>` strips one
   directory layer (the `package/` prefix `npm pack` always wraps a tarball in) and installs exactly what
   the tarball contains, which is what makes `npm pack` + `npm install <tgz>` into an empty temp dir (no
   `--offline`, no local file: link) a faithful stand-in for "someone installs this package for real" —
   the basis for `packages/cli-dist/scripts/test-install.mjs`'s isolated install.

4. `apps/vscode/esbuild.mjs` + `apps/vscode/scripts/package.mjs` (this repo, already in the codebase, not
   fetched externally): the existing precedent for bundling `packages/daemon/src/cli.ts` straight from
   TypeScript source with esbuild for a package shipped without this repo's `node_modules`. Reused
   directly: the `import.meta.url` banner rewrite for CJS, the `dependency-cruiser` external (same reason
   — ESM + top-level await, cannot go in a `cjs` bundle), and the daemon + worker-thread `.cjs` pair. The
   difference this task had to add on top: (a) `mole-mcp` itself has top-level `await` so needed `esm`
   output instead of `cjs`, which is what surfaced the dynamic-require problem in source 1 above; (b)
   because this package ships through real `npm install` (unlike the vsix, which ships with *no*
   `node_modules` at all), `dependency-cruiser` and `better-sqlite3` could be left as real runtime
   `dependencies` instead of requiring a "needs a repo checkout" caveat.

## What this ruled out
- Bundling `mole-mcp` as `cjs` and just not using top-level `await`: not viable without editing
  `packages/mcp/src/cli.ts` (outside this task's boundary — `packages/cli-dist` + root README/scripts
  only), since the MCP SDK's `server.connect()` call is itself top-level `await` in the shared source.
- Marking every CJS dep with a dynamic `require()` external one at a time (`yaml`, `typescript`, ...):
  works but is whack-a-mole with no guarantee of catching the next one; the `createRequire` banner fixes
  the whole class of failure at once and is esbuild's own documented workaround (source 1).
