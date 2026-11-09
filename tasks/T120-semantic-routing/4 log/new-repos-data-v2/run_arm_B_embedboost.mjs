#!/usr/bin/env node
// T120 rebuild, Arm B: "T53+embedBoost" -- same cascadeCheck + semanticRoute call as Arm A, PLUS
// semanticRoute.embedBoost:true and a real Embedder (local all-MiniLM-L6-v2 via sentence-transformers,
// spawned per batched call -- same injection posture as embedder-minilm.ts, just a python backend instead
// of transformers.js for this eval run). Goes through the REAL wired cascadeCheck path (ledger/t120c-wire-embed),
// never calling routeDecisions directly -- the harness fix Amendment 2 required.
import { cascadeCheck, hermesLlmClient, loadGraph, indexTextOf, oneLineSummaryOf } from '/Users/a1/Desktop/CS Code/Project/Mole-worktrees/T120c-wire-embed/packages/decisions/dist/src/index.js';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const CASES = JSON.parse(readFileSync('/Users/a1/.hermes/cache/scratch/t120c/cases_FINAL.json', 'utf8'));
const REPO_PATHS = { feast: '/Users/a1/.hermes/cache/scratch/t120c/feast', 'pledger-android': '/Users/a1/.hermes/cache/scratch/t120c/pledger-android' };
const ADR_DIRS = { feast: ['docs/adr'], 'pledger-android': ['docs/adr'] };

const out = '/Users/a1/.hermes/cache/scratch/t120c/arm_B_embedboost.json';
const results = existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')) : [];
const done = new Set(results.map((r) => r.id));

const escalateLlm = hermesLlmClient();
const routeLlm = hermesLlmClient({ model: 'claude-haiku-4-5' });

// Embedder (injected, real cascadeCheck wiring -- T120c): spawns the local MiniLM model via python
// sentence-transformers, ONE call per cascadeCheck invocation (batched: every candidate + the change text).
const embedder = {
  async embed(texts) {
    const inFile = '/Users/a1/.hermes/cache/scratch/t120c/embed_in_tmp.json';
    const outFile = '/Users/a1/.hermes/cache/scratch/t120c/embed_out_tmp.json';
    writeFileSync(inFile, JSON.stringify({ texts }));
    execFileSync('python3', ['/Users/a1/.hermes/cache/scratch/t120c/embed.py', inFile, outFile], { stdio: 'inherit' });
    return JSON.parse(readFileSync(outFile, 'utf8'));
  },
};

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

for (const c of CASES) {
  if (done.has(c.id)) continue;
  const root = REPO_PATHS[c.repo];
  const t0 = Date.now();
  let r, errMsg;
  try {
    r = await cascadeCheck({
      root, base: c.base, head: c.head, adrDirs: ADR_DIRS[c.repo], llm: escalateLlm,
      decisionText: decisionTextFns[c.repo],
      semanticRoute: { decisions: reposDecisions[c.repo], topK: 5, minScore: 0, confidenceRatio: 1.01, llm: routeLlm, embedBoost: true, embedder },
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
