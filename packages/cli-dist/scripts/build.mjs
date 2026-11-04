// Bundles the Mole CLI (`mole`) and MCP stdio server (`mole-mcp`) for the public npm package.
// Mirrors apps/vscode/esbuild.mjs's approach (same monorepo, same daemon sources):
//   - import.meta.url is rewritten for CJS (the daemon client only uses it as a fallback path hint)
//   - dependency-cruiser is ESM with top-level await and cannot go in a CJS bundle; `mole rules` imports it
//     lazily, so it is kept external and listed as a real npm dependency of this package instead (works
//     here because this package ships through `npm install`, unlike the vsix which ships with no node_modules)
//   - better-sqlite3 is a native addon (pulled in transitively by @mole/agentstate's langgraph sqlite
//     checkpointer, used by `mole runs|agents|collisions`); it is kept external too and listed as a real
//     dependency so npm installs/builds the prebuilt binary for the target machine, same reasoning as above
//   - the daemon's worker thread (worker.ts) ships as its own bundle next to mole.cjs, same as the vsix's
//     dist/daemon.cjs + dist/worker.cjs pair
import { build } from 'esbuild';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..'); // packages/cli-dist
const repoRoot = join(root, '../..');

const common = { bundle: true, sourcemap: false, logLevel: 'info', target: 'node22', platform: 'node', format: 'cjs' };
// import.meta does not exist in CommonJS: point it at the bundle file instead of leaving it undefined
const importMeta = { define: { 'import.meta.url': '__importMetaUrl' }, banner: { js: "const __importMetaUrl = require('node:url').pathToFileURL(__filename).href;" } };
const external = ['dependency-cruiser', 'better-sqlite3'];

await build({ ...common, ...importMeta, external, entryPoints: [join(repoRoot, 'packages/daemon/src/cli.ts')], outfile: join(root, 'dist/mole.cjs') });
await build({ ...common, ...importMeta, external, entryPoints: [join(repoRoot, 'packages/daemon/src/worker.ts')], outfile: join(root, 'dist/worker.cjs') });
// mcp/src/cli.ts has top-level await (MCP SDK connect()), which the cjs format cannot express: ship it as real ESM
// (.mjs always loads as ESM regardless of this package's own "type", so the sibling CJS bins are unaffected).
// 'typescript' must stay external here too: esbuild's ESM output shims require() for code that still does CJS-style
// dynamic require (typescript.js's getNodeSystem() does require(<variable>) to feature-detect fs/path at load time),
// and that shim cannot resolve a dynamic specifier to a builtin; the real require() in Node's CJS loader (used when
// bundled into the cjs daemon/worker above) has no such problem, so only the ESM entry needs this.
await build({
  ...common,
  external: [...external, 'typescript'],
  platform: 'node',
  format: 'esm',
  entryPoints: [join(repoRoot, 'packages/mcp/src/cli.ts')],
  outfile: join(root, 'dist/mole-mcp.mjs'),
  // esbuild's CJS-interop shim for a bundled CJS module only falls back to a real require() when a `require` binding
  // is in scope (it checks typeof require !== 'undefined'); ESM has none by default, so dynamic require() calls deep
  // in bundled CJS deps (typescript's getNodeSystem, yaml's environment feature-detection, ...) throw at runtime.
  // A banner-level require from node:module satisfies that check and makes them resolve for real.
  banner: { js: "import { createRequire } from 'node:module';\nconst require = createRequire(import.meta.url);" },
});

console.log('built dist/mole.cjs, dist/worker.cjs, dist/mole-mcp.mjs');
