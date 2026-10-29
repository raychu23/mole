// M24 bench (T32): replay 30 merged pull requests of 2 public repos (backstage, govuk-infrastructure) through the local
// `mole pr-check` (the command the GitHub workflow runs), with overlay records whose scope was written from the ADR texts,
// and compare with the hand-labeled key (m24-key.json, frozen in the red commit).
// Targets: precision >= 0.9 and recall >= 0.8 on (PR, record governs these lines) pairs, owners exact on every PR (key from
// bench/m24_owners.py, an independent Python reading of GitHub's CODEOWNERS rules), silent exactly when nothing governs,
// p95 < 60 s per local run. Also: the dogfood share on Mole's own task merges, and the failure case (rename -> unanchored).
// usage: node packages/decisions/dist/bench/m24.js [--details FILE] [--metrics-out FILE] [--only REPO]
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const benchDir = resolve(here, '../../bench');
const repoRoot = resolve(here, '../../../..');
const cli = resolve(repoRoot, 'packages/daemon/dist/cli.js');
const key = JSON.parse(readFileSync(join(benchDir, 'm24-key.json'), 'utf8')) as Key;

interface KeyPr {
  repo: string;
  pr: number;
  base: string;
  head: string;
  governs: string[];
  convention: string[];
  owners: string[];
  silent: boolean;
}
interface Key {
  targets: { precision: number; recall: number; p95_seconds: number };
  repos: Record<string, { clone: string; records: string }>;
  prs: KeyPr[];
  dogfood: { merges: Record<string, string>; branches: Record<string, { base: string; head: string }> };
  failure_case: { expect: { governs: string[]; unanchored: string[]; flag: string; silent: boolean } };
}
interface Out {
  governed: Array<{ id: string }>;
  unanchored: Array<{ id: string; flag: string }>;
  owners: string[];
  silent: boolean;
  checkRun: { output: { annotations: unknown[] } };
}

const args = process.argv.slice(2);
const opt = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const only = opt('--only');
const tilde = (p: string) => (p.startsWith('~/') ? join(homedir(), p.slice(2)) : p);
const cloneOf = (repo: string) => resolve(process.env.MOLE_BENCH_T32_DIR ? join(process.env.MOLE_BENCH_T32_DIR, repo) : tilde(key.repos[repo]!.clone));

function run(root: string, records: string | undefined, base: string, head: string): { out: Out | null; ms: number; err: string } {
  const a = [cli, 'pr-check', '--root', root, '--base', base, '--head', head, '--json'];
  if (records) a.push('--records', records);
  const t0 = performance.now();
  const r = spawnSync(process.execPath, a, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, timeout: 300_000 });
  const ms = performance.now() - t0;
  if (r.status !== 0) return { out: null, ms, err: `exit ${r.status}: ${(r.stderr || '').slice(0, 400)}` };
  try {
    return { out: JSON.parse(r.stdout) as Out, ms, err: '' };
  } catch (e) {
    return { out: null, ms, err: `bad JSON: ${String(e).slice(0, 200)}` };
  }
}

const p95 = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil(0.95 * s.length) - 1)]!;
};
const r2 = (x: number) => Math.round(x * 100) / 100;

// ---- 1) the 30 replayed PRs
const details: unknown[] = [];
let tp = 0, fp = 0, fn = 0, tpLoc = 0, fpLoc = 0, fnLoc = 0;
let ownersOk = 0, silentOk = 0, n = 0, errors = 0;
const times: number[] = [];
const missing = new Set<string>();
for (const p of key.prs) {
  if (only && p.repo !== only) continue;
  const clone = cloneOf(p.repo);
  if (!existsSync(join(clone, '.git')) && !existsSync(join(clone, 'HEAD'))) {
    missing.add(`${p.repo} (${clone})`);
    continue;
  }
  n++;
  const records = resolve(repoRoot, key.repos[p.repo]!.records);
  const { out, ms, err } = run(clone, records, p.base, p.head);
  times.push(ms);
  if (!out) {
    errors++;
    fn += p.governs.length;
    details.push({ repo: p.repo, pr: p.pr, error: err, ms: Math.round(ms) });
    continue;
  }
  const got = new Set(out.governed.map((g) => g.id));
  const want = new Set(p.governs);
  const conv = new Set(p.convention);
  const hit = [...got].filter((x) => want.has(x));
  const extra = [...got].filter((x) => !want.has(x));
  const miss = [...want].filter((x) => !got.has(x));
  tp += hit.length;
  fp += extra.length;
  fn += miss.length;
  tpLoc += hit.filter((x) => !conv.has(x)).length;
  fpLoc += extra.length;
  fnLoc += miss.filter((x) => !conv.has(x)).length;
  const ownersMatch = JSON.stringify([...out.owners].sort()) === JSON.stringify([...p.owners].sort());
  if (ownersMatch) ownersOk++;
  if (out.silent === p.silent) silentOk++;
  details.push({
    repo: p.repo,
    pr: p.pr,
    ms: Math.round(ms),
    got: [...got].sort(),
    want: [...want].sort(),
    false_hits: extra.sort(),
    misses: miss.sort(),
    owners: ownersMatch ? 'exact' : { got: out.owners, want: p.owners },
    silent: { got: out.silent, want: p.silent },
    unanchored: out.unanchored.map((u) => u.id),
    annotations: out.checkRun.output.annotations.length,
  });
}
const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
const recall = tp + fn === 0 ? 0 : tp / (tp + fn);
const precisionLoc = tpLoc + fpLoc === 0 ? 0 : tpLoc / (tpLoc + fpLoc);
const recallLoc = tpLoc + fnLoc === 0 ? 0 : tpLoc / (tpLoc + fnLoc);
const p95s = p95(times) / 1000;

// ---- 2) dogfood: Mole's own builder task merges, records = this checkout's .mole
const dog: Array<{ task: string; governed: string[]; ms: number; error?: string }> = [];
if (!only) {
  const items: Array<[string, string, string]> = [];
  for (const [task, sha] of Object.entries(key.dogfood.merges)) items.push([task, `${sha}^1`, sha]);
  for (const [task, b] of Object.entries(key.dogfood.branches)) items.push([task, b.base, b.head]);
  for (const [task, base, head] of items) {
    const { out, ms, err } = run(repoRoot, repoRoot, base, head);
    dog.push(out ? { task, governed: out.governed.map((g) => g.id).sort(), ms: Math.round(ms) } : { task, governed: [], ms: Math.round(ms), error: err });
  }
}
const dogHit = dog.filter((d) => d.governed.length > 0).length;

// ---- 3) failure case: a renamed file whose anchor can't re-attach
function failureCase(): { ok: boolean; detail: string } {
  const root = mkdtempSync(join(tmpdir(), 'mole-m24-rename-'));
  try {
    const g = (...a: string[]) => execFileSync('git', ['-C', root, '-c', 'user.name=T', '-c', 'user.email=t@e.com', '-c', 'commit.gpgsign=false', ...a], { encoding: 'utf8' }).trim();
    const w = (rel: string, t: string) => {
      mkdirSync(dirname(join(root, rel)), { recursive: true });
      writeFileSync(join(root, rel), t);
    };
    g('init', '-q');
    w('src/a.ts', 'export function foo(): number {\n  return 1;\n}\n');
    w('lib/old.ts', 'export const a = 1;\nexport const b = 2;\nexport const c = 3;\n');
    w('.mole/decisions/r-old.md', "---\nid: r-old\ntitle: Old lib stays tiny\nstatus: accepted\nscope:\n  - lib/old.ts\n---\n");
    w('.mole/decisions/r-keep.md', "---\nid: r-keep\ntitle: foo returns one\nstatus: accepted\nscope:\n  - src/a.ts#foo\n---\n");
    g('add', '-A');
    g('commit', '-q', '-m', 'base');
    const base = g('rev-parse', 'HEAD');
    g('mv', 'lib/old.ts', 'lib/new.ts');
    w('lib/new.ts', 'export const a = 1;\nexport const b = 2;\nexport const c = 4;\n');
    g('add', '-A');
    g('commit', '-q', '-m', 'rename');
    const head = g('rev-parse', 'HEAD');
    const { out, err } = run(root, undefined, base, head);
    if (!out) return { ok: false, detail: err };
    const e = key.failure_case.expect;
    const gov = out.governed.map((x) => x.id).sort();
    const un = out.unanchored.map((x) => x.id).sort();
    const ok = JSON.stringify(gov) === JSON.stringify(e.governs) && JSON.stringify(un) === JSON.stringify(e.unanchored) && out.unanchored.every((u) => u.flag === e.flag) && out.silent === e.silent;
    return { ok, detail: `governed ${JSON.stringify(gov)}, unanchored ${JSON.stringify(un)} (${out.unanchored.map((u) => u.flag).join(',')}), silent ${out.silent}` };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
const fc = failureCase();

const t = key.targets;
const pass = {
  precision: precision >= t.precision,
  recall: recall >= t.recall,
  owners: n > 0 && ownersOk === n,
  silent: n > 0 && silentOk === n,
  p95: n > 0 && p95s < t.p95_seconds,
  all30: n === key.prs.length || !!only,
  errors: errors === 0,
  failureCase: fc.ok,
};
const line = `M24: precision ${r2(precision)}, recall ${r2(recall)}, owners exact ${ownersOk}/${n}, silent ${silentOk}/${n}, p95 ${r2(p95s)} s`;
const metrics = {
  M24: line.slice(5),
  located_only: `precision ${r2(precisionLoc)}, recall ${r2(recallLoc)} (pairs labeled 'convention' left out)`,
  pairs: { tp, fp, fn },
  dogfood: `${dogHit}/${dog.length} Mole task diffs surface a governing decision`,
  failure_case: fc.ok ? 'pass' : `FAIL: ${fc.detail}`,
};
console.log(line);
console.log(`  located-only ${metrics.located_only}; pairs tp ${tp} fp ${fp} fn ${fn}; errors ${errors}`);
console.log(`  dogfood ${metrics.dogfood}: ${dog.map((d) => `${d.task}=${d.governed.join('+') || (d.error ? 'ERR' : '-')}`).join(' ')}`);
console.log(`  failure case (rename -> unanchored): ${fc.ok ? 'pass' : 'FAIL'} (${fc.detail})`);
if (missing.size) console.log(`  missing clones: ${[...missing].join('; ')} (clone them as m24-key.json repos[].clone_cmd says)`);
for (const d of details as Array<Record<string, unknown>>)
  if (d.error || (d.false_hits as string[] | undefined)?.length || (d.misses as string[] | undefined)?.length || d.owners !== 'exact')
    console.log(`  ${d.repo} #${d.pr}: ${d.error ? `error ${d.error}` : `false ${JSON.stringify(d.false_hits)} miss ${JSON.stringify(d.misses)} owners ${JSON.stringify(d.owners)}`}`);
const failed = Object.entries(pass).filter(([, v]) => !v).map(([k]) => k);
console.log(failed.length ? `M24 FAIL: ${failed.join(', ')}` : 'M24 PASS');
const detailsOut = opt('--details');
if (detailsOut) writeFileSync(detailsOut, JSON.stringify({ details, dogfood: dog, failure_case: fc, metrics }, null, 2));
const metricsOut = opt('--metrics-out');
if (metricsOut) writeFileSync(metricsOut, JSON.stringify(metrics));
process.exit(failed.length ? 1 : 0);
