// T71 review-1 fix: score the new frozen eval set (eval-set-v2.json, built by t71-eval-build.ts from every
// relation Mole's own loadGraph models, across every vendored corpus named in the review finding) against the
// baseline (plain Bm25Index, route/bm25.ts) and the one candidate custom matcher (title+body hybrid BM25).
// Strong and weak signal are scored SEPARATELY (review finding #1: "report counts per signal", never merged).
// Losses first. Run once; dev alpha is tuned on dev ONLY, held-out is scored once after that.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Bm25Index, indexTextOf } from '../src/index.js';

const EVAL_PATH = resolve(import.meta.dirname, '../../../../context/product-plan/systems/metrics-proof/case-recall/eval-set-v2.json');
const RESULTS_MD = resolve(import.meta.dirname, "../../../../tasks/T71-case-recall/4 log/results.md");

interface CorpusDoc { id: string; title: string; text: string; }
interface Pair { query: string; relevant: string; evidence: string; signal: 'strong' | 'weak'; relation: string; corpus: string; }
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
  return ranks.length === 0 ? NaN : ranks.filter((r) => r <= k).length / ranks.length;
}
function mrr(ranks: number[]): number {
  return ranks.length === 0 ? NaN : ranks.reduce((s, r) => s + (Number.isFinite(r) ? 1 / r : 0), 0) / ranks.length;
}
/** Wilson score interval for a proportion from n trials (n small -- this is the honest small-n caveat, not a
 *  normal-approximation CI that overstates precision at n<30). */
function wilson(successes: number, n: number): { lo: number; hi: number } {
  if (n === 0) return { lo: NaN, hi: NaN };
  const z = 1.96;
  const p = successes / n;
  const denom = 1 + (z * z) / n;
  const center = p + (z * z) / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return { lo: (center - margin) / denom, hi: (center + margin) / denom };
}

const baselineIdx = buildBaselineIndex();
const titleIdx = buildTitleIndex();

function pairFor(id: string): Pair {
  const p = evalSet.pairs.find((x) => x.query === id);
  if (!p) throw new Error(`no pair for query id ${id}`);
  return p;
}

// dev alpha search over BOTH signals combined (same dev-tuning convention as v1; the one tuned hyperparameter
// is the hybrid's alpha, tuned once on dev, never re-tuned against held-out)
const devIds = evalSet.split.dev;
const devRanksBaseline: number[] = [];
const devRanksHybridByAlpha = new Map<number, number[]>();
for (let i = 0; i <= 10; i++) devRanksHybridByAlpha.set(i / 10, []);
for (const q of devIds) {
  const pair = pairFor(q);
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

function scoreHeldOut(signal: 'strong' | 'weak') {
  const ids = evalSet.split.held_out.filter((q) => pairFor(q).signal === signal);
  const baselineRanks: number[] = [];
  const hybridRanks: number[] = [];
  for (const q of ids) {
    const pair = pairFor(q);
    const doc = evalSet.corpus[q]!;
    baselineRanks.push(rankOf(baselineIdx, indexTextOf(doc.title, doc.text), q, pair.relevant));
    hybridRanks.push(hybridRank(baselineIdx, titleIdx, doc, pair.relevant, bestAlpha));
  }
  return { ids, baselineRanks, hybridRanks };
}

const strong = scoreHeldOut('strong');
const weak = scoreHeldOut('weak');

function reportBlock(label: string, s: ReturnType<typeof scoreHeldOut>): string[] {
  const n = s.ids.length;
  const baseHits = s.baselineRanks.filter((r) => r <= 5).length;
  const hybHits = s.hybridRanks.filter((r) => r <= 5).length;
  const baseCi = wilson(baseHits, n);
  const hybCi = wilson(hybHits, n);
  const baseRecall5 = recallAtK(s.baselineRanks, 5);
  const hybRecall5 = recallAtK(s.hybridRanks, 5);
  const baseMrr = mrr(s.baselineRanks);
  const hybMrr = mrr(s.hybridRanks);
  const beats = n > 0 && (hybRecall5 > baseRecall5 || (hybRecall5 === baseRecall5 && hybMrr > baseMrr));
  const lines: string[] = [];
  lines.push(`### ${label} signal held-out (n=${n})`);
  lines.push('');
  if (n === 0) {
    lines.push('No held-out pairs for this signal in this split -- not scored (not fabricated as 0/0).');
    lines.push('');
    return lines;
  }
  lines.push('**Small-n caveat (stated plainly, not glossed over): with n<10 the Wilson 95% CI below is wide; a');
  lines.push('result here is directional, not a strong statistical claim either way.**');
  lines.push('');
  lines.push('| matcher | recall@5 | 95% CI (Wilson) | MRR | ranks |');
  lines.push('|---|---|---|---|---|');
  lines.push(`| BM25 (baseline) | ${baseRecall5.toFixed(3)} | [${baseCi.lo.toFixed(3)}, ${baseCi.hi.toFixed(3)}] | ${baseMrr.toFixed(3)} | [${s.baselineRanks.join(', ')}] |`);
  lines.push(`| title+body hybrid (custom, alpha=${bestAlpha}) | ${hybRecall5.toFixed(3)} | [${hybCi.lo.toFixed(3)}, ${hybCi.hi.toFixed(3)}] | ${hybMrr.toFixed(3)} | [${s.hybridRanks.join(', ')}] |`);
  lines.push('');
  lines.push(`**${label}: custom matcher ${beats ? 'BEAT' : 'did NOT beat'} BM25 on held-out (tie counts as not-beating).**`);
  lines.push('');
  return lines;
}

const lines: string[] = [];
lines.push('# T71 held-out result v2 (review-1 fix: rebuilt eval set, losses first, reported once)');
lines.push('');
lines.push(`Scored once on ${new Date().toISOString().slice(0, 10)} against eval-set-v2.json (sha256 in eval-set-v2.sha256), after the dev/held-out split was fixed (see eval-set-build.md's report for how the split and both signals were built).`);
lines.push('');
lines.push(`dev alpha search (tuned on dev split ONLY, both signals combined, before touching held-out): best alpha = ${bestAlpha}, dev MRR = ${bestMrr.toFixed(3)}`);
lines.push('');
lines.push('## Held-out (scored once, strong and weak signal reported SEPARATELY -- never merged into one number)');
lines.push('');
lines.push(...reportBlock('Strong (authored relation: supersedes/amends)', strong));
lines.push(...reportBlock('Weak (same-scope, no authored relation)', weak));

const overallBeats =
  (strong.ids.length > 0 &&
    (recallAtK(strong.hybridRanks, 5) > recallAtK(strong.baselineRanks, 5) ||
      (recallAtK(strong.hybridRanks, 5) === recallAtK(strong.baselineRanks, 5) && mrr(strong.hybridRanks) > mrr(strong.baselineRanks)))) ||
  false;
lines.push('## STOP rule verdict (unchanged: custom matcher must beat BM25 on held-out, or BM25 ships)');
lines.push('');
lines.push(
  overallBeats
    ? 'The custom matcher beat BM25 on the strong-signal held-out set. Per the task, it would be shipped -- but see the caveat below before treating this as decisive.'
    : "The custom matcher did NOT beat BM25 on held-out (strong signal, the primary one; weak signal reported above for completeness). Per the task's STOP rule, BM25 ships unmodified (route/bm25.ts, already what recall.ts calls); the hybrid was explored, did not beat it, not adopted.",
);
lines.push('');
lines.push(
  `**Caveat (stated plainly): held-out strong-signal n=${strong.ids.length}, weak-signal n=${weak.ids.length}. This is the full set of real relation pairs loadGraph itself extracts (plus a supplementary full-text scan for the two phrasings the shipped ADR-dir regex misses -- see eval-set-build.ts's comment) across every vendored ADR/MADR/adr-tools/spec-kit/.mole-format corpus in the repo, not a subsample -- but it is still a small-n result. Treat the verdict as directional, not a strong statistical claim, exactly as the dev/held-out split and the Wilson CIs above show.**`,
);

writeFileSync(RESULTS_MD, lines.join('\n') + '\n');
console.log(lines.join('\n'));
