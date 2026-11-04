// Builds the PUBLIC copy of Mole from an allowlist, with fresh history, and refuses to continue if a private string slipped in.
//   node scripts/export-public.mjs <output dir>
// The private repo (AGENTS.md, tasks/, study/, context/, agent-cost benchmark harness) is never published; only what is listed here.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(process.argv[2] ?? '');
if (!process.argv[2]) throw new Error('usage: node scripts/export-public.mjs <output dir>');

const include = ['apps', 'packages', 'plugins', 'release/mole-code', 'docs', 'site', '.claude-plugin', 'LICENSE', 'package.json', 'package-lock.json', 'tsconfig.base.json', 'tsconfig.json', 'vitest.config.ts', 'scripts/bundle-daemon.mjs', 'scripts/mcp-entry.ts', 'deploy', 'server.json', 'RELEASE-NOTES-0.5.0.md',
  // T93-public-eval-kit: the Inspect AI A/B kit (mole_ab) ships too, now that it has a public-usable
  // agent option (claude_code/codex via inspect-swe, no hermes subscription needed -- see
  // evals/inspect/dcbench_eval/external_agent.py) and no private paths in its own source (reanalyze.py's
  // historical absolute path is now an env var with a relative default). experiments/ (T63's frozen
  // protocol data, which cites private task history and unshipped results files) and the tests that only
  // make sense against that private data are excluded below, not here.
  'evals/inspect/dcbench_eval',
  // T91-distribution-channels: more discovery channels, same "read-only reference, publish separately" shape
  // as everything else in this list -- action.yml/smithery.yaml/glama.json/.pre-commit-hooks.yaml/
  // gemini-extension.json all need to sit at the EXPORTED repo's root for their own ecosystem's crawler/
  // publish flow to find them (GitHub Marketplace, Gemini CLI's gallery, Smithery, pre-commit.com's own
  // convention -- see tasks/T91-distribution-channels/4 log/prior-art.md for each, dated). `distribution/`
  // holds drafts (Docker MCP catalog entry, Homebrew tap formula) that still need a real release artifact
  // before they're submittable -- see tasks/T91-distribution-channels/channels.md's needs-Raymond checklist.
  'action.yml', 'smithery.yaml', 'glama.json', '.pre-commit-hooks.yaml', 'gemini-extension.json', 'distribution'];
// private tooling that references the author's machine, chats or unpublished studies
const exclude = [/(^|\/)node_modules(\/|$)/, /(^|\/)dist(\/|$)/, /(^|\/)dist-tsc(\/|$)/, /(^|\/)\.stage(\/|$)/, /\.vsix$/, /\.tgz$/, /\.tsbuildinfo$/, /^\.DS_Store$/, /\.DS_Store$/,
  // T87: every package's bench/ (dev-only perf/accuracy harnesses, fixture keys that embed real paths and
  // private ledger task slugs) and test/ (fixtures with the same shape -- e.g. `raymond`, `/Users/<name>`,
  // ledger task directory names like "T74-steering-dials") are internal evaluation artifacts, not runtime
  // files the published mole-code package or this repo's README/docs need -- same reasoning the plugin's own
  // bench/test exclusion below already used (T86). Neither is in release/mole-code's own `files` allowlist.
  /(^|\/)bench(\/|$)/, /(^|\/)test(\/|$)/,
  // T87: these two packages are built around the author's own private build process, not an end-user-facing
  // Mole feature -- agentstate reads the author's own ~/.hermes/state.db, ~/.claude and ~/.codex session
  // directories to attribute the author's own agent runs; coverage's commit attribution depends on the
  // literal commit-message shape the private ledger tool writes ("ledger move: ..."). Neither is documented
  // as a public feature (see the public README); packages/daemon's CLI still imports @mole/agentstate for a
  // few internal subcommands at runtime, resolved from the published npm package's bundled dist, not this
  // source mirror -- the public git repo is a source browse of the product, not a buildable monorepo clone.
  /^packages\/agentstate(\/|$)/, /^packages\/coverage(\/|$)/,
  // dev-only scripts/fixtures with a hardcoded machine path or scratch-dir example, not needed to use Mole
  /^packages\/reasoning\/scripts\/oracle-check\.mjs$/, /^packages\/decisions\/fixtures\/argdown\/how-generated\.md$/,
  // release/mole-code/.gitignore: these are build outputs of its own `npm run build` (bundle.mjs copies them
  // from plugins/claude-code + the repo root) -- already published via the `plugins` and `LICENSE` entries
  // above; excluding them here keeps this export correct whether or not that local build has been run.
  /^release\/mole-code\/(dist|\.claude-plugin|hooks|scripts)(\/|$)/, /^release\/mole-code\/\.mcp\.json$/, /^release\/mole-code\/LICENSE$/,
  // T86: the plugin's own benchmark key material and its test fixtures embed internal ledger task-directory names
  // (e.g. "T74-steering-dials") as literal strings, the same private-history shape the forbidden scan below is
  // meant to catch -- ship the plugin's runtime files (plugin.json, .mcp.json, hooks/, scripts/, README.md) only.
  /^plugins\/claude-code\/bench(\/|$)/, /^docs\/launch-drafts(\/|$)/, /(^|\/)__pycache__(\/|$)/,
  /^evals\/inspect\/dcbench_eval\/(experiments|logs)(\/|$)/,
  // T93-public-eval-kit: these three tests only make sense against private data that is never shipped --
  // test_reanalyze.py and test_protocol_v3.py assert against T63's own measured numbers / protocol-v3.json
  // (both excluded above, under experiments/ or kept only in the private task history), and
  // test_reanalyze_inspect_log.py reads a proof artifact that lives under the private tasks/ ledger.
  // (a public user still gets reanalyze.py itself, generic unit coverage via its other callers, and every
  // other test in the suite -- 43 of 46 cases, see the T93 task's 4 log/ for the exact count.)
  /^evals\/inspect\/dcbench_eval\/tests\/test_reanalyze\.py$/,
  /^evals\/inspect\/dcbench_eval\/tests\/test_protocol_v3\.py$/,
  /^evals\/inspect\/dcbench_eval\/tests\/test_reanalyze_inspect_log\.py$/,
  /^plugins\/claude-code\/test(\/|$)/];
const forbidden = [/\/Users\/[a-z0-9_-]+/i, /\.hermes(?!\w)/i, /raymond/i, /CS Code/, /docs-over-chat/i, /ledger/i, /\bT\d{1,2}-[a-z0-9-]+/, /AGENTS\.md/, /BEGIN [A-Z ]*PRIVATE KEY/, /(ghp|gho|ghs|pat|sk)[-_][A-Za-z0-9]{20,}/, /\btasks\//, /(^|[^a-zA-Z])context\//, /chat log/i, /chat transcript/i];
// exceptions that are intended: the copyright holder's name in LICENSE, the source link in package manifests, and
// the plugin/marketplace author field (the point of a public plugin listing is crediting a real person, same as LICENSE)
const allowed = {
  'LICENSE': [/raymond/i],
  'release/mole-code/LICENSE': [/raymond/i],
  'plugins/claude-code/.claude-plugin/plugin.json': [/raymond/i],
  'release/mole-code/.claude-plugin/plugin.json': [/raymond/i],
  '.claude-plugin/marketplace.json': [/raymond/i],
  // T91-distribution-channels: the Marketplace action's `author:` field, same crediting rationale as above.
  'action.yml': [/raymond/i],
  // the README tells USERS to edit their own AGENTS.md (a public, cross-agent convention), not ours
  'README.md': [/AGENTS\.md/],
};

rmSync(out, { recursive: true, force: true });
const copied = [];
function walk(rel) {
  const src = join(root, rel);
  if (exclude.some((re) => re.test(rel))) return;
  const st = statSync(src);
  if (st.isDirectory()) return readdirSync(src).forEach((n) => walk(join(rel, n)));
  mkdirSync(dirname(join(out, rel)), { recursive: true });
  if (/\.(?:ts|mjs|cjs|json|md|py)$/.test(rel) && !/package(-lock)?\.json$/.test(rel)) {
    // provenance comments that point into the private task ledger: `// [source: tasks/Tn-...; added: ...]`
    // T87: a bare ledger task-slug citation in a doc comment (e.g. "prior art: tasks/T59-lesson-revises-tenet/4
    // log/prior-art.md", "(T47-tenant-scoped via RLS FORCE)") -- never code logic, always prose provenance --
    // is redacted the same way; this is a comment-only transform, never touches a string literal a test or
    // runtime value depends on (those live under bench/ or test/, already excluded above). Likewise a bare
    // "AGENTS.md" or "ledger" mention in a doc comment (both appear in otherwise-public packages' rationale
    // comments, e.g. decisions/hotspots citing "one source of truth, AGENTS.md" or "same rule as the ledger")
    // is redacted to neutral prose -- Mole's own "outcome ledger" feature name is affected the same way
    // (becomes "outcome tracking log" below), which is an acceptable wording cost for a scan with zero misses.
    let text = readFileSync(src, 'utf8')
      .replace(/[ \t]*\/\/ \[source: [^\]]*\]/g, '')
      .replace(/\btasks\/T\d{1,2}-[A-Za-z0-9-]+(?:\/[^\s)"'`]*)?/g, '(internal reference removed)')
      .replace(/\bT\d{1,2}-[A-Za-z0-9][A-Za-z0-9-]*\b/g, '(internal task reference removed)')
      .replace(/(^|[^a-zA-Z])context\/[^\s)"'`]*/g, '$1(internal reference removed)')
      .replace(/\btasks\/[^\s)"'`]*/g, '(internal reference removed)')
      .replace(/\bAGENTS\.md\b/g, "the project's shared instructions file")
      .replace(/\bledger\b/gi, 'tracking log')
      .replace(/\.hermes(?!\w)/g, '.agent-cache');
    if (!(allowed[rel] ?? []).some((a) => a.source === /raymond/i.source)) text = text.replace(/\bRaymond(?:'s)?\b/g, 'the team');
    writeFileSync(join(out, rel), text);
  } else cpSync(src, join(out, rel));
  copied.push(rel);
}
for (const p of include) if (existsSync(join(root, p))) walk(p);
cpSync(join(root, 'scripts/public-README.md'), join(out, 'README.md'));
cpSync(join(root, 'scripts/public-gitignore'), join(out, '.gitignore'));
// public CI + Pages + container workflows (the private repo's own workflows read private benches; never exported)
cpSync(join(root, 'scripts/public-github'), join(out, '.github'), { recursive: true });
copied.push('README.md', '.gitignore');

// T87 review 2 (HIGH): the product source (packages/mcp, packages/steer, packages/daemon) imports
// @mole/agentstate and @mole/coverage literally, exactly as on main -- review 1's non-literal/dynamic-import
// trick in the SOURCE was rejected because it also defeats esbuild: a non-literal `import()` can't be
// statically bundled either, so every bundle (the npm tarball's dist/cli.js + dist/mcp.cjs, the .vsix's
// dist/daemon.cjs) silently lost `mole runs/agents/claims`, `mole steer query` and the 5 MCP tools built on
// these two packages, in EVERY build, not just the public export. Fixed structurally: the product source
// (packages/mcp/src/server.ts, collisions-tool.ts, packages/steer/src/index.ts, packages/daemon/src/cli.ts)
// is back to plain literal imports; this export-time step is the ONLY place the swap happens, and only for
// the four import sites that reach the two excluded packages, in the exported copy only.
//
// packages/agentstate and packages/coverage are excluded above (author-machine workflow -- see that
// comment), but daemon/steer/mcp's tsconfig.json + package.json still reference them (TS project references +
// npm workspace deps) for the private repo's build; dropTsconfigRefs/dropPackageDeps below still rewrite
// those dangling references (same as review 1) -- without it `npx tsc -b` on the export fails with
// TS5083/TS6053. On top of that, the four files above import the real packages by name; writeOssStub +
// rewriteImportSite below generate a small local stub module (same shape as the real package's exports, each
// function throwing "not part of the open-source Mole build") and repoint exactly those import specifiers at
// it with a plain string replacement -- a literal import of a real (if stub) file, so tsc resolves it with no
// special-casing, and esbuild bundles it in like any other local module (no "optional import" either).
function dropTsconfigRefs(tsconfigRel, dropPaths) {
  const p = join(out, tsconfigRel);
  if (!existsSync(p)) return;
  const j = JSON.parse(readFileSync(p, 'utf8'));
  if (Array.isArray(j.references)) j.references = j.references.filter((r) => !dropPaths.includes(r.path));
  writeFileSync(p, JSON.stringify(j, null, 2) + '\n');
}
function dropPackageDeps(pkgRel, names) {
  const p = join(out, pkgRel);
  if (!existsSync(p)) return;
  const j = JSON.parse(readFileSync(p, 'utf8'));
  if (j.dependencies) for (const n of names) delete j.dependencies[n];
  writeFileSync(p, JSON.stringify(j, null, 2) + '\n');
}
// packages/bench is a private: true, dev-only test-selection benchmark harness (packages/bench/package.json),
// not a runtime dependency of anything else (no other package imports @mole/bench) -- same bench/test-dir
// exclusion reasoning as the top of this file, just at the whole-package level since this package's name IS
// "bench"; its root tsconfig reference is excluded here for the same TS5083 reason as agentstate/coverage.
dropTsconfigRefs('tsconfig.json', ['packages/agentstate', 'packages/coverage', 'packages/bench']);
dropTsconfigRefs('packages/daemon/tsconfig.json', ['../agentstate', '../coverage']);
dropTsconfigRefs('packages/mcp/tsconfig.json', ['../agentstate', '../coverage']);
dropTsconfigRefs('packages/steer/tsconfig.json', ['../agentstate']);
dropPackageDeps('packages/daemon/package.json', ['@mole/agentstate', '@mole/coverage']);
dropPackageDeps('packages/steer/package.json', ['@mole/agentstate']);
dropPackageDeps('packages/mcp/package.json', ['@mole/agentstate', '@mole/coverage']);

/** Writes `<out>/<relPath>`: one throwing stub per entry in `fns` ({name, sig}: `sig` is the exact TS function
 * type the real call sites need -- e.g. `scanCoverage`'s callers `.filter`/property-access its result, so its
 * stub needs the real structural return type, not `any`, or tsc's noImplicitAny flags the callback params),
 * plus one `export interface <name> { ... }` per entry in `types` (verbatim shape, for a `type`-only
 * re-export or for a `sig` below to reference). */
function writeOssStub(relPath, { pkg, fns, types = [] }) {
  const p = join(out, relPath);
  mkdirSync(dirname(p), { recursive: true });
  const body = [
    `// Generated by scripts/export-public.mjs at export time (not part of the private repo's own source --`,
    `// see that script's "T87 review 2 (HIGH)" comment). ${pkg} is not included in this open-source export`,
    `// (it is built around the author's own private machine/workflow state); every call below throws a clear`,
    `// error instead of the real feature silently going missing or crashing with an unrelated message. Each`,
    `// export keeps the real function's call shape (loose where callers never inspect the result, the real`,
    `// structural shape where they do -- a plain \`any\` return made tsc's noImplicitAny flag every caller that`,
    `// destructures/filters/maps the result) so this type-checks exactly like the real package would.`,
    `function unavailable(name: string): (...args: any[]) => any {`,
    `  return (..._args: any[]): any => {`,
    `    throw new Error(\`${pkg} is not part of the open-source Mole build (called \${name})\`);`,
    `  };`,
    `}`,
    ...types.map((t) => t.src),
    ...fns.map(({ name, sig }) => `export const ${name}: ${sig} = unavailable(${JSON.stringify(name)}) as ${sig};`),
    '',
  ].join('\n');
  writeFileSync(p, body);
}
/** Finds `exact` (a whole import/dynamic-import line, copied verbatim from the committed source) in
 * `<out>/<relPath>` and replaces it with `replacement`. Throws loudly instead of silently no-op'ing if the
 * source line it expects is gone (e.g. the real file was edited and this rewrite table fell out of sync). */
function rewriteImportSite(relPath, exact, replacement) {
  const p = join(out, relPath);
  const text = readFileSync(p, 'utf8');
  if (!text.includes(exact)) throw new Error(`export-public.mjs: expected import site not found in ${relPath}:\n  ${exact}`);
  writeFileSync(p, text.replace(exact, replacement));
}

const AGENTSTATE_SNAPSHOT_TYPE = {
  src: [
    'export interface AgentStateSnapshot {',
    '  session: string;',
    '  found: boolean;',
    '  harness?: string;',
    '  cwd?: string | null;',
    '  start?: string;',
    '  end?: string | null;',
    '  steps?: number;',
    '  intent?: string | null;',
    '  filesInPlay?: string[];',
    '  decisionsInPlay?: Array<{ id: string; title: string }>;',
    '  lastStep?: { time: string; operation: string; kind: string; tool: string | null; command: string | null } | null;',
    '}',
  ].join('\n'),
};
// Structural mirror of @mole/coverage's own CoverageScanResult/CoverageFileEntry (packages/coverage/src/index.ts):
// mole_coverage's handler (packages/mcp/src/server.ts) filters/property-accesses scanCoverage()'s result
// (scan.notice, scan.files, f.agents[].session, f.weak.is) and spreads it (`...scan`) -- a bare `any` return
// made every one of those callback parameters an implicit-any tsc error, so this stub keeps the real shape.
const COVERAGE_RESULT_TYPES = {
  src: [
    'export interface CoverageFileEntry {',
    '  file: string;',
    '  agents: Array<{ session: string }>;',
    '  weak: { is: boolean };',
    '  [k: string]: unknown;',
    '}',
    'export interface CoverageScanResult {',
    '  notice?: string | null;',
    '  files: CoverageFileEntry[];',
    '  [k: string]: unknown;',
    '}',
  ].join('\n'),
};

writeOssStub('packages/mcp/src/_oss-agentstate-stub.ts', {
  pkg: '@mole/agentstate',
  fns: [
    { name: 'agentIntentsFor', sig: '(root: string, target: string) => Record<string, unknown>' },
    { name: 'claims', sig: '(run: string, opts: Record<string, unknown>) => Record<string, unknown>' },
    { name: 'defaultSources', sig: '(env?: NodeJS.ProcessEnv) => Record<string, unknown>' },
    { name: 'tried', sig: '(target: string, opts: Record<string, unknown>) => Record<string, unknown>' },
    { name: 'collisions', sig: '(opts: Record<string, unknown>) => Record<string, unknown>' },
  ],
});
writeOssStub('packages/mcp/src/_oss-coverage-stub.ts', {
  pkg: '@mole/coverage',
  types: [COVERAGE_RESULT_TYPES],
  fns: [
    { name: 'coverage', sig: '(root: string, file: string) => Promise<Record<string, unknown>>' },
    { name: 'scanCoverage', sig: '(root: string) => CoverageScanResult' },
  ],
});
writeOssStub('packages/daemon/src/_oss-agentstate-stub.ts', {
  pkg: '@mole/agentstate',
  fns: [
    { name: 'agentCli', sig: "(cmd: string, pos: string[], flags: Record<string, string | true>, root: string) => Promise<number>" },
    { name: 'claimsCli', sig: '(pos: string[], flags: Record<string, string | true>) => Promise<number>' },
  ],
});
writeOssStub('packages/daemon/src/_oss-coverage-stub.ts', {
  pkg: '@mole/coverage',
  fns: [{ name: 'coverageCli', sig: '(pos: string[], flags: Record<string, string | true>, root: string) => Promise<number>' }],
});
writeOssStub('packages/steer/src/_oss-agentstate-stub.ts', {
  pkg: '@mole/agentstate',
  types: [AGENTSTATE_SNAPSHOT_TYPE],
  fns: [{ name: 'queryAgentState', sig: '(root: string, session: string) => Promise<AgentStateSnapshot>' }],
});

rewriteImportSite('packages/mcp/src/server.ts', "import { agentIntentsFor, claims, defaultSources, tried } from '@mole/agentstate';", "import { agentIntentsFor, claims, defaultSources, tried } from './_oss-agentstate-stub.js';");
rewriteImportSite('packages/mcp/src/server.ts', "const { coverage, scanCoverage } = await import('@mole/coverage');", "const { coverage, scanCoverage } = await import('./_oss-coverage-stub.js');");
rewriteImportSite('packages/mcp/src/collisions-tool.ts', "import { collisions, defaultSources } from '@mole/agentstate';", "import { collisions, defaultSources } from './_oss-agentstate-stub.js';");
rewriteImportSite(
  'packages/daemon/src/cli.ts',
  "if (cmd === 'claims') return (await import('@mole/agentstate/dist/src/claims/cli.js')).claimsCli(pos, flags); // claim check (T24): light entry, no daemon",
  "if (cmd === 'claims') return (await import('./_oss-agentstate-stub.js')).claimsCli(pos, flags); // claim check (T24): light entry, no daemon",
);
rewriteImportSite(
  'packages/daemon/src/cli.ts',
  "if (['runs', 'run', 'tried', 'agents', 'agent-intent', 'collisions'].includes(cmd)) return (await import('@mole/agentstate')).agentCli(cmd, pos, flags, root); // agent states (T18) + collisions (T21) + external agent-session intent (T39), no daemon needed",
  "if (['runs', 'run', 'tried', 'agents', 'agent-intent', 'collisions'].includes(cmd)) return (await import('./_oss-agentstate-stub.js')).agentCli(cmd, pos, flags, root); // agent states (T18) + collisions (T21) + external agent-session intent (T39), no daemon needed",
);
rewriteImportSite(
  'packages/daemon/src/cli.ts',
  "if (cmd === 'coverage') return (await import('@mole/coverage/dist/src/cli.js')).coverageCli(pos, flags, root); // which agents cover which files, weak spots (T35)",
  "if (cmd === 'coverage') return (await import('./_oss-coverage-stub.js')).coverageCli(pos, flags, root); // which agents cover which files, weak spots (T35)",
);
rewriteImportSite(
  'packages/steer/src/index.ts',
  "export { queryAgentState, type AgentStateSnapshot } from '@mole/agentstate';",
  "export { queryAgentState, type AgentStateSnapshot } from './_oss-agentstate-stub.js';",
);

const hits = [];
for (const rel of copied) {
  if (/\.(png|ico|jpg|vsix)$/i.test(rel)) continue;
  const text = readFileSync(join(out, rel), 'utf8');
  for (const re of forbidden) if (re.test(text) && !(allowed[rel] ?? []).some((a) => a.source === re.source)) hits.push(`${rel}: ${re}`);
}
console.log(`copied ${copied.length} files to ${out}`);
if (hits.length) {
  console.error('PRIVATE-STRING SCAN FAILED:\n' + hits.join('\n'));
  process.exit(1);
}
console.log('private-string scan: clean');
