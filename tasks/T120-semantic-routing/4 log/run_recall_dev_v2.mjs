// T120 re-measurement (Q13 follow-up): same real-ADR dataset as run_recall_dev.mjs's
// eval_dataset.json, built by the SAME v1 harness (fetch + embed via sentence-transformers all-
// MiniLM-L6-v2) -- the only change here is (a) governsSummary now uses the FIXED id-resolution
// (see 4 log/results.md "bug" section) instead of the broken exact-filename-only match that
// silently produced 0 coverage on 6 of 10 repos, and (b) two new stage-2 LLM listwise configs
// (topK 10 and 15, default confidenceRatio so only genuinely low-confidence cases escalate --
// NOT the forced-always c=1.01 used in the B2 bench).
import { routeDecisions } from '../../../packages/decisions/dist/src/route/route.js';
import { hermesLlmClient } from '../../../packages/decisions/dist/src/compile/llm.js';
import { readFileSync, writeFileSync } from 'node:fs';

const DATA = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const OUT = process.argv[3];
const ONLY_SPLIT = process.argv[4]; // optional: 'SEEN' | 'DEV' | undefined (all)

const DEV_REPOS = new Set(['easi-app', 'powertools-python', 'log4brains', 'python-tuf', 'merino-py', 'hmrc-frontend']);
const SEEN_REPOS = new Set(['semantic-kernel', 'jaeger', 'content-publisher', 'email-alert-api']);

function buildDocs(repo) {
  return DATA.repo_docs[repo].map((d) => ({
    id: d.id, title: d.title, summary: d.summary, text: d.text,
    embedding: d.embedding, governsSummary: d.governsSummary,
  }));
}

function rankOf(result, gtId) {
  const idx = result.bm25Candidates.findIndex((c) => c.id === gtId);
  return idx === -1 ? Infinity : idx + 1;
}

async function runConfig(name, routeOpts, cases) {
  const perRepo = {};
  let llmCalls = 0, llmCostUsd = 0;
  for (const c of cases) {
    const docs = buildDocs(c.repo);
    const t0 = Date.now();
    const r = await routeDecisions({
      changeText: c.diff.slice(0, 4000),
      decisions: docs,
      changeEmbedding: routeOpts.embedBoost ? c.changeEmbedding : undefined,
      ...routeOpts,
    });
    const ms = Date.now() - t0;
    if (r.usage) { llmCalls++; llmCostUsd += r.usage.costUsd ?? 0; }
    const bucket = (perRepo[c.repo] ??= { n: 0, hits1: 0, hits3: 0, hits5: 0, nNone: 0, falseAlarms: 0, ms: 0 });
    bucket.ms += ms;
    if (c.adr_id === 'none') {
      bucket.nNone++;
      if (r.routed.length > 0) bucket.falseAlarms++;
      continue;
    }
    bucket.n++;
    const rank = rankOf(r, c.gt_file);
    if (rank <= 1) bucket.hits1++;
    if (rank <= 3) bucket.hits3++;
    if (rank <= 5) bucket.hits5++;
  }
  return { name, perRepo, llmCalls, llmCostUsd };
}

const allCases = DATA.cases;
const seenCases = allCases.filter((c) => SEEN_REPOS.has(c.repo));
const devCases = allCases.filter((c) => DEV_REPOS.has(c.repo));

const stage1Configs = [
  { name: 'bm25-baseline', opts: {}, cases: allCases },
  { name: 'bm25+embedBoost', opts: { embedBoost: true }, cases: allCases },
  { name: 'bm25+useGovernsSummary(FIXED)', opts: { useGovernsSummary: true }, cases: allCases },
  { name: 'bm25+embedBoost+useGovernsSummary(FIXED)', opts: { embedBoost: true, useGovernsSummary: true }, cases: allCases },
];

// LLM listwise configs: real hermes -z haiku calls, default confidenceRatio (0.75) so only
// low-confidence stage-1 results escalate (not forced-always) -- bounded to SEEN cases (68, the
// exact repos Q13 names) for cost/time discipline (full 217 x 2 k's would be ~hundreds of calls).
const routeLlm = hermesLlmClient({ model: 'claude-haiku-4-5' });
const llmConfigs = ONLY_SPLIT === 'SEEN_LLM' ? [
  { name: 'bm25+embedBoost+governs(FIXED)+listwise-k10-haiku', opts: { embedBoost: true, useGovernsSummary: true, topK: 10, llm: routeLlm }, cases: seenCases },
  { name: 'bm25+embedBoost+governs(FIXED)+listwise-k15-haiku', opts: { embedBoost: true, useGovernsSummary: true, topK: 15, llm: routeLlm }, cases: seenCases },
] : [];

const configs = ONLY_SPLIT === 'SEEN_LLM' ? llmConfigs : stage1Configs;

const results = [];
for (const cfg of configs) {
  console.log('running', cfg.name, 'n=', cfg.cases.length);
  results.push(await runConfig(cfg.name, cfg.opts, cfg.cases));
}

writeFileSync(OUT, JSON.stringify(results, null, 2));
console.log('wrote', OUT);
