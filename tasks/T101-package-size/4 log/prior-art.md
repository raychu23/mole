# T101-package-size: prior art (fetched 2026-11-04)

- google-gemini/gemini-cli PR #19171 (github.com/google-gemini/gemini-cli/pull/19171):
  npm publish path shipped unbundled dist/ + full node_modules/ = 44,835 files; switched to
  shipping an esbuild bundle instead -> ~129 files, 6.8 MB compressed. Same shape of problem
  as Mole's: an npm-published CLI was shipping its whole dependency tree instead of a bundle.
- Data-Wise/himalaya-mcp docs/guide/packaging.md: esbuild single-file bundle eliminated a 72 MB
  node_modules dir down to a 604 KB dist/index.js for an MCP server -- "No runtime node_modules
  needed". Same order of magnitude as mole-code's own node_modules-shaped bloat (vendored
  dependency-cruiser/typescript).
- npm docs' `files` allowlist field + loige.co "Lean npm packages" (lmammino/loige.co,
  2019-09-08) and the "Strict Diet" writeup (medium.com/frontendjourney, put-your-npm-package-
  on-a-strict-diet): whitelist only the real runtime output (dist/, bin/) via package.json
  `files`, never rely on default-include-everything. mole-code's package.json already does
  this (files allowlist, D97) -- the bloat here was inside the allowlisted dist/ tree itself
  (a fully-vendored node_modules/typescript, and typescript re-bundled into 3 separate esbuild
  outputs), not a missing-files-field problem.
- npm-shipwright (npmjs.com/package/npm-shipwright): a packed-size + file-count regression gate
  comparing `npm pack --dry-run --json` against the previous published version, citing a real
  incident (a 57 MB stray source map in a published CLI tarball). Relevant to this task's done-
  when (packed/unpacked size + file count, measured via the same `npm pack --dry-run --json`)
  but not adopted here (no publish gate exists yet for mole-code; NOT RUN, out of boundary).

Applied: made `typescript` external to the esbuild bundle (like dependency-cruiser and
better-sqlite3 already were) instead of inlining it 3x (cli.js + worker.cjs + mcp.cjs), and
trimmed the vendored `node_modules/typescript` to just `lib/typescript.js` + `lib/lib.*.d.ts`
(the compiler API + its default libs, both load-bearing -- see bundle-daemon.mjs's
vendorTypescriptRuntime doc comment), dropping tsc/tsserver/typingsInstaller entry points and
~13 locale directories that were never reachable from `require('typescript')`.
