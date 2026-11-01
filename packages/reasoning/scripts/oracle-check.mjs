// Oracle gate (T42): compares this package's grounded evaluate() against
// carneades-4's `dung` CLI (Go, MPL-2.0) on every fixture that is a plain
// Dung AF (no audience/value semantics -- carneades-4's arg.dung package has
// no Bench-Capon reasoner, see memo.md section 1/8; audience fixtures are
// hand-verified instead and intentionally excluded here).
//
// This script is plain JS against the BUILT package (run `npm run build` in
// packages/reasoning first) and is NOT part of `npm run check`. The oracle
// binary is never vendored or linked into this repo (MPL-2.0 kept at arm's
// length, run as a separate test tool only, per the task boundary). Usage:
//   node packages/reasoning/scripts/oracle-check.mjs --oracle <path-to-carneades-bin>
import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluate } from '../dist/src/engine.js';

const here = dirname(fileURLToPath(import.meta.url));
const pkgDir = resolve(here, '..');
const fixturesDir = join(pkgDir, 'fixtures');
const oracleDir = join(fixturesDir, 'oracle');
const taskDir = resolve(pkgDir, '../../tasks/T42-reasoning-engine');

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const oraclePath = arg('--oracle', '/Users/a1/.hermes/cache/scratch/carneades-bin');
const runsOut = arg('--runs-out', join(taskDir, '4 log/runs.jsonl'));

function tsInSet(name) {
  const raw = JSON.parse(readFileSync(join(fixturesDir, `${name}.json`), 'utf8'));
  const { labels } = evaluate(raw.framework);
  const ids = raw.framework.args.map((a) => a.id);
  return ids.filter((id) => labels[id] === 'in').sort();
}

// The tgf importer (src/engine/dung/encoding/tgf/tgf.go:41) keys arguments by
// the node line's FIRST token only (the numeric id) and ignores the second
// (the human label) -- so the CLI's extension output is numeric ids, which
// we map back to labels ourselves from the same file.
function tgfLabels(tgfPath) {
  const map = new Map();
  for (const line of readFileSync(tgfPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '#') break; // end of node list, start of edges -- stop before edge lines overwrite labels
    const [t1, t2] = trimmed.split(/\s+/);
    if (!t1) continue;
    if (t2 !== undefined) map.set(t1, t2);
  }
  return map;
}

function oracleInSet(tgfPath) {
  const labelOf = tgfLabels(tgfPath);
  const out = execFileSync(oraclePath, ['dung', '-p', 'EE', '-s', 'GR', tgfPath], { encoding: 'utf8' }).trim();
  // EE-GR always prints exactly one extension, double-bracketed: "[[3,1]]" or "[[]]".
  const inner = out.slice(2, -2);
  if (!inner) return [];
  return inner
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((id) => labelOf.get(id) ?? id)
    .sort();
}

const fixtureNames = readdirSync(oracleDir)
  .filter((f) => f.endsWith('.tgf'))
  .map((f) => f.replace(/\.tgf$/, ''));

let oracleRan = false;
try {
  execFileSync(oraclePath, ['dung', '-h'], { encoding: 'utf8' });
} catch (err) {
  // -h exits non-zero by design (flag.ContinueOnError + log.Fatal on no subcommand in some builds);
  // treat "binary executed and produced output" as runnable, true failure is ENOENT/EACCES.
  if (err.code === 'ENOENT' || err.code === 'EACCES') {
    console.error(`oracle binary not runnable at ${oraclePath}: ${err.message}`);
  } else {
    oracleRan = true;
  }
}
if (!oracleRan) {
  try {
    execFileSync(oraclePath, ['dung', '-p', 'EE', '-s', 'GR', join(oracleDir, `${fixtureNames[0]}.tgf`)], {
      encoding: 'utf8',
    });
    oracleRan = true;
  } catch {
    oracleRan = false;
  }
}

const rows = [];
for (const name of fixtureNames) {
  const ts_in = tsInSet(name);
  const oracle_in = oracleRan ? oracleInSet(join(oracleDir, `${name}.tgf`)) : [];
  const agree = oracleRan && JSON.stringify(ts_in) === JSON.stringify(oracle_in);
  rows.push({ fixture: name, ts_in, oracle_in, agree });
}
const allAgree = oracleRan && rows.every((r) => r.agree);

console.log('oracle:', oracleRan ? `carneades-4 dung CLI (Go, MPL-2.0) at ${oraclePath}` : 'NOT RUN');
console.log('');
console.log('fixture              | ts grounded-in set          | oracle grounded-in set        | agree');
console.log('---------------------|------------------------------|-------------------------------|------');
for (const r of rows) {
  console.log(
    `${r.fixture.padEnd(21)}| ${JSON.stringify(r.ts_in).padEnd(29)}| ${JSON.stringify(r.oracle_in).padEnd(30)}| ${r.agree}`,
  );
}
console.log('');
console.log(allAgree ? `ALL ${rows.length} FIXTURES AGREE` : 'DISAGREEMENT OR ORACLE NOT RUN');

const report = {
  tool: 'packages/reasoning scripts/oracle-check.mjs',
  at: new Date().toISOString(),
  oracle: oracleRan ? 'carneades-4 (Go, MPL-2.0), dung CLI, EE-GR' : 'none',
  rows,
  all_agree: allAgree,
};
mkdirSync(dirname(runsOut), { recursive: true });
appendFileSync(runsOut, `${JSON.stringify(report)}\n`);

if (!allAgree) process.exitCode = 1;
