#!/usr/bin/env node
// T119 design-study: per-case BM25 router margin (top1/(top1+top2), same formula as route.ts's
// `confidence`) + candidate-set size on v3 dev (62) and v4.1 dev (40) -- the two dev splits, matching
// measure_baseline_recall.mjs's exact index-building code (same corpora, same BM25 params, no boosts:
// this is the DEPLOYED router's default state, scopeBoost/mentionBoost are opt-in/off). Zero-LLM,
// zero-network: a pure re-scoring of the same dev cases T118's baseline script already measured.
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Bm25Index } from '/Users/a1/Desktop/CS Code/Project/Mole/packages/decisions/dist/src/route/bm25.js';
import { indexTextOf } from '/Users/a1/Desktop/CS Code/Project/Mole/packages/decisions/dist/src/route/index-text.js';
import { loadGraph } from '/Users/a1/Desktop/CS Code/Project/Mole/packages/decisions/dist/src/index.js';

const B2 = '/Users/a1/Desktop/CS Code/Project/Mole/context/product-plan/systems/metrics-proof/m2-conflict';
const INACTIVE = new Set(['superseded', 'deprecated', 'rejected', 'retired']);

function margin(scored) {
  const top1 = scored[0]?.score ?? 0;
  const top2 = scored[1]?.score ?? 0;
  return top1 + top2 > 0 ? top1 / (top1 + top2) : 1; // same formula + same edge case as route.ts
}

function row(c, idx, hasTarget, targetId) {
  const scored = idx.score(c.diff ?? '').filter((h) => h.score > 0);
  const pos = hasTarget ? scored.findIndex((h) => h.id === targetId) : -1;
  return {
    id: c.id, repo: c.repo, adr_id: c.adr_id, hasTarget,
    candidateCount: scored.length,
    zeroCandidates: scored.length === 0,
    margin: margin(scored),
    rank: pos === -1 ? null : pos + 1,
    top1_hit: pos === 0,
  };
}

function runV3Dev() {
  const cases = JSON.parse(readFileSync(resolve(B2, 'v3/cases_with_labels_v3.json'), 'utf8')).filter((c) => c.split === 'dev');
  const REPOS = [...new Set(cases.map((c) => c.repo))];
  const corpusByRepo = {};
  for (const repo of REPOS) {
    const recordsRoot = resolve(B2, 'v3/run/records_arm2', repo);
    const graph = loadGraph(recordsRoot);
    const idx = new Bm25Index();
    for (const n of graph.nodes) {
      if (n.kind !== 'decision' || INACTIVE.has(n.status)) continue;
      const text = readFileSync(resolve(recordsRoot, n.file), 'utf8');
      idx.add(n.id, indexTextOf(n.title, text));
    }
    corpusByRepo[repo] = idx;
  }
  return cases.map((c) => row(c, corpusByRepo[c.repo], c.adr_id !== 'none', c.adr_id));
}

function runV41Dev() {
  const cases = JSON.parse(readFileSync(resolve(B2, 'v4.1/cases_with_labels_v4_1.json'), 'utf8')).filter((c) => c.split === 'dev');
  const REPO_PATHS = {
    'claw-operator': '/Users/a1/.hermes/cache/scratch/m2v4/claw-operator',
    handbook: '/Users/a1/.hermes/cache/scratch/m2v4/handbook',
    'merino-py': '/Users/a1/.hermes/cache/scratch/m2v4/merino-py',
    'hmrc-frontend': '/Users/a1/.hermes/cache/scratch/m2v4/hmrc-frontend',
  };
  const ADR_DIRS = ['docs/adr'];
  const corpusByRepo = {};
  for (const [repo, root] of Object.entries(REPO_PATHS)) {
    if (!existsSync(root)) continue;
    const graph = loadGraph(root, { adrDirs: ADR_DIRS });
    const idx = new Bm25Index();
    for (const n of graph.nodes) {
      if (n.kind !== 'decision' || INACTIVE.has(n.status)) continue;
      const abs = resolve(root, n.file);
      const text = existsSync(abs) ? readFileSync(abs, 'utf8') : '';
      idx.add(n.id, indexTextOf(n.title, text));
    }
    corpusByRepo[repo] = idx;
  }
  const out = [];
  for (const c of cases) {
    const idx = corpusByRepo[c.repo];
    if (!idx) continue;
    const hasTarget = c.adr_id !== 'none';
    const targetId = hasTarget ? c.adr_id.split('-').pop() : null;
    out.push(row(c, idx, hasTarget, targetId));
  }
  return out;
}

const v3 = runV3Dev().map((r) => ({ ...r, split: 'v3_dev' }));
const v41 = runV41Dev().map((r) => ({ ...r, split: 'v4_1_dev' }));
const all = [...v3, ...v41];
writeFileSync('/Users/a1/.hermes/cache/scratch/t119_margin_rows.json', JSON.stringify(all, null, 2));

const THRESHOLDS = [0.55, 0.60, 0.65, 0.70, 0.75];
function summarize(rows, label) {
  const withTarget = rows.filter((r) => r.hasTarget);
  const misses = withTarget.filter((r) => !r.top1_hit); // recall@1 miss: current router's pick would be wrong
  const noneRows = rows.filter((r) => !r.hasTarget);
  console.log(`\n=== ${label} ===`);
  console.log(`n_with_target=${withTarget.length} n_recall@1_misses=${misses.length} n_none=${noneRows.length}`);
  console.log(`misses with zeroCandidates (no decision routes at all): ${misses.filter((r) => r.zeroCandidates).length}`);
  console.log(`none-cases with zeroCandidates: ${noneRows.filter((r) => r.zeroCandidates).length}`);
  for (const t of THRESHOLDS) {
    const missesCaught = misses.filter((r) => r.zeroCandidates || r.margin < t).length;
    const noneEscalated = noneRows.filter((r) => !r.zeroCandidates && r.margin < t).length; // FA risk: ambiguous-but-nonzero none cases
    const hitsAlsoEscalated = withTarget.filter((r) => r.top1_hit && (r.zeroCandidates || r.margin < t)).length; // correct picks that ALSO escalate (pure extra cost, no recall benefit)
    console.log(`  threshold ${t}: misses_triggered=${missesCaught}/${misses.length}  none_triggered(FA risk)=${noneEscalated}/${noneRows.length}  correct_picks_also_triggered(extra cost only)=${hitsAlsoEscalated}/${withTarget.length - misses.length}`);
  }
}
summarize(v3, 'v3_dev (n=62 total cases)');
summarize(v41, 'v4_1_dev (n=40 total cases)');
summarize(all, 'POOLED dev (v3_dev + v4_1_dev)');

// per-miss detail for write-up
console.log('\n--- miss detail (pooled) ---');
for (const r of all.filter((r) => r.hasTarget && !r.top1_hit)) {
  console.log(JSON.stringify({ id: r.id, split: r.split, margin: +r.margin.toFixed(4), zeroCandidates: r.zeroCandidates, rank: r.rank, candidateCount: r.candidateCount }));
}
