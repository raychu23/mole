// T22 bench M14 (checks: `npm run check && node packages/verify/dist/bench/m14.js`).
// 10 planted regressions (bench/patches/*.diff, 5 Mole + 5 Excalidraw), truth frozen in bench/keys/m14-key.json BEFORE the
// selector existed (made by bench/make-key.mjs with the repo's own runner: full suite with the patch applied; see README.md).
// Per regression: apply the patch in a scratch checkout (never this worktree), build (Mole), select with
// selectTests(<checkout>, { worktree: true }), run the selection with runTests (vitest), revert.
//   caught  = a selected test FAILS in that run and the key lists it as failing in the full-suite run
//   ratio   = tests the selection ran / the key's `reach.tests` (test cases whose module graph contains the edited file,
//             from `vitest related`, independent of the selector)
// Target: caught >= 9 of 10 AND mean ratio <= 1/3. Baselines: run all (the key's full-suite run) and run none.
// Exit 0 only when the target is met. --metrics-out FILE writes {"M14": "..."}; --details FILE writes per-regression rows.
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { modelCalls, runTests, selectTests } from '../src/index.js';
import { summarizeM14, type Detail as SummaryDetail } from './m14-summary.js';

const benchDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../bench');
const moleRoot = execFileSync('git', ['-C', benchDir, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const S = '/Users/a1/.hermes/cache/scratch/mole-builder-5';
const arg = (k: string): string | undefined => {
  const i = process.argv.indexOf(k);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

interface KeyTest { file: string; name: string; line: number | null }
interface KeyRow {
  id: string;
  repo: 'mole' | 'excalidraw';
  base: string;
  patch: string;
  patchSha256: string;
  editedFiles: string[];
  failing: KeyTest[];
  fullSuiteTests: number;
  reach: { tests: number; files: number };
  valid: boolean;
}
interface Key { written: string; frozen: string[]; regressions: KeyRow[] }
const key = JSON.parse(readFileSync(join(benchDir, 'keys/m14-key.json'), 'utf8')) as Key;
const rows = key.frozen.map((id) => {
  const r = key.regressions.find((x) => x.id === id);
  if (!r) throw new Error(`key: frozen id ${id} has no row`);
  return r;
});
if (rows.length !== 10 || rows.some((r) => !r.valid)) throw new Error('key: want 10 frozen valid regressions');

const REPOS = {
  mole: { dir: process.env.MOLE_BENCH_MOLE_CHECKOUT ?? join(S, 'mole-t22-bench'), build: true },
  excalidraw: { dir: process.env.MOLE_BENCH_EXCALIDRAW_COPY ?? join(S, 'excalidraw-T22'), build: false },
};
const EXCALIDRAW_SRC = process.env.MOLE_BENCH_EXCALIDRAW_SRC ?? join(S, 'excalidraw');
const cache = join(moleRoot, '.mole/local/bench/m14');
mkdirSync(cache, { recursive: true });

function ensureCheckout(repo: 'mole' | 'excalidraw', base: string): string {
  const { dir } = REPOS[repo];
  if (!existsSync(dir)) {
    if (repo === 'mole') {
      execFileSync('git', ['-C', moleRoot, 'worktree', 'add', '--detach', dir, base], { stdio: 'ignore' });
      execFileSync('cp', ['-cR', join(moleRoot, 'node_modules'), join(dir, 'node_modules')]);
    } else {
      execFileSync('cp', ['-cR', EXCALIDRAW_SRC, dir]);
    }
  }
  const head = execFileSync('git', ['-C', dir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  if (head !== base) execFileSync('git', ['-C', dir, 'checkout', '-q', '--detach', base]);
  const st = execFileSync('git', ['-C', dir, 'status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8' }).trim();
  if (st) throw new Error(`${repo} checkout ${dir} is dirty:\n${st}`);
  return dir;
}
function build(repo: 'mole' | 'excalidraw', dir: string): void {
  if (!REPOS[repo].build) return;
  const r = spawnSync('npx', ['tsc', '-b'], { cwd: dir, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`tsc -b failed in ${dir}: ${r.stdout.slice(-1500)}`);
}
const pct = (x: number): string => `${(x * 100).toFixed(1)}%`;
const norm = (s: string): string => s.replace(/ > /g, ' ').trim();

interface Detail {
  id: string;
  repo: string;
  edited: string[];
  selected: number;
  ran: number;
  failedRun: number;
  reach: number;
  fullSuiteTests: number;
  ratio: number;
  caught: boolean;
  caughtBy: string[];
  keyFailing: number;
  noTestReaches: boolean;
  selectMs: number;
  runMs: number;
  tests: Array<{ file: string; name: string; via: string[]; depth?: number; status?: string }>;
  error?: string;
}
const details: Detail[] = [];
const prepared = new Set<string>();
for (const r of rows) {
  const patchFile = join(benchDir, r.patch);
  const patch = readFileSync(patchFile, 'utf8');
  const sha = createHash('sha256').update(patch).digest('hex');
  if (sha !== r.patchSha256) throw new Error(`${r.id}: patch sha256 ${sha} != key ${r.patchSha256} (R2: patches are frozen)`);
  const dir = ensureCheckout(r.repo, r.base);
  if (!prepared.has(r.repo)) {
    build(r.repo, dir);
    prepared.add(r.repo);
  }
  const graphDb = join(cache, `graph-${r.repo}-${r.base.slice(0, 9)}.sqlite`);
  execFileSync('git', ['-C', dir, 'apply', patchFile]);
  const d: Detail = { id: r.id, repo: r.repo, edited: r.editedFiles, selected: 0, ran: 0, failedRun: 0, reach: r.reach.tests, fullSuiteTests: r.fullSuiteTests, ratio: 0, caught: false, caughtBy: [], keyFailing: r.failing.length, noTestReaches: false, selectMs: 0, runMs: 0, tests: [] };
  try {
    build(r.repo, dir);
    const t0 = performance.now();
    const sel = await selectTests(dir, { worktree: true }, { graphDb });
    d.selectMs = Math.round(performance.now() - t0);
    d.selected = sel.tests.length;
    d.noTestReaches = sel.noTestReaches;
    const run = sel.tests.length ? await runTests(dir, sel) : undefined;
    d.runMs = run?.ms ?? 0;
    const outcomes = run?.outcomes ?? [];
    const ran = outcomes.filter((o) => o.status === 'passed' || o.status === 'failed');
    d.ran = ran.length;
    d.failedRun = ran.filter((o) => o.status === 'failed').length;
    const truth = new Set(r.failing.map((t) => `${t.file}\0${norm(t.name)}`));
    d.caughtBy = ran.filter((o) => o.status === 'failed' && truth.has(`${o.file}\0${norm(o.name)}`)).map((o) => `${o.file} > ${o.name}`);
    d.caught = d.caughtBy.length > 0;
    d.ratio = r.reach.tests > 0 ? d.ran / r.reach.tests : d.ran > 0 ? Infinity : 0;
    d.tests = sel.tests.map((t) => ({ file: t.file, name: t.name, via: t.via, depth: t.depth, status: outcomes.find((o) => o.file === t.file && norm(o.name) === norm(t.name))?.status }));
    if (run?.error) d.error = run.error;
  } catch (e) {
    d.error = e instanceof Error ? e.message : String(e);
  } finally {
    execFileSync('git', ['-C', dir, 'apply', '-R', patchFile]);
  }
  details.push(d);
  console.log(`${r.id} ${r.repo.padEnd(10)} ${d.caught ? 'CAUGHT' : 'missed'}  ran ${d.ran}/${d.reach} reaching (${(d.ratio * 100).toFixed(1)}%), selected ${d.selected}, failed ${d.failedRun}, key failing ${d.keyFailing}  select ${d.selectMs} ms, run ${d.runMs} ms${d.error ? `  ERROR ${d.error.slice(0, 200)}` : ''}`);
}
for (const repo of prepared) build(repo as 'mole' | 'excalidraw', REPOS[repo as 'mole' | 'excalidraw'].dir);

const summary = summarizeM14(
  rows.map((r) => ({ id: r.id, repo: r.repo, failing: r.failing, fullSuiteTests: r.fullSuiteTests, reach: r.reach, valid: r.valid })),
  details.map((d): SummaryDetail => ({ id: d.id, ran: d.ran, reach: d.reach, fullSuiteTests: d.fullSuiteTests, caughtBy: d.caughtBy })),
  modelCalls.count,
);
console.log('\nrow          caught   tests run   share of reach (vitest related)   selection size (% of suite)');
for (const d of details) {
  const reachShare = d.reach > 0 ? d.ran / d.reach : d.ran > 0 ? Infinity : 0;
  const suiteShare = d.fullSuiteTests > 0 ? d.ran / d.fullSuiteTests : 0;
  console.log(`${d.id}          ${d.caught ? 'y' : 'n'}        ${String(d.ran).padEnd(10)}  ${pct(reachShare).padEnd(33)}  ${pct(suiteShare)}`);
}
console.log(`\nselection    ${summary.caught}/${summary.n}     ${String(summary.suiteShare.ranTotal).padEnd(10)}  ${pct(summary.reachShare.mean).padEnd(33)}  ${pct(summary.suiteShare.mean)} (mean)`);
console.log(`run all      ${summary.n}/${summary.n}     ${String(summary.suiteShare.suiteTotal).padEnd(10)}  n/a (by construction every reaching test runs)   100.0%   (the key's full-suite runs: every valid regression fails there by construction)`);
console.log(`run none     0/${summary.n}      0           n/a                                0.0%`);
console.log(`model calls: ${modelCalls.count}`);
console.log(`\nM14 ${summary.M14}  ${summary.met ? 'MET' : 'NOT MET'}`);
const mo = arg('--metrics-out');
if (mo) writeFileSync(mo, JSON.stringify({ M14: summary.M14 }));
const det = arg('--details');
if (det) {
  mkdirSync(dirname(det), { recursive: true });
  writeFileSync(det, JSON.stringify({ M14: summary.M14, met: summary.met, details }, null, 2));
}
process.exit(summary.met ? 0 : 1);
