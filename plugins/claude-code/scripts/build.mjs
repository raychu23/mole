// Bundles the mole CLI (`mole`, @mole/daemon) + its worker thread + the MCP server (@mole/mcp) into
// plugins/claude-code/dist/, so the plugin works from a plain copy of this directory with no repo checkout
// and no `npm install` (T86). Follows apps/vscode/esbuild.mjs's pattern (same bundler, same import.meta.url
// fix, same dependency-cruiser exclusion, same TypeScript default-lib copy) — see that file's comments for why
// each piece is needed; this script retargets the outputs, adds the MCP bundle, and vendors better-sqlite3.
//
//   node plugins/claude-code/scripts/build.mjs
//
// Output layout (CLAUDE_PLUGIN_ROOT-relative, used by .mcp.json and scripts/lib.mjs's findMole):
//   dist/cli.js       the daemon CLI ('mole ...'), CommonJS. Named cli.js (not daemon.cjs) ON PURPOSE:
//                      @mole/daemon's ensureDaemon() (packages/daemon/src/client.ts defaultCli()) falls back to
//                      '<dir of the running file>/cli.js' for any caller that isn't itself named daemon.cjs — the
//                      MCP bundle (dist/mcp.cjs) relies on exactly that fallback to find and spawn the daemon,
//                      with zero changes to @mole/mcp's source (out of this task's boundary).
//   dist/worker.cjs    the daemon's index worker thread (packages/daemon/src/server.ts's workerFile() looks for
//                      'worker.js' or 'worker.cjs' next to itself; cli.js's dirname is dist/, so this is found).
//   dist/mcp.cjs       the stdio MCP server, bundled from scripts/mcp-entry.ts (NOT @mole/mcp/src/cli.ts directly
//                      — see that file's header for why: cli.ts's top-level await needs a CJS-incompatible
//                      output format, and esbuild's ESM format can't bundle some of this server's own CJS
//                      dependencies (typescript, yaml) either, so CJS + a wrapper that moves the awaits into an
//                      async function is the only format that works for every dependency at once).
//   dist/lib.*.d.ts    TypeScript's own default-lib files, copied next to the bundles (see tsLib comment below).
//   dist/node_modules/better-sqlite3/  the native module @mole/agentstate's LangGraph SQLite checkpointer needs
//                      (`mole runs --export langgraph`, and loaded as a side effect of `mole collisions`/`mole
//                      runs`/`mole tried`/`mole agents` since @mole/agentstate/src/index.ts re-exports it at
//                      module scope). Copied from this repo's own install (lib/ + the prebuilt .node for THIS
//                      machine's platform — better-sqlite3 ships no universal binary). On a different OS/arch
//                      this directory simply won't load: every call site already tolerates that (lib.mjs's
//                      moleJson() catches the CLI's non-zero exit and returns undefined, so the hook silently
//                      omits that section) — see README.md's "Native module" note for the exact degrade text.
//   (dependency-cruiser is marked external and NOT copied: it is pure ESM with a top-level await, which cannot go
//   in a CommonJS bundle, same as apps/vscode/esbuild.mjs's daemon bundle. `mole rules` / the rule-violation lines
//   in the Stop hook need a real `npm install` of dependency-cruiser next to the CLI to work; everywhere else
//   degrades the same way — moleJson()/execFileSync failures are caught and print nothing.)
import { build } from 'esbuild';
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)); // plugins/claude-code/scripts
const pluginRoot = resolve(here, '..');
const repoRoot = resolve(pluginRoot, '../..');
const outDir = join(pluginRoot, 'dist');
const require = createRequire(import.meta.url);

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
// Force dist/*.js(.cjs) to load as CommonJS regardless of an ancestor package.json's "type" (this repo's root
// package.json is "type": "module" — without this, Node would try to parse cli.js as ESM and fail on the CJS
// `require` our importMeta banner emits). A plugin copied to a fresh directory with no ancestor package.json at
// all would default to CommonJS anyway; this just makes dist/ self-contained either way.
writeFileSync(join(outDir, 'package.json'), JSON.stringify({ type: 'commonjs' }, null, 2) + '\n');

const common = { bundle: true, sourcemap: false, logLevel: 'info', target: 'node22', platform: 'node', format: 'cjs' };
// import.meta does not exist in CommonJS; @mole/daemon's client.ts/server.ts use it only to find sibling files
// (defaultCli, workerFile), so point it at the bundle file itself instead of leaving it undefined.
const importMeta = { define: { 'import.meta.url': '__importMetaUrl' }, banner: { js: "const __importMetaUrl = require('node:url').pathToFileURL(__filename).href;" } };
// dependency-cruiser: ESM, top-level await — cannot be bundled into a CJS output (same as apps/vscode/esbuild.mjs).
// better-sqlite3: native (.node) binary — esbuild cannot bundle a native addon; copied separately below instead.
const external = ['dependency-cruiser', 'better-sqlite3'];

await build({ ...common, ...importMeta, external, entryPoints: [join(repoRoot, 'packages/daemon/src/cli.ts')], outfile: join(outDir, 'cli.js') });
await build({ ...common, ...importMeta, external, entryPoints: [join(repoRoot, 'packages/daemon/src/worker.ts')], outfile: join(outDir, 'worker.cjs') });
await build({ ...common, ...importMeta, external, entryPoints: [join(here, 'mcp-entry.ts')], outfile: join(outDir, 'mcp.cjs') });

// TypeScript finds its default lib files (lib.es2022.d.ts ...) next to the file it runs from, which is now dist/
// (same fix as apps/vscode/esbuild.mjs — packages/indexer, @mole/memory, @mole/flows etc. load the real `typescript`
// compiler at runtime for symbol/call-graph extraction, not just for this repo's own `tsc -b`).
const tsLib = dirname(require.resolve('typescript/lib/typescript.js'));
for (const f of readdirSync(tsLib)) if (/^lib\..*\.d\.ts$/.test(f)) copyFileSync(join(tsLib, f), join(outDir, f));

// better-sqlite3: copy this machine's prebuilt native binary + the pure-JS wrapper, so `require('better-sqlite3')`
// resolves from dist/node_modules/ without a repo checkout or npm install. Skips the multi-megabyte build/ object
// files and headers (binding.gyp, src/, deps/) — only the prebuilt .node + lib/ are needed at runtime.
const bsq = dirname(require.resolve('better-sqlite3/package.json'));
const bsqOut = join(outDir, 'node_modules', 'better-sqlite3');
const nodeBinary = join(bsq, 'build', 'Release', 'better_sqlite3.node');
if (existsSync(nodeBinary)) {
  mkdirSync(join(bsqOut, 'build', 'Release'), { recursive: true });
  copyFileSync(nodeBinary, join(bsqOut, 'build', 'Release', 'better_sqlite3.node'));
  cpSync(join(bsq, 'lib'), join(bsqOut, 'lib'), { recursive: true });
  copyFileSync(join(bsq, 'package.json'), join(bsqOut, 'package.json'));
  console.log(`bundled better-sqlite3 native binary for ${process.platform}-${process.arch}`);
} else {
  console.log(`better-sqlite3 has no prebuilt binary at ${nodeBinary}: shipping without it (degrades, see README.md)`);
}

console.log(`built plugins/claude-code/dist from ${repoRoot}`);
