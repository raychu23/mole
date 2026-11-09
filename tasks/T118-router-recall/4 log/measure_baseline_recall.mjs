#!/usr/bin/env node
// T118: measure routing recall@1/3/5 of the CURRENT (pre-change) router's BM25 ranking on all DEV
// splits (v3 dev=62, v4.1 dev=40; v4.2 has no dev split per the task brief, so it is excluded from
// tuning data and reserved entirely for a future frozen held-out comparison). Pure BM25 ranking --
// no LLM calls, no network, no cloned repos needed: v3's case diffs are embedded in
// cases_with_labels_v3.json, and its decision corpus text comes from records_arm2/ (synthetic
// records, same text the real T53 v3 run indexed per run_t53_semantic_route_v3.mjs:48-50). v4.1's
// decision corpus comes from the real cloned repos' docs/adr folders (still present at
// ~/.hermes/cache/scratch/m2v4/<repo>) via loadGraph, same as run_t53_semantic_route_v4_1.mjs.
//
// recall@k = fraction of cases with a real governing decision (adr_id !== 'none') whose target
// decision appears in BM25's own top-k ranked candidates (not the router's final 1-or-more pick,
// which depends on the confidence-ratio/LLM-fallback logic -- this measures the retrieval CEILING
// that stage 2 (or any change) can only pick from, exactly what the task asks: "right decision
// among those handed to the check").
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Bm25Index } from '/Users/a1/Desktop/CS Code/Project/Mole/packages/decisions/dist/src/route/bm25.js';
import { indexTextOf } from '/Users/a1/Desktop/CS Code/Project/Mole/packages/decisions/dist/src/route/index-text.js';
import { loadGraph } from '/Users/a1/Desktop/CS Code/Project/Mole/packages/decisions/dist/src/index.js';

const B2 = '/Users/a1/Desktop/CS Code/Project/Mole/context/product-plan/systems/metrics-proof/m2-conflict';
const INACTIVE = new Set(['superseded', 'deprecated', 'rejected', 'retired']);

function rankOf(idx, changeText, targetId) {
  const scored = idx.score(changeText).filter((h) => h.score > 0);
  const pos = scored.findIndex((h) => h.id === targetId);
  return { rank: pos === -1 ? null : pos + 1, topList: scored.slice(0, 5).map((h) => h.id), candidateCount: scored.length };
}

function summarize(rows) {
  const withTarget = rows.filter((r) => r.hasTarget);
  const n = withTarget.length;
  const atK = (k) => withTarget.filter((r) => r.rank !== null && r.rank <= k).length;
  const noneRows = rows.filter((r) => !r.hasTarget);
  const noneOK = noneRows.filter((r) => r.candidateCount === 0 || r.rank === null).length; // no false "hit" possible on BM25 ranking alone for none-cases
  return {
    n_with_target: n,
    recall_at_1: n ? +(atK(1) / n).toFixed(4) : null,
    recall_at_3: n ? +(atK(3) / n).toFixed(4) : null,
    recall_at_5: n ? +(atK(5) / n).toFixed(4) : null,
    n_none_cases: noneRows.length,
    miss_detail: withTarget.filter((r) => r.rank === null || r.rank > 5).map((r) => ({ id: r.id, repo: r.repo, adr_id: r.adr_id, rank: r.rank, candidateCount: r.candidateCount })),
  };
}

// ---- v3 dev ----
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
  const rows = cases.map((c) => {
    const idx = corpusByRepo[c.repo];
    const hasTarget = c.adr_id !== 'none';
    const changeText = c.diff ?? '';
    const r = hasTarget ? rankOf(idx, changeText, c.adr_id) : { rank: null, candidateCount: idx.score(changeText).length };
    return { id: c.id, repo: c.repo, adr_id: c.adr_id, hasTarget, rank: r.rank, candidateCount: r.candidateCount };
  });
  return { split: 'v3_dev', ...summarize(rows) };
}

// ---- v4.1 dev ----
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
    if (!existsSync(root)) { console.log(`SKIP ${repo}: not cloned at ${root}`); continue; }
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
  const rows = [];
  for (const c of cases) {
    const idx = corpusByRepo[c.repo];
    if (!idx) { rows.push({ id: c.id, repo: c.repo, adr_id: c.adr_id, hasTarget: false, rank: null, candidateCount: 0, skipped: true }); continue; }
    const hasTarget = c.adr_id !== 'none';
    const ourAdrNum = hasTarget ? c.adr_id.split('-').pop() : null;
    const changeText = c.diff ?? '';
    const scored = idx.score(changeText).filter((h) => h.score > 0);
    const pos = hasTarget ? scored.findIndex((h) => h.id === ourAdrNum || h.id === c.adr_id) : -1;
    rows.push({ id: c.id, repo: c.repo, adr_id: c.adr_id, hasTarget, rank: pos === -1 ? null : pos + 1, candidateCount: scored.length });
  }
  return { split: 'v4_1_dev', ...summarize(rows.filter((r) => !r.skipped)), skipped_cases: rows.filter((r) => r.skipped).length };
}

const results = { v3_dev: runV3Dev(), v4_1_dev: runV41Dev() };
console.log(JSON.stringify(results, null, 2));
writeFileSync(resolve(process.cwd(), 'baseline_recall.json'), JSON.stringify(results, null, 2));
