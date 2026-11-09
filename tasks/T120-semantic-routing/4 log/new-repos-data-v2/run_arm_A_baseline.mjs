#!/usr/bin/env node
// T120 rebuild, Arm A: "T53-baseline" per Amendment 2's harness correction -- matches
// run_t53_semantic_route_v4_3.mjs exactly: cascadeCheck WITH semanticRoute configured
// (topK=5, minScore=0, confidenceRatio=1.01, haiku router), embedBoost OFF.
import { cascadeCheck, hermesLlmClient, loadGraph, indexTextOf, oneLineSummaryOf } from '/Users/a1/Desktop/CS Code/Project/Mole-worktrees/T120c-wire-embed/packages/decisions/dist/src/index.js';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const CASES = JSON.parse(readFileSync('/Users/a1/.hermes/cache/scratch/t120c/cases_FINAL.json', 'utf8'));
const REPO_PATHS = { feast: '/Users/a1/.hermes/cache/scratch/t120c/feast', 'pledger-android': '/Users/a1/.hermes/cache/scratch/t120c/pledger-android' };
const ADR_DIRS = { feast: ['docs/adr'], 'pledger-android': ['docs/adr'] };

const out = '/Users/a1/.hermes/cache/scratch/t120c/arm_A_baseline.json';
const results = existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')) : [];
const done = new Set(results.map((r) => r.id));

const escalateLlm = hermesLlmClient();
const routeLlm = hermesLlmClient({ model: 'claude-haiku-4-5' });

const reposDecisions = {};
const decisionTextFns = {};
for (const repo of Object.keys(REPO_PATHS)) {
  const graph = loadGraph(REPO_PATHS[repo], { adrDirs: ADR_DIRS[repo] });
  const docs = [];
  const textById = {};
  for (const n of graph.nodes) {
    if (n.kind !== 'decision') continue;
    if (['superseded', 'deprecated', 'rejected', 'retired'].includes(n.status)) continue;
    const abs = `${REPO_PATHS[repo]}/${n.file}`;
    const text = existsSync(abs) ? readFileSync(abs, 'utf8') : '';
    textById[n.id] = text;
    docs.push({ id: n.id, title: n.title, summary: oneLineSummaryOf(n.title, text), text: indexTextOf(n.title, text) });
  }
  reposDecisions[repo] = docs;
  decisionTextFns[repo] = (id) => textById[id];
}
console.log('decision corpus sizes:', Object.fromEntries(Object.keys(REPO_PATHS).map((r) => [r, reposDecisions[r].length])));

for (const c of CASES) {
  if (done.has(c.id)) continue;
  const root = REPO_PATHS[c.repo];
  const t0 = Date.now();
  let r, errMsg;
  try {
    r = await cascadeCheck({
      root, base: c.base, head: c.head, adrDirs: ADR_DIRS[c.repo], llm: escalateLlm,
      decisionText: decisionTextFns[c.repo],
      semanticRoute: { decisions: reposDecisions[c.repo], topK: 5, minScore: 0, confidenceRatio: 1.01, llm: routeLlm },
    });
  } catch (e) {
    errMsg = String(e);
  }
  const ms = Date.now() - t0;
  const verdicts = r ? r.verdicts : [];
  const routing = r ? r.routing : [];
  const target = verdicts.find((v) => v.decision === c.adr_id);
  const flaggedTarget = c.adr_id !== 'none' && !!target && target.flag === 'violates';
  const flaggedAny = verdicts.some((v) => v.flag === 'violates');
  const predictedViolate = c.adr_id === 'none' ? flaggedAny : flaggedTarget;
  const llmCalls = verdicts.filter((v) => v.tier === 'llm' && v.usage);
  const escalateCost = llmCalls.reduce((s, v) => s + (v.usage?.costUsd ?? 0), 0);
  const routeCost = r?.semanticRouteUsage?.costUsd ?? 0;
  const routedCorrectly = c.adr_id === 'none' ? routing.length === 0 : routing.some((x) => x.decision === c.adr_id);
  const row = {
    id: c.id, repo: c.repo, adr_id: c.adr_id, label_final: c.label_constructor_intent,
    predictedViolate, routedCorrectly, routing: routing.map((x) => x.decision),
    llmCallCount: llmCalls.length, escalateCostUsd: escalateCost, routeCostUsd: routeCost,
    totalCostUsd: escalateCost + routeCost, wallMs: ms, error: errMsg,
  };
  results.push(row);
  writeFileSync(out, JSON.stringify(results, null, 2));
  console.log(c.id, 'pred=', predictedViolate, 'label=', c.label_constructor_intent, 'routedCorrectly=', routedCorrectly, `${ms}ms`, errMsg ?? '');
}
console.log(`wrote ${results.length} rows -> ${out}`);
