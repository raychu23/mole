#!/usr/bin/env node
// T22 M14 key maker: the TRUTH for each planted regression, computed by the repo's own test runner, never by the selector.
//   failing  = test cases that FAIL when the FULL suite runs with the patch applied, fail again when their files are rerun
//              with the patch, did not fail in the unpatched full run, and PASS when their files are rerun without the
//              patch (flake filters: a timeout under machine load fails both ways and is dropped)
//   reach    = the denominator: test cases run by `vitest related <edited files>` with the patch applied (vite's own module
//              graph of each test file contains the edited source file; for Mole also its compiled dist/*.js, because
//              cross-package imports resolve to dist). Independent of @mole/indexer's call graph.
// Usage: node packages/verify/bench/make-key.mjs [ids...]   (default: every patch in bench/patches)
//        node packages/verify/bench/make-key.mjs --freeze   (writes `frozen`: the first 5 valid Mole ids + the first 5 valid
//        Excalidraw ids in id order, fixed before the selector existed; invalid ids = no test fails = replaced, listed)
// Writes packages/verify/bench/keys/m14-key.json (merging ids already present) + raw runs under .mole/local/bench/m14-truth/.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const benchDir = dirname(fileURLToPath(import.meta.url));
const moleRoot = execFileSync('git', ['-C', benchDir, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const S = '/Users/a1/.hermes/cache/scratch/mole-builder-5';
const REPOS = {
  mole: { dir: process.env.MOLE_BENCH_MOLE_CHECKOUT ?? join(S, 'mole-t22-bench'), base: '70a2989', build: true },
  excalidraw: { dir: process.env.MOLE_BENCH_EXCALIDRAW_COPY ?? join(S, 'excalidraw-T22'), base: 'e7b5346', build: false },
};
const out = join(moleRoot, '.mole/local/bench/m14-truth');
mkdirSync(out, { recursive: true });
const keyPath = join(benchDir, 'keys/m14-key.json');

const sh = (cwd, cmd, args, opts = {}) => spawnSync(cmd, args, { cwd, encoding: 'utf8', maxBuffer: 1 << 28, ...opts });
// a run may write snapshot files (excalidraw's export.test.ts adds a missing one): put tracked snapshots back after each run
function restoreSnapshots(repo) {
  sh(repo.dir, 'git', ['checkout', '--', ':(glob)**/__snapshots__/**']);
}
function vitest(repo, args, file) {
  const r = sh(repo.dir, 'npx', ['vitest', 'run', ...args, '--reporter=json', `--outputFile=${file}`]);
  restoreSnapshots(repo);
  if (!existsSync(file)) throw new Error(`vitest wrote no report (${r.status}): ${r.stderr.slice(-2000)}`);
  return JSON.parse(readFileSync(file, 'utf8'));
}
function related(repo, files, file) {
  const r = sh(repo.dir, 'npx', ['vitest', 'related', ...files, '--run', '--reporter=json', `--outputFile=${file}`]);
  restoreSnapshots(repo);
  if (!existsSync(file)) throw new Error(`vitest related wrote no report (${r.status}): ${r.stderr.slice(-2000)}`);
  return JSON.parse(readFileSync(file, 'utf8'));
}
function cases(repo, report) {
  const res = [];
  for (const f of report.testResults) {
    const file = relative(repo.dir, f.name).split('\\').join('/');
    for (const a of f.assertionResults) res.push({ file, name: a.fullName, status: a.status, line: a.location?.line ?? null });
  }
  return res;
}
function build(repo) {
  if (!repo.build) return;
  const r = sh(repo.dir, 'npx', ['tsc', '-b']);
  if (r.status !== 0) throw new Error(`tsc -b failed in ${repo.dir}: ${r.stdout.slice(-2000)}`);
}
function assertClean(name, repo) {
  const head = execFileSync('git', ['-C', repo.dir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  if (!head.startsWith(repo.base)) throw new Error(`${name} checkout at ${head}, want ${repo.base}`);
  const st = execFileSync('git', ['-C', repo.dir, 'status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8' }).trim();
  if (st) throw new Error(`${name} checkout is dirty:\n${st}`);
  return head;
}
const editedFiles = (patch) => [...patch.matchAll(/^\+\+\+ b\/(.+)$/gm)].map((m) => m[1]);
const distOf = (f) => f.replace(/^packages\/([^/]+)\/src\/(.+)\.ts$/, 'packages/$1/dist/src/$2.js');

if (process.argv[2] === '--freeze') {
  const key = JSON.parse(readFileSync(keyPath, 'utf8'));
  const valid = (repo) => key.regressions.filter((r) => r.repo === repo && r.valid).map((r) => r.id).sort().slice(0, 5);
  key.frozen = [...valid('mole'), ...valid('excalidraw')];
  key.replaced = key.regressions.filter((r) => !r.valid).map((r) => ({ id: r.id, why: 'no test fails in the full suite with this patch applied: not a regression the suite can catch' }));
  key.written = new Date().toISOString();
  key.definitions = {
    caught: 'a test the selection ran FAILS with the patch applied and is listed in `failing` (same file + full name)',
    failing: 'test cases failing in the full suite with the patch (and again on a rerun of their files), not failing in the unpatched full run',
    reach: 'test cases run by `vitest related <edited files>` with the patch applied (Mole: plus the compiled dist/*.js of each edited src file); the denominator of the share',
    share: 'tests the selection ran / reach.tests, averaged over the 10 frozen regressions (target <= 1/3)',
    runAll: 'fullSuiteTests of each row (the full-suite run catches every valid regression by construction)',
    runNone: '0 tests, 0 caught',
  };
  if (key.frozen.length !== 10) throw new Error(`want 10 frozen ids, have ${key.frozen.length}`);
  writeFileSync(keyPath, JSON.stringify(key, null, 2) + '\n');
  console.log(`frozen ${key.frozen.join(' ')} at ${key.written}`);
  process.exit(0);
}
const want = process.argv.slice(2);
const ids = readdirSync(join(benchDir, 'patches')).filter((f) => f.endsWith('.diff')).map((f) => f.slice(0, -5)).filter((id) => !want.length || want.includes(id)).sort();
const key = existsSync(keyPath) ? JSON.parse(readFileSync(keyPath, 'utf8')) : { regressions: [] };
const baseFails = {};
for (const id of ids) {
  const repoName = id.startsWith('m') ? 'mole' : 'excalidraw';
  const repo = REPOS[repoName];
  const head = assertClean(repoName, repo);
  if (!baseFails[repoName]) {
    build(repo);
    const b = cases(repo, vitest(repo, [], join(out, `${repoName}-base.json`)));
    baseFails[repoName] = { set: new Set(b.filter((c) => c.status === 'failed').map((c) => `${c.file}\0${c.name}`)), total: b.filter((c) => c.status === 'passed' || c.status === 'failed').length };
    console.log(`${repoName} base: ${baseFails[repoName].total} tests run, ${baseFails[repoName].set.size} failing (excluded from truth)`);
  }
  const patchFile = join(benchDir, 'patches', `${id}.diff`);
  const patch = readFileSync(patchFile, 'utf8');
  const edited = editedFiles(patch);
  execFileSync('git', ['-C', repo.dir, 'apply', patchFile]);
  let applied = true;
  try {
    build(repo);
    const full = cases(repo, vitest(repo, [], join(out, `${id}-full.json`)));
    const failed1 = full.filter((c) => c.status === 'failed' && !baseFails[repoName].set.has(`${c.file}\0${c.name}`));
    const files1 = [...new Set(failed1.map((c) => c.file))];
    const again = files1.length ? cases(repo, vitest(repo, files1, join(out, `${id}-rerun.json`))) : [];
    const failedAgain = new Set(again.filter((c) => c.status === 'failed').map((c) => `${c.file}\0${c.name}`));
    const twice = failed1.filter((c) => failedAgain.has(`${c.file}\0${c.name}`));
    const relFiles = repo.build ? [...edited, ...edited.map(distOf).filter((d, i) => d !== edited[i])] : edited;
    const rel = cases(repo, related(repo, relFiles, join(out, `${id}-related.json`)));
    const reach = rel.filter((c) => c.status === 'passed' || c.status === 'failed');
    // flake filter 2: the same files without the patch; a test that fails there too (a timeout under load) is no signal
    execFileSync('git', ['-C', repo.dir, 'apply', '-R', patchFile]);
    applied = false;
    build(repo);
    const files2 = [...new Set(twice.map((c) => c.file))];
    const unpatched = files2.length ? cases(repo, vitest(repo, files2, join(out, `${id}-unpatched.json`))) : [];
    const passUnpatched = new Set(unpatched.filter((c) => c.status === 'passed').map((c) => `${c.file}\0${c.name}`));
    const failing = twice.filter((c) => passUnpatched.has(`${c.file}\0${c.name}`)).map(({ file, name, line }) => ({ file, name, line }));
    const entry = {
      id, repo: repoName, base: head, patch: `patches/${id}.diff`, patchSha256: createHash('sha256').update(patch).digest('hex'), editedFiles: edited,
      failing, failingFiles: [...new Set(failing.map((c) => c.file))], flakyDropped: failed1.length - failing.length,
      fullSuiteTests: full.filter((c) => c.status === 'passed' || c.status === 'failed').length,
      reach: { tests: reach.length, files: [...new Set(reach.map((c) => c.file))].length, relatedArgs: relFiles,
        failingInReach: failing.filter((f) => reach.some((r) => r.file === f.file && r.name === f.name)).length },
      valid: failing.length > 0,
    };
    // re-read before merging: another make-key run may have written other ids meanwhile
    const cur = existsSync(keyPath) ? JSON.parse(readFileSync(keyPath, 'utf8')) : key;
    key.regressions = cur.regressions.filter((r) => r.id !== id).concat(entry).sort((a, b) => a.id.localeCompare(b.id));
    console.log(`${id}: ${failing.length} failing tests in ${entry.failingFiles.length} files (flaky dropped ${entry.flakyDropped}); reach ${reach.length} tests / ${entry.reach.files} files; full ${entry.fullSuiteTests}`);
  } finally {
    if (applied) {
      execFileSync('git', ['-C', repo.dir, 'apply', '-R', patchFile]);
      build(repo);
    }
  }
  writeFileSync(keyPath, JSON.stringify(key, null, 2) + '\n');
}
