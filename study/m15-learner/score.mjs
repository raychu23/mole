// Scores responses.json -> per-arm accuracy and time, paired by participant.
//   node study/m15-learner/score.mjs study/m15-learner/responses.json [keys.json]
// responses.json: [{ "participant": "P1", "arm": "mole"|"none"|"transfer-after-mole"|"transfer-after-none", "task": "T05", "answer": [...]|{...}, "seconds": 212 }]
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const loadKeys = (p = join(here, 'keys.json')) => JSON.parse(readFileSync(p, 'utf8'));
const norm = (x) => String(x).replace(/^\.?\//, '').trim();

export function scoreOne(task, answer, keyFile = loadKeys()) {
  const k = keyFile.tasks[task]?.key;
  if (!k) throw new Error(`no key for task ${task}`);
  if (k.kind === 'set') {
    const got = new Set((Array.isArray(answer) ? answer : []).map(norm));
    const want = new Set(k.items.map(norm));
    const tp = [...got].filter((x) => want.has(x)).length;
    const p = got.size ? tp / got.size : 0;
    const r = want.size ? tp / want.size : 0;
    return p + r ? (2 * p * r) / (p + r) : 0;
  }
  if (k.kind === 'path') {
    const names = Array.isArray(answer) ? answer.map(String) : [];
    const g = keyFile.callGraph;
    const edgesOk = names.slice(0, -1).every((a, i) => (g[a] ?? []).includes(names[i + 1]));
    return names.length === k.length && names[0] === k.start && names.at(-1) === k.end && edgesOk && new Set(names).size === names.length ? 1 : 0;
  }
  throw new Error(`unsupported key kind ${k.kind}`);
}

const med = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null;
};
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const r2 = (x) => (x === null ? null : +x.toFixed(3));

export function summarise(rowsIn, keyFile = loadKeys()) {
  const scored = rowsIn.map((r) => ({ ...r, f1: scoreOne(r.task, r.answer, keyFile) }));
  const arms = [...new Set(scored.map((r) => r.arm))].sort();
  const perArm = Object.fromEntries(arms.map((a) => {
    const rs = scored.filter((r) => r.arm === a);
    return [a, { participants: new Set(rs.map((r) => r.participant)).size, rows: rs.length, meanF1: r2(mean(rs.map((r) => r.f1))), medianSeconds: med(rs.map((r) => r.seconds)), exactRate: r2(rs.filter((r) => r.f1 === 1).length / rs.length) }];
  }));
  // paired by participant: mean F1 / median seconds in each arm, then the difference
  const pairDiff = (armA, armB) => {
    const ids = [...new Set(scored.map((r) => r.participant))];
    const d = [];
    for (const id of ids) {
      const a = scored.filter((r) => r.participant === id && r.arm === armA);
      const b = scored.filter((r) => r.participant === id && r.arm === armB);
      if (a.length && b.length) d.push({ participant: id, f1: mean(a.map((r) => r.f1)) - mean(b.map((r) => r.f1)), seconds: med(a.map((r) => r.seconds)) - med(b.map((r) => r.seconds)) });
    }
    return { n: d.length, meanF1Diff: r2(mean(d.map((x) => x.f1))), medianSecondsDiff: med(d.map((x) => x.seconds)), participantsBetter: d.filter((x) => x.f1 > 0).length, participantsWorse: d.filter((x) => x.f1 < 0).length };
  };
  const comparisons = { 'mole - none (during tasks)': pairDiff('mole', 'none'), 'transfer: after-mole - after-none': pairDiff('transfer-after-mole', 'transfer-after-none') };
  const n = new Set(scored.map((r) => r.participant)).size;
  return { participants: n, perArm, comparisons, caution: n < 8 ? `n=${n} participants: descriptive only, no significance claim; report each person's result` : 'n>=8: still one repo and one task style' };
}

if (process.argv[1] && process.argv[1].endsWith('score.mjs')) {
  const rows = JSON.parse(readFileSync(process.argv[2] ?? join(here, 'responses.json'), 'utf8'));
  console.log(JSON.stringify(summarise(rows, loadKeys(process.argv[3])), null, 2));
}
