#!/usr/bin/env node
// T110 (Q4) T53 arm: real-history case set, same semantic-routed check + frozen hyperparameters as
// v2/v3 (k=5, minScore=0, confidenceRatio=1.01, haiku router). Uses MAIN's built packages/decisions/dist
// (same convention v3's run script used). Runs once on all 7 frozen cases. Resumable.
import { cascadeCheck, hermesLlmClient, loadGraph, indexTextOf, oneLineSummaryOf } from '/Users/a1/Desktop/CS Code/Project/Mole/packages/decisions/dist/src/index.js';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const TASK = resolve(here, '..');
const CASES = JSON.parse(readFileSync(resolve(TASK, 'cases_h2.json'), 'utf8'));
const ROOT = '/Users/a1/.hermes/cache/scratch/t110/repo'; // shallow per-commit fetch of backstage, see 4 log/prior-art.md
const RECORDS_ROOT = resolve(TASK, 'run/records_backstage');

const ADR_TEXT = {
  adr003: readFileSync('/Users/a1/.hermes/cache/scratch/t110/adrs/adr003.md', 'utf8'),
  adr004: readFileSync('/Users/a1/.hermes/cache/scratch/t110/adrs/adr004.md', 'utf8'),
};
const decisionTextOf = (id) => ADR_TEXT[id];

const TOPK = 5, MIN_SCORE = 0, CONF_RATIO = 1.01, ROUTE_MODEL = 'claude-haiku-4-5';
const out = resolve(here, 'arm_t53_h2.json');
const results = existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')) : [];
const done = new Set(results.map((r) => r.id));

const escalateLlm = hermesLlmClient();
const routeLlm = hermesLlmClient({ model: ROUTE_MODEL });

const graph = loadGraph(RECORDS_ROOT);
const decisions = [];
for (const n of graph.nodes) {
  if (n.kind !== 'decision') continue;
  if (['superseded', 'deprecated', 'rejected', 'retired'].includes(n.status)) continue;
  const text = ADR_TEXT[n.id] ?? readFileSync(resolve(RECORDS_ROOT, n.file), 'utf8');
  decisions.push({ id: n.id, title: n.title, summary: oneLineSummaryOf(n.title, text), text: indexTextOf(n.title, text) });
}
console.log('decision corpus size (backstage, real v3 .mole records):', decisions.length);

for (const c of CASES) {
  if (done.has(c.id)) continue;
  const t0 = Date.now();
  let r, errMsg;
  try {
    r = await cascadeCheck({
      root: ROOT, base: `c-${c.base}`, head: `c-${c.head}`, recordsRoot: RECORDS_ROOT,
      llm: escalateLlm, decisionText: decisionTextOf,
      semanticRoute: { decisions, topK: TOPK, minScore: MIN_SCORE, confidenceRatio: CONF_RATIO, llm: routeLlm },
    });
  } catch (e) {
    errMsg = String(e && e.stack ? e.stack : e);
  }
  const ms = Date.now() - t0;
  const verdicts = r ? r.verdicts : [];
  const routing = r ? r.routing : [];
  const target = verdicts.find((v) => v.decision === c.adr_id);
  const flaggedTarget = !!target && target.flag === 'violates';
  const predictedViolate = flaggedTarget;
  const llmCalls = verdicts.filter((v) => v.tier === 'llm' && v.usage);
  const escalateCost = llmCalls.reduce((s, v) => s + (v.usage?.costUsd ?? 0), 0);
  const routeCost = r?.semanticRouteUsage?.costUsd ?? 0;
  const row = {
    id: c.id, repo: c.repo, adr_id: c.adr_id, label_final: c.label_final,
    predictedViolate, routing: routing.map((x) => x.decision), llmCallCount: llmCalls.length,
    escalateCostUsd: escalateCost, routeCostUsd: routeCost, totalCostUsd: escalateCost + routeCost,
    wallMs: ms, error: errMsg,
  };
  results.push(row);
  writeFileSync(out, JSON.stringify(results, null, 2));
  console.log(c.id, 'predicted=', predictedViolate, 'label=', c.label_final, `${ms}ms`, errMsg ?? '');
}
console.log(`wrote ${results.length} rows -> ${out}`);
