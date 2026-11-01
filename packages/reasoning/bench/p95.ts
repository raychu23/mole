// p95 bench (T42): grounded evaluate() on 10k-argument random graphs, plus
// IncrementalEvaluator single-edit p95, appended to
// tasks/T42-reasoning-engine/4 log/runs.jsonl. 0 model calls anywhere here.
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluate } from '../src/engine.js';
import { IncrementalEvaluator } from '../src/incremental.js';
import type { Framework } from '../src/types.js';

const here = dirname(fileURLToPath(import.meta.url));
const benchDir = here.endsWith(join('dist', 'bench')) ? join(here, '..', '..', 'bench') : here;
const taskDir = resolve(benchDir, '../../../tasks/T42-reasoning-engine');
const logDir = join(taskDir, '4 log');
mkdirSync(logDir, { recursive: true });

const arg = (name: string, fallback: string): string => {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
};
const runsOut = arg('--runs-out', join(logDir, 'runs.jsonl'));
const n = Number(arg('--args', '10000'));
const trials = Number(arg('--trials', '30'));

function makeRng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 0xffffffff;
  };
}

function randomFramework(size: number, rng: () => number, attacksPerArg: number): Framework {
  const args = Array.from({ length: size }, (_, i) => ({ id: `n${i}` }));
  const attacks: [string, string][] = [];
  for (let i = 0; i < size; i++) {
    for (let k = 0; k < attacksPerArg; k++) {
      const j = Math.floor(rng() * size);
      if (j !== i) attacks.push([`n${i}`, `n${j}`]);
    }
  }
  return { args, attacks };
}

function percentile(sorted: number[], p: number): number {
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx]!;
}

function nowMs(): number {
  return Number(process.hrtime.bigint()) / 1e6;
}

// --- full evaluate() p95 on size-n random graphs ---
const fullTimes: number[] = [];
let framework!: Framework;
for (let t = 0; t < trials; t++) {
  const rng = makeRng(1000 + t);
  framework = randomFramework(n, rng, 2);
  const start = nowMs();
  evaluate(framework);
  fullTimes.push(nowMs() - start);
}
fullTimes.sort((a, b) => a - b);

// --- incremental single-edit p95: build once, then time addAttack/removeAttack ---
const rngInc = makeRng(42);
const incFramework = randomFramework(n, rngInc, 2);
const ev = new IncrementalEvaluator(incFramework);
const incTimes: number[] = [];
for (let t = 0; t < trials; t++) {
  const from = `n${Math.floor(rngInc() * n)}`;
  const to = `n${Math.floor(rngInc() * n)}`;
  const start = nowMs();
  ev.addAttack(from, to);
  incTimes.push(nowMs() - start);
  ev.removeAttack(from, to);
}
incTimes.sort((a, b) => a - b);

const report = {
  tool: 'packages/reasoning bench/p95.ts',
  at: new Date().toISOString(),
  args: n,
  trials,
  full_evaluate_ms: {
    p50: percentile(fullTimes, 50),
    p95: percentile(fullTimes, 95),
    p99: percentile(fullTimes, 99),
    max: fullTimes[fullTimes.length - 1],
  },
  incremental_single_edit_ms: {
    p50: percentile(incTimes, 50),
    p95: percentile(incTimes, 95),
    p99: percentile(incTimes, 99),
    max: incTimes[incTimes.length - 1],
  },
};

mkdirSync(dirname(runsOut), { recursive: true });
appendFileSync(runsOut, `${JSON.stringify(report)}\n`);
console.log(JSON.stringify(report, null, 2));
