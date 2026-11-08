'use strict';
// Run all 3 methods against one split, print per-type + overall P/R/F1/acc,
// Wilson 95% CI, and per-check timing (p50/p95 in microseconds).
const fs = require('fs');
const { methodFlagEveryChange, methodOverlap, methodCompilerSignals } = require('./methods.cjs');

const splitFile = process.argv[2];
const examples = fs.readFileSync(splitFile, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);

function wilson(k, n) {
  if (n === 0) return [0, 0];
  const z = 1.959963985;
  const p = k / n;
  const denom = 1 + (z * z) / n;
  const center = p + (z * z) / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [(center - margin) / denom, (center + margin) / denom];
}
function pct(x) { return (x * 100).toFixed(1); }

function evalMethod(name, fn, exs) {
  let tp = 0, fp = 0, fn_ = 0, tn = 0;
  const times = [];
  for (const ex of exs) {
    const t0 = process.hrtime.bigint();
    const pred = fn(ex);
    const t1 = process.hrtime.bigint();
    times.push(Number(t1 - t0) / 1000); // microseconds
    if (pred && ex.label === 1) tp++;
    else if (pred && ex.label === 0) fp++;
    else if (!pred && ex.label === 1) fn_++;
    else tn++;
  }
  const n = exs.length;
  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn_ > 0 ? tp / (tp + fn_) : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  const acc = n > 0 ? (tp + tn) / n : 0;
  times.sort((a, b) => a - b);
  const p50 = times[Math.floor(times.length * 0.5)] || 0;
  const p95 = times[Math.floor(times.length * 0.95)] || 0;
  const [plo, phi] = wilson(tp, tp + fp);
  const [rlo, rhi] = wilson(tp, tp + fn_);
  const [alo, ahi] = wilson(tp + tn, n);
  return { method: name, n, tp, fp, fn: fn_, tn, precision, recall, f1, accuracy: acc,
    precision_ci: [plo, phi], recall_ci: [rlo, rhi], accuracy_ci: [alo, ahi], p50_us: p50, p95_us: p95 };
}

const methods = { flag_every_change: methodFlagEveryChange, overlap: methodOverlap, compiler_signals: methodCompilerSignals };
const types = ['summary', 'param', 'returns', 'overall'];
const results = {};
for (const [mname, fn] of Object.entries(methods)) {
  results[mname] = {};
  for (const type of types) {
    const subset = type === 'overall' ? examples : examples.filter((e) => e.type === type);
    results[mname][type] = evalMethod(mname, fn, subset);
  }
}

console.log(JSON.stringify(results, null, 2));
console.error('--- summary table ---');
for (const [mname] of Object.entries(methods)) {
  for (const type of types) {
    const r = results[mname][type];
    console.error(`${mname.padEnd(18)} ${type.padEnd(9)} n=${String(r.n).padEnd(4)} P=${pct(r.precision)} R=${pct(r.recall)} F1=${pct(r.f1)} Acc=${pct(r.accuracy)} p50=${r.p50_us.toFixed(1)}us p95=${r.p95_us.toFixed(1)}us`);
  }
}
