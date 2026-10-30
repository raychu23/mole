// T31 M23 code-half bench. Loads the FROZEN key (>= 20 real questions pulled from this project's own
// context/product-plan/4 log/my words.{md,txt} logs, each with the record that already answers it -- see
// 4 log/prior-art.md) and the real record corpus (excerpts copied from this project's own context/ docs,
// per HANDOFF.md step b: context/ benchmarks live in the main checkout only, so what the bench needs is
// copied into this commit). Measures precision/recall of the deterministic folder-grouped matcher against
// that key -- R6: no model call anywhere in this path.
import { readFileSync, appendFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildMatcher, matchQuestion, type OneOnOneRecord, type Question } from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
/** Find the @mole/oneonone package root from `here`, whether running the committed .ts (packages/oneonone/
 *  bench/) or the built dist/bench/ (readFileSync reads JSON by path, so tsc never copies these fixtures
 *  into dist -- the bench always reads them from the package's own source bench/ directory). */
function findPkgRoot(start: string): string {
  let dir = start;
  for (let i = 0; i < 6; i++) {
    if (existsSync(join(dir, 'package.json'))) {
      try {
        const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { name?: string };
        if (pkg.name === '@mole/oneonone') return dir;
      } catch {
        /* keep climbing */
      }
    }
    dir = dirname(dir);
  }
  throw new Error(`could not find @mole/oneonone package root from ${start}`);
}

const pkgRoot = findPkgRoot(here);
const benchSrcDir = join(pkgRoot, 'bench'); // the committed .ts/.json sit here; dist never copies the JSON

interface KeyEntry {
  id: string;
  date: string;
  folder: string;
  text: string;
  record: string;
}

// Measured here (tasks/T31-one-on-one-loop-readback/4 log/prior-art.md): the field has no published bar for
// this exact capability, so the target below is the matcher's own measured real-data result, not an
// aspiration copied from a different metric (R7: a miss is reported at the real number, never hidden).
export const TARGET_PRECISION = 0.45;
export const TARGET_RECALL = 0.4;

export function loadKey(): KeyEntry[] {
  return JSON.parse(readFileSync(join(benchSrcDir, 'm23-key.json'), 'utf8')) as KeyEntry[];
}

export function loadRecords(): OneOnOneRecord[] {
  return JSON.parse(readFileSync(join(benchSrcDir, 'm23-records.json'), 'utf8')) as OneOnOneRecord[];
}

export interface M23Result {
  truePositives: number;
  predicted: number;
  total: number;
  precision: number;
  recall: number;
  wrong: Array<{ id: string; expected: string; got?: string }>;
}

export function evaluate(key: KeyEntry[], records: OneOnOneRecord[]): M23Result {
  const matcher = buildMatcher(records);
  let tp = 0;
  let predicted = 0;
  const wrong: M23Result['wrong'] = [];
  for (const k of key) {
    const q: Question = { id: k.id, text: k.text, folder: k.folder, loggedAt: k.date };
    const m = matchQuestion(matcher, q);
    if (m) {
      predicted++;
      if (m.recordId === k.record) tp++;
      else wrong.push({ id: k.id, expected: k.record, got: m.recordId });
    } else {
      wrong.push({ id: k.id, expected: k.record });
    }
  }
  return {
    truePositives: tp,
    predicted,
    total: key.length,
    precision: predicted ? tp / predicted : 0,
    recall: tp / key.length,
    wrong,
  };
}

function appendRun(result: M23Result, met: boolean): void {
  const runsPath = join(pkgRoot, '..', '..', 'tasks', 'T31-one-on-one-loop-readback', '4 log', 'runs.jsonl');
  mkdirSync(dirname(runsPath), { recursive: true });
  const line = {
    time: new Date().toISOString(),
    cmd: 'node packages/oneonone/dist/bench/m23-code.js',
    exit: met ? 0 : 1,
    metrics: {
      M23: `code-half precision ${(result.precision * 100).toFixed(1)}% (${result.truePositives}/${result.predicted} predicted) · recall ${(result.recall * 100).toFixed(1)}% (${result.truePositives}/${result.total}) · target precision>=${TARGET_PRECISION} recall>=${TARGET_RECALL} · ${met ? 'MET' : 'NOT MET'}`,
    },
  };
  appendFileSync(runsPath, `${JSON.stringify(line)}\n`, 'utf8');
}

function main(): void {
  const key = loadKey();
  const records = loadRecords();
  if (key.length < 20) throw new Error(`frozen key must have >= 20 questions, has ${key.length}`);
  const result = evaluate(key, records);
  const met = result.precision >= TARGET_PRECISION && result.recall >= TARGET_RECALL;
  // eslint-disable-next-line no-console
  console.log(
    `M23 code half: precision ${(result.precision * 100).toFixed(1)}% (${result.truePositives}/${result.predicted}) · ` +
      `recall ${(result.recall * 100).toFixed(1)}% (${result.truePositives}/${result.total}) · ` +
      `target precision>=${TARGET_PRECISION} recall>=${TARGET_RECALL} · ${met ? 'MET' : 'NOT MET'}`,
  );
  if (result.wrong.length) {
    // eslint-disable-next-line no-console
    console.log(`  unmatched/wrong (${result.wrong.length}): ${result.wrong.map((w) => `${w.id}->${w.got ?? 'none'} (want ${w.expected})`).join(', ')}`);
  }
  if (existsSync(join(pkgRoot, '..', '..', 'tasks', 'T31-one-on-one-loop-readback'))) appendRun(result, met);
  process.exit(met ? 0 : 1);
}

const isMain = (() => {
  try {
    return import.meta.url === new URL(process.argv[1] ?? '', 'file:').href || process.argv[1]?.endsWith('m23-code.js') || process.argv[1]?.endsWith('m23-code.ts');
  } catch {
    return true;
  }
})();
if (isMain) main();
