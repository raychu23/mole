// M0 engine benchmark. Usage: node bench/run.mjs  (after `npm run build` and `npm install` in bench/)
// Env: FIXTURE (default ~/.hermes/hermes-agent/ui-tui, read-only), BENCH_COPY (scratch copy for CodeGraph + incremental edits),
//      OUT (report path), SAMPLE_PER_STRATUM (default 50)
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { edgeKey, lineKey, listSources, mulberry32, median, relTo, score, shuffle } from './common.mjs';
import { buildTruth } from './truth.mjs';
import { runTs } from './engine-ts.mjs';
import { extract, indexTreeSitter, resolveCalls, runTreeSitter, loadParsers } from './engine-treesitter.mjs';
import { runScipCli, scipCallEdges } from './engine-scip.mjs';
import { cgEdges, cgInit, cgSync } from './engine-codegraph.mjs';
import { Parser } from 'web-tree-sitter';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const FIX = process.env.FIXTURE ?? join(homedir(), '.hermes/hermes-agent/ui-tui');
const COPY = process.env.BENCH_COPY ?? join(process.env.TMPDIR ?? tmpdir(), 'm0-bench-copy');
const SCRATCH = join(process.env.TMPDIR ?? tmpdir(), 'm0-bench-out');
const OUT = process.env.OUT ?? resolve(here, '../../../generated data/m0-engine-report.json');
const PER = Number(process.env.SAMPLE_PER_STRATUM ?? 50);
const TSCONFIG = 'tsconfig.build.json';
mkdirSync(SCRATCH, { recursive: true });
mkdirSync(dirname(OUT), { recursive: true });
const log = (...a) => console.error('[m0]', ...a);
const r1 = (x) => Math.round(x);
const nm = (...p) => join(here, 'node_modules', ...p);

// ---- fixture + copy ----------------------------------------------------------------------------------
const files = listSources(join(FIX, 'src'));
const fixHead = execFileSync('git', ['-C', FIX, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
rmSync(COPY, { recursive: true, force: true });
mkdirSync(COPY, { recursive: true });
cpSync(join(FIX, 'src'), join(COPY, 'src'), { recursive: true });
for (const f of ['tsconfig.json', 'tsconfig.build.json', 'package.json']) cpSync(join(FIX, f), join(COPY, f));
log('fixture', FIX, files.length, 'files @', fixHead.slice(0, 9));

// ---- truth + sample ----------------------------------------------------------------------------------
log('building language-service truth');
const sites = buildTruth(FIX, TSCONFIG, files);
const byStratum = {};
for (const s of sites) (byStratum[s.stratum] ??= []).push(s);
const rnd = mulberry32(20261019);
let sample = [];
const rest = [];
for (const [k, arr] of Object.entries(byStratum)) {
  const sh = shuffle(arr, rnd);
  sample.push(...sh.slice(0, PER));
  rest.push(...sh.slice(PER));
}
if (sample.length < 200) sample.push(...shuffle(rest, rnd).slice(0, 200 - sample.length));
const truthByLine = new Map();
for (const s of sites) { const k = lineKey(s); const set = truthByLine.get(k) ?? new Set(); for (const t of s.targets) set.add(`${s.file}:${s.line}:${t.tfile}:${t.tleaf}`); truthByLine.set(k, set); }
log('truth sites', sites.length, Object.fromEntries(Object.entries(byStratum).map(([k, v]) => [k, v.length])), 'sample', sample.length);

// ---- engines: accuracy ------------------------------------------------------------------------------
const results = {};
log('engine A: TS compiler API');
const A = runTs(FIX, TSCONFIG, 'src');
results.typescriptCompilerApi = { stats: A.stats, ...score(A.edges, sample, truthByLine) };

log('engine B: tree-sitter');
const cfgPaths = JSON.parse(readFileSync(join(FIX, TSCONFIG), 'utf8')).compilerOptions.paths ?? {};
const B = await runTreeSitter(FIX, join(FIX, TSCONFIG), join(FIX, 'src'));
results.treeSitter = { ...score(B.edges.map((e) => e), sample, truthByLine) };

log('engine C: scip-typescript');
// SCIP indexes one tsconfig project. The fixture's tsconfig excludes src/__tests__ and keeps the `@hermes/ink`
// alias only in tsconfig.build.json, so index a scratch copy whose tsconfig.json = base options + alias + all 362 files.
{
  const base = JSON.parse(readFileSync(join(FIX, 'tsconfig.json'), 'utf8'));
  const build = JSON.parse(readFileSync(join(FIX, 'tsconfig.build.json'), 'utf8'));
  writeFileSync(join(COPY, 'tsconfig.json'), JSON.stringify({ compilerOptions: { ...base.compilerOptions, ...build.compilerOptions }, include: ['src/**/*.d.ts', 'src/**/*.ts', 'src/**/*.tsx'], exclude: ['node_modules', 'dist'] }, null, 2));
}
const scipFile = join(SCRATCH, 'ui-tui.scip');
runScipCli(COPY, scipFile);
const C = await scipCallEdges(FIX, scipFile, files);
log('scip docs indexed', C.length, 'call edges');
results.scipTypescript = score(C, sample, truthByLine);

log('engine D: CodeGraph (benchmark only)');
cgInit(COPY);
const D = cgEdges(COPY);
results.codegraph = score(D, sample, truthByLine);

// ---- timing: full index (3 runs, median) -----------------------------------------------------------
log('timing full index');
const full = { typescriptCompilerApi: [], treeSitter: [], scipTypescript: [], codegraph: [] };
for (let i = 0; i < 3; i++) {
  full.typescriptCompilerApi.push(r1(runTs(FIX, TSCONFIG, 'src').ms));
  full.treeSitter.push(r1((await runTreeSitter(FIX, join(FIX, TSCONFIG), join(FIX, 'src'))).ms));
  full.scipTypescript.push(r1(runScipCli(COPY, scipFile)));
  full.codegraph.push(r1(cgInit(COPY)));
}

// ---- timing: 1-file incremental update ------------------------------------------------------------
log('timing 1-file incremental');
const probe = 'src/gatewayClient.ts';
const probeAbs = join(COPY, probe);
const original = readFileSync(probeAbs, 'utf8');
const inc = { typescriptCompilerApi: [], treeSitter: [], codegraph: [] };
const edit = (i) => writeFileSync(probeAbs, `${original}\nexport function __moleProbe${i}() {\n  return ${i};\n}\n`);
{
  const ix = runTs(COPY, TSCONFIG, 'src').ix;
  for (let i = 0; i < 5; i++) { edit(i); const t0 = performance.now(); ix.updateFile(probe); inc.typescriptCompilerApi.push(r1(performance.now() - t0)); }
  ix.close();
}
{
  const copyFiles = listSources(join(COPY, 'src'));
  const base = await indexTreeSitter(COPY, copyFiles, cfgPaths);
  const { ts, tsx } = await loadParsers();
  const parser = new Parser();
  for (let i = 0; i < 5; i++) {
    edit(i);
    const t0 = performance.now();
    parser.setLanguage(probe.endsWith('x') ? tsx : ts);
    const tree = parser.parse(readFileSync(probeAbs, 'utf8'));
    const fresh = extract(tree, probe);
    tree.delete();
    resolveCalls(base.parsed.map((p) => (p.path === probe ? fresh : p)), base.resolveSpec);
    inc.treeSitter.push(r1(performance.now() - t0));
  }
}
for (let i = 0; i < 5; i++) { edit(i); inc.codegraph.push(r1(cgSync(COPY))); }
writeFileSync(probeAbs, original);

// ---- install size -------------------------------------------------------------------------------------
log('install sizes');
function installSize(label, pkgs) {
  const d = join(SCRATCH, `inst-${label}`);
  rmSync(d, { recursive: true, force: true });
  mkdirSync(d, { recursive: true });
  writeFileSync(join(d, 'package.json'), '{"name":"x","version":"0.0.0","private":true}');
  execFileSync('npm', ['install', '--no-audit', '--no-fund', '--silent', ...pkgs], { cwd: d, stdio: 'ignore' });
  const kb = Number(execFileSync('du', ['-sk', join(d, 'node_modules')], { encoding: 'utf8' }).split(/\s/)[0]);
  return { packages: pkgs, installMB: +(kb / 1024).toFixed(1) };
}
const install = {
  typescriptCompilerApi: installSize('ts', ['typescript@5.9.3']),
  treeSitter: installSize('ts-sitter', ['web-tree-sitter@0.27.1', 'tree-sitter-typescript@0.23.2']),
  scipTypescript: installSize('scip', ['@sourcegraph/scip-typescript@0.4.0']),
  codegraph: installSize('cg', ['@colbymchenry/codegraph@1.6.2']),
};
const wasmKb = (p) => statSync(nm(p)).size / 1024;
install.treeSitter.wasmOnlyMB = +(((wasmKb('tree-sitter-typescript/tree-sitter-typescript.wasm') + wasmKb('tree-sitter-typescript/tree-sitter-tsx.wasm') + wasmKb('web-tree-sitter/web-tree-sitter.wasm')) / 1024)).toFixed(2);

// ---- report -------------------------------------------------------------------------------------------
const pkgJson = (p) => JSON.parse(readFileSync(nm(p, 'package.json'), 'utf8'));
const engines = (p) => { const j = pkgJson(p); return { version: j.version, license: j.license, nodeEngines: j.engines?.node ?? 'unspecified' }; };
const report = {
  generatedAt: new Date().toISOString(),
  fixture: { path: FIX, tsFiles: files.length, commit: fixHead, tsconfig: TSCONFIG, note: 'read-only; CodeGraph and edit probes ran on a scratch copy' },
  machine: { node: process.version, platform: `${process.platform}-${process.arch}` },
  groundTruth: 'TypeScript language service getDefinitionAtPosition at every call/new callee in all fixture files; only definitions that are in-project tracked declarations (top-level function/class/method/interface member/fn-typed property/variable) count',
  sampling: { seed: 20261019, perStratum: PER, sampledCallSites: sample.length, truthCallSites: sites.length, strata: Object.fromEntries(Object.entries(byStratum).map(([k, v]) => [k, { inFixture: v.length, sampled: sample.filter((s) => s.stratum === k).length }])), strataDefinition: { alias: 'callee bound by a non-relative import resolved through tsconfig paths', barrel: 'callee bound by an import whose module is not the defining file (>=1 re-export hop)', dynamic: 'element access, optional call, or call through an interface/type member', method: 'property-access callee (this.x(), obj.x(), new ns.X)', static: 'direct local or relative-import call' } },
  engines: {
    typescriptCompilerApi: { ...{ ...JSON.parse(readFileSync(join(here, '../../../node_modules/typescript/package.json'), 'utf8')) && (({ version, license, engines }) => ({ version, license, nodeEngines: engines?.node ?? 'unspecified' }))(JSON.parse(readFileSync(join(here, '../../../node_modules/typescript/package.json'), 'utf8'))) }, role: 'type-checker resolution; our packages/indexer', ...results.typescriptCompilerApi, fullIndexMs: { runs: full.typescriptCompilerApi, median: median(full.typescriptCompilerApi) }, incrementalUpdateMs: { runs: inc.typescriptCompilerApi, median: median(inc.typescriptCompilerApi) }, install: install.typescriptCompilerApi },
    treeSitter: { ...engines('web-tree-sitter'), grammar: pkgJson('tree-sitter-typescript').version, role: 'syntax only + our name/import/re-export resolver (unique method name, no types)', ...results.treeSitter, fullIndexMs: { runs: full.treeSitter, median: median(full.treeSitter) }, incrementalUpdateMs: { runs: inc.treeSitter, median: median(inc.treeSitter), note: 'reparse + re-extract one file + re-resolve all calls' }, install: install.treeSitter },
    scipTypescript: { ...engines('@sourcegraph/scip-typescript'), role: 'type-checker symbols via SCIP; call edges = SCIP references at call-expression callees found by tree-sitter', ...results.scipTypescript, fullIndexMs: { runs: full.scipTypescript, median: median(full.scipTypescript) }, incrementalUpdateMs: { median: median(full.scipTypescript), note: 'no incremental mode: the whole project is re-indexed' }, install: install.scipTypescript },
    codegraph: { ...engines('@colbymchenry/codegraph'), role: 'BENCHMARK ONLY (bundled runtime, own schema); not a Mole dependency', ...results.codegraph, fullIndexMs: { runs: full.codegraph, median: median(full.codegraph), note: 'CLI wall time incl. process start' }, incrementalUpdateMs: { runs: inc.codegraph, median: median(inc.codegraph), note: 'CLI `sync` wall time incl. process start' }, install: install.codegraph },
  },
  caveats: [
    'Ground truth is the TS language service, so the Compiler API engine (same checker) is partly circular; SCIP also uses the TS checker. Tree-sitter and CodeGraph are the independent measurements.',
    'Strata are decided from the call-site syntax and the language-service definition, so a few barrel/alias sites could fall into a neighbouring stratum.',
    'Matching key is call line + target file + target leaf name; two calls to the same name on one line count once.',
    'Only 15 barrel call sites exist in the fixture (all sampled); alias sites are ~all calls into the ambient `declare module \'@hermes/ink\'` in src/types/hermes-ink.d.ts. Both strata are small/narrow, so per-stratum recall there is weak evidence.',
    'recallStatic = every stratum except dynamic (alias + barrel + method + static); this is the figure the task stop row (<0.9) refers to.',
    'The tree-sitter engine is our own resolver (imports, re-exports, tsconfig paths, ambient modules, unique-method-name), not an off-the-shelf tool; a smarter resolver would score higher but would be reimplementing the type checker.',
    'Times are wall-clock on one Apple-silicon Mac, node ' + process.version + ', not a controlled benchmark.',
  ],
  sample: sample.map((s) => ({ file: s.file, line: s.line, callee: s.callee, stratum: s.stratum, target: s.targets[0] })),
};
const E = report.engines;
const pct = (x) => `${Math.round(x * 100)}%`;
report.nodeRuntime = {
  indexerNeeds: 'Node >=22.5 for node:sqlite (flag-free from 22.13); typescript itself needs Node >=14.17',
  vscodeExtensionHost: 'Node 22.15.1 since VS Code 1.101 (May 2025, Electron 35); Node 20 before that. Source: https://code.visualstudio.com/updates/v1_101',
  consequence: 'In-process node:sqlite works in VS Code >=1.101. Older VS Code or forks still on Electron <35 need a fallback driver, or run the indexer in the planned M1 daemon (own Node) instead of the extension host. Forks (Cursor, Windsurf) not checked.',
  candidates: { typescriptCompilerApi: E.typescriptCompilerApi.nodeEngines, treeSitter: `web-tree-sitter: ${E.treeSitter.nodeEngines}; WASM, runs in any Node or a browser`, scipTypescript: `${E.scipTypescript.nodeEngines} (CLI spawns its own process; no Node floor declared)`, codegraph: `${E.codegraph.nodeEngines} (bundles its own runtime)` },
};
report.recommendation = {
  decision: 'P2 stays PROPOSED until Raymond accepts',
  engine: 'TypeScript Compiler API (packages/indexer) + SQLite via node:sqlite. Built, tested, 362 files indexed.',
  why: [
    `Best accuracy: precision ${E.typescriptCompilerApi.precision}, recall ${E.typescriptCompilerApi.recallAll} on ${report.sampling.sampledCallSites} sampled call sites incl. dynamic ${pct(E.typescriptCompilerApi.recallByStratum.dynamic.recall)}. Circular by construction (ground truth is also TypeScript), so the independent evidence is SCIP ${E.scipTypescript.recallStatic} static recall and the tree-sitter/CodeGraph gaps.`,
    `Fast enough: full index ${E.typescriptCompilerApi.fullIndexMs.median} ms (limit 5 min); 1-file update ${E.typescriptCompilerApi.incrementalUpdateMs.median} ms vs ${E.scipTypescript.incrementalUpdateMs.median} ms for SCIP (no incremental mode) and ${E.codegraph.incrementalUpdateMs.median} ms for CodeGraph.`,
    `Small + licensed: ${E.typescriptCompilerApi.install.installMB} MB, Apache-2.0, no native code.`,
    'It is what tsc and VS Code use, which matches the USER criterion (popular, industry-standard, job-relevant).',
  ],
  scip: `Not in v1 core: ${pct(E.scipTypescript.recallAll)} recall / ${E.scipTypescript.precision} precision is close, but it has no incremental mode and no call concept (needs a parser to find call sites). Keep as a CI/M6 import and the route to other languages (other SCIP indexers).`,
  treeSitter: `Not for call edges: static recall ${E.treeSitter.recallStatic}, dynamic 0. Keep for fast structure/outline and non-TS languages: full parse ${E.treeSitter.fullIndexMs.median} ms, 1-file ${E.treeSitter.incrementalUpdateMs.median} ms.`,
  codegraph: `Reject as a dependency: ${E.codegraph.install.installMB} MB, static recall ${E.codegraph.recallStatic}, alias ${E.codegraph.recallByStratum.alias.found}/${E.codegraph.recallByStratum.alias.sampled}, dynamic ${E.codegraph.recallByStratum.dynamic.found}/${E.codegraph.recallByStratum.dynamic.sampled}, own schema. Benchmark only, as planned.`,
  stopRows: { bestStaticRecallBelow0_9: Math.max(E.typescriptCompilerApi.recallStatic, E.scipTypescript.recallStatic) < 0.9, fullIndexOver5min: E.typescriptCompilerApi.fullIndexMs.median > 300000, nonPermissiveDep: false },
};
writeFileSync(OUT, JSON.stringify(report, null, 2) + '\n');
log('wrote', OUT);
console.log(JSON.stringify(Object.fromEntries(Object.entries(report.engines).map(([k, v]) => [k, { precision: v.precision, recallAll: v.recallAll, recallStatic: v.recallStatic, byStratum: Object.fromEntries(Object.entries(v.recallByStratum).map(([s, x]) => [s, `${x.found}/${x.sampled}`])), edges: v.totalCallEdges, fullMs: v.fullIndexMs.median, incMs: v.incrementalUpdateMs.median, MB: v.install.installMB }])), null, 1));
