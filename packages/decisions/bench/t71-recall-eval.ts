// T71: score the frozen held-out eval set (context/product-plan/systems/metrics-proof/case-recall/eval-set.json)
// against the baseline (plain Bm25Index, route/bm25.ts) and the one candidate custom matcher (title+body hybrid
// BM25 -- two Bm25Index instances, one over titles only, one over full index text, combined by min-max
// normalized score at a dev-tuned alpha). Run once; dev alpha is tuned on the dev split ONLY, held-out is
// scored once after that and never re-tuned against it. Node script (not vitest): this is a one-shot
// measurement against a frozen artifact, reusing the SAME compiled Bm25Index the shipped code uses -- no
// reimplementation of BM25 in a second language.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Bm25Index, indexTextOf } from '../src/index.js';

const EVAL_PATH = resolve(import.meta.dirname, '../../../../context/product-plan/systems/metrics-proof/case-recall/eval-set.json');
const RESULTS_MD = resolve(import.meta.dirname, "../../../../tasks/T71-case-recall/4 log/results.md");

interface CorpusDoc { id: string; title: string; text: string; }
interface Pair { query: string; relevant: string; evidence: string; }
interface EvalSet { corpus: Record<string, CorpusDoc>; pairs: Pair[]; split: { dev: string[]; held_out: string[] }; }

const evalSet: EvalSet = JSON.parse(readFileSync(EVAL_PATH, 'utf8'));

function rankOf(idx: Bm25Index, queryText: string, excludeId: string, relevantId: string): number {
  const hits = idx.score(queryText).filter((h) => h.id !== excludeId);
  const pos = hits.findIndex((h) => h.id === relevantId);
  return pos === -1 ? Infinity : pos + 1;
}

function buildBaselineIndex(): Bm25Index {
  const idx = new Bm25Index();
  for (const doc of Object.values(evalSet.corpus)) idx.add(doc.id, indexTextOf(doc.title, doc.text));
  return idx;
}

function buildTitleIndex(): Bm25Index {
  const idx = new Bm25Index();
  for (const doc of Object.values(evalSet.corpus)) idx.add(doc.id, doc.title);
  return idx;
}

function normalize(hits: { id: string; score: number }[]): Map<string, number> {
  const vals = hits.map((h) => h.score);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const m = new Map<string, number>();
  for (const h of hits) m.set(h.id, hi === lo ? 0 : (h.score - lo) / (hi - lo));
  return m;
}

function hybridRank(bodyIdx: Bm25Index, titleIdx: Bm25Index, doc: CorpusDoc, relevantId: string, alpha: number): number {
  const bodyHits = bodyIdx.score(indexTextOf(doc.title, doc.text));
  const titleHits = titleIdx.score(doc.title);
  const bn = normalize(bodyHits);
  const tn = normalize(titleHits);
  const ids = new Set([...bn.keys(), ...tn.keys()]);
  ids.delete(doc.id);
  const combo = [...ids].map((id) => ({ id, score: alpha * (tn.get(id) ?? 0) + (1 - alpha) * (bn.get(id) ?? 0) }));
  combo.sort((a, b) => b.score - a.score);
  const pos = combo.findIndex((c) => c.id === relevantId);
  return pos === -1 ? Infinity : pos + 1;
}

function recallAtK(ranks: number[], k: number): number {
  return ranks.filter((r) => r <= k).length / ranks.length;
}
function mrr(ranks: number[]): number {
  return ranks.reduce((s, r) => s + (Number.isFinite(r) ? 1 / r : 0), 0) / ranks.length;
}

const baselineIdx = buildBaselineIndex();
const titleIdx = buildTitleIndex();

const devRanksBaseline: number[] = [];
const devRanksHybridByAlpha = new Map<number, number[]>();
for (const a10 of Array.from({ length: 11 }, (_, i) => i)) devRanksHybridByAlpha.set(a10 / 10, []);

for (const q of evalSet.split.dev) {
  const pair = evalSet.pairs.find((p) => p.query === q)!;
  const doc = evalSet.corpus[q]!;
  devRanksBaseline.push(rankOf(baselineIdx, indexTextOf(doc.title, doc.text), q, pair.relevant));
  for (const [alpha, arr] of devRanksHybridByAlpha) arr.push(hybridRank(baselineIdx, titleIdx, doc, pair.relevant, alpha));
}

let bestAlpha = 0;
let bestMrr = -1;
for (const [alpha, ranks] of devRanksHybridByAlpha) {
  const m = mrr(ranks);
  if (m > bestMrr) {
    bestMrr = m;
    bestAlpha = alpha;
  }
}

const heldOutBaselineRanks: number[] = [];
const heldOutHybridRanks: number[] = [];
for (const q of evalSet.split.held_out) {
  const pair = evalSet.pairs.find((p) => p.query === q)!;
  const doc = evalSet.corpus[q]!;
  heldOutBaselineRanks.push(rankOf(baselineIdx, indexTextOf(doc.title, doc.text), q, pair.relevant));
  heldOutHybridRanks.push(hybridRank(baselineIdx, titleIdx, doc, pair.relevant, bestAlpha));
}

const baselineRecall5 = recallAtK(heldOutBaselineRanks, 5);
const baselineMrr = mrr(heldOutBaselineRanks);
const hybridRecall5 = recallAtK(heldOutHybridRanks, 5);
const hybridMrr = mrr(heldOutHybridRanks);
const hybridBeatsBaseline = hybridRecall5 > baselineRecall5 || (hybridRecall5 === baselineRecall5 && hybridMrr > baselineMrr);

const lines: string[] = [];
lines.push('# T71 held-out result (losses first, reported once)');
lines.push('');
lines.push(`Scored once on ${new Date().toISOString().slice(0, 10)} against the frozen eval set (sha256 in eval-set.sha256), after the dev/held-out split was fixed.`);
lines.push('');
lines.push(`dev alpha search (tuned on dev split ONLY, before touching held-out): best alpha = ${bestAlpha}, dev MRR = ${bestMrr.toFixed(3)}, dev ranks (hybrid) = [${devRanksHybridByAlpha.get(bestAlpha)!.join(', ')}], dev ranks (baseline) = [${devRanksBaseline.join(', ')}]`);
lines.push('');
lines.push('## Held-out (scored once)');
lines.push('');
lines.push('| matcher | recall@5 | MRR | ranks |');
lines.push('|---|---|---|---|');
lines.push(`| BM25 (baseline, route/bm25.ts, unmodified) | ${baselineRecall5.toFixed(3)} | ${baselineMrr.toFixed(3)} | [${heldOutBaselineRanks.join(', ')}] |`);
lines.push(`| title+body hybrid BM25 (custom, alpha=${bestAlpha}) | ${hybridRecall5.toFixed(3)} | ${hybridMrr.toFixed(3)} | [${heldOutHybridRanks.join(', ')}] |`);
lines.push('');
lines.push(`**Result: the custom matcher ${hybridBeatsBaseline ? 'BEAT' : 'did NOT beat'} BM25 on held-out (tie counts as not-beating).**`);
lines.push('');
lines.push(hybridBeatsBaseline
  ? 'Per the task, the custom matcher is shipped.'
  : 'Per the task\'s STOP rule, we ship BM25 unmodified (route/bm25.ts, already the production code recall.ts calls) and say so: the hybrid was explored, tied on held-out, not adopted.');
lines.push('');
lines.push('Caveat (stated plainly): the frozen held-out split has exactly 1 query (3 real superseded-ADR pairs total; 2 dev / 1 held-out -- see eval-set-build.md for why this is the full set of real relevance labels available, not a subsample). A result on n=1 is not a strong statistical claim either way; it is reported as-is, losses first, per the task\'s own instruction, not dressed up.');

writeFileSync(RESULTS_MD, lines.join('\n') + '\n');
console.log(lines.join('\n'));
