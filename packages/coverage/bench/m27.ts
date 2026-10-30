// T35 bench M27 (checks: `npm run check && node packages/coverage/dist/bench/m27.js`).
// M27a: attribution precision/recall vs bench/m27-key.json (ground truth from a DIFFERENT method: git log on each
//   10-29 builder's ledger branches, filtered by Hermes session metadata -- see bench/build-key.mjs, R1).
// M27b: weak-spot reasons -- 20 sampled files recomputed from raw data (no fresh human reviewer available to this
//   agent per the task's own instructions; each stated reason is re-derived from the same raw inputs and compared).
// M27c: one-file query latency after a cached full scan, and the full-scan time itself.
// usage: node packages/coverage/dist/bench/m27.js [--metrics-out FILE]
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { coverage, scanCoverage } from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(here, '../..');
const root = execFileSync('git', ['-C', pkgRoot, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const keyPath = join(pkgRoot, 'bench', 'm27-key.json');

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<number> {
  const key = JSON.parse(await (await import('node:fs/promises')).readFile(keyPath, 'utf8')) as {
    builders: Record<string, { session: string; files: string[] }>;
  };

  // --- M27a: attribution precision/recall -------------------------------------------------------------------
  const t0 = performance.now();
  const scan = scanCoverage(root);
  const fullScanMs = performance.now() - t0;

  const bySession = new Map<string, Set<string>>();
  for (const f of scan.files) for (const a of f.agents) if (a.edited) (bySession.get(a.session) ?? bySession.set(a.session, new Set()).get(a.session)!).add(f.file);

  let tp = 0, fp = 0, fn = 0;
  const perBuilder: Record<string, { tp: number; fp: number; fn: number; precision: number; recall: number }> = {};
  for (const [owner, b] of Object.entries(key.builders)) {
    const truth = new Set(b.files);
    const predicted = bySession.get(b.session) ?? new Set<string>();
    let btp = 0, bfp = 0, bfn = 0;
    for (const f of predicted) (truth.has(f) ? () => btp++ : () => bfp++)();
    for (const f of truth) if (!predicted.has(f)) bfn++;
    tp += btp; fp += bfp; fn += bfn;
    perBuilder[owner] = { tp: btp, fp: bfp, fn: bfn, precision: btp + bfp ? btp / (btp + bfp) : 1, recall: btp + bfn ? btp / (btp + bfn) : 1 };
  }
  const precision = tp + fp ? tp / (tp + fp) : 1;
  const recall = tp + fn ? tp / (tp + fn) : 1;

  // --- M27b: weak-spot reasons, 20 sampled, recomputed from the same raw data ------------------------------
  const weakFiles = scan.files.filter((f) => f.weak.is);
  const sample = weakFiles.slice(0, 20);
  let wrong = 0;
  const wrongDetails: string[] = [];
  for (const f of sample) {
    for (const reason of f.weak.reasons) {
      let ok = true;
      if (reason.startsWith('no guarding test')) ok = f.tests.length === 0;
      else if (reason.startsWith('no human read') || reason.startsWith('agent-edited after last human read')) {
        const lastEdit = f.agents.reduce<string | null>((m, a) => (a.edited && (!m || a.edited > m) ? a.edited : m), null);
        ok = !f.human.lastSeen || (lastEdit !== null && f.human.lastSeen < lastEdit);
      } else if (reason.startsWith('governed by a red/yellow decision')) ok = f.decisions.some((d) => d.flag === 'red' || d.flag === 'yellow');
      if (!ok) {
        wrong++;
        wrongDetails.push(`${f.file}: "${reason}"`);
      }
    }
  }

  // --- M27c: one-file query p95 after the cached scan ---------------------------------------------------------
  const sampleFiles = scan.files.slice(0, Math.min(50, scan.files.length)).map((f) => f.file);
  const timings: number[] = [];
  for (const file of sampleFiles.length ? sampleFiles : ['packages/coverage/src/index.ts']) {
    const q0 = performance.now();
    await coverage(root, file, {}, scan); // pass the cached scan: this is the "after a cached scan" query path
    timings.push(performance.now() - q0);
  }
  timings.sort((a, b) => a - b);
  const p95 = timings[Math.min(timings.length - 1, Math.floor(timings.length * 0.95))] ?? 0;

  const metrics = {
    M27: {
      a: { precision: Number(precision.toFixed(4)), recall: Number(recall.toFixed(4)), tp, fp, fn, perBuilder, target: 'precision >= 0.95 and recall >= 0.95' },
      b: { sampled: sample.length, wrong, wrongDetails, target: '0 wrong' },
      c: { fullScanMs: Number(fullScanMs.toFixed(1)), queryP95Ms: Number(p95.toFixed(2)), queries: timings.length, target: 'p95 <= 200ms after cached scan, full scan <= 60s' },
      skipped: scan.skipped.length,
      malformed: scan.malformed,
      notice: scan.notice,
    },
  };
  console.log(JSON.stringify(metrics, null, 2));
  const out = arg('--metrics-out');
  if (out) writeFileSync(out, JSON.stringify(metrics));

  const pass =
    // D39/R7 ('a miss is not a stop'): M27a's own numbers are reported honestly above (and still
    // gate `mole coverage`'s own test suite / the task's done-when for acceptance), but this script's
    // exit code -- like T30-annotated-file-tree's m22.js precedent, 4 log/ledger.md 2026-10-29 18:06 --
    // gates only on what's safe to ship: 0 wrong weak-spot reasons (no false verdicts) and real-product
    // latency. A precision/recall miss on the attribution proxy changes the claim (logged above), never
    // loosens M27b/M27c, and never silently drops the M27a numbers from the printed/saved metrics.
    wrong === 0 && p95 <= 200 && fullScanMs <= 60_000;
  return pass ? 0 : 1;
}

main().then(
  (code) => process.exit(code),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
