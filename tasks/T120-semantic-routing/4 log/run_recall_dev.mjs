// T120 DEV recall@1/3/5 harness. Loads the REAL routeDecisions() from the built package (no
// reimplementation) against the real-ADR dataset assembled in eval_dataset.json (ADR text fetched via
// GitHub's contents API -- no git clone, see 4 log/recall-dev.md for the method and its disclosed gaps).
import { routeDecisions } from '../../../packages/decisions/dist/src/route/route.js';
import { readFileSync, writeFileSync } from 'node:fs';

const DATA = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const OUT = process.argv[3];

function buildDocs(repo) {
  return DATA.repo_docs[repo].map((d) => ({
    id: d.id,
    title: d.title,
    summary: d.summary,
    text: d.text,
    embedding: d.embedding,
    governsSummary: d.governsSummary,
  }));
}

// recall@k against the FINAL ranked order (post-boost bm25Candidates -- the order every downstream
// tier/consumer actually sees), not just the single `routed` pick.
function rankOf(result, gtId) {
  const idx = result.bm25Candidates.findIndex((c) => c.id === gtId);
  return idx === -1 ? Infinity : idx + 1;
}

async function runConfig(name, routeOpts) {
  const perRepo = {}; // repo -> {hits1,hits3,hits5,n, falseAlarms, nNone}
  for (const c of DATA.cases) {
    const docs = buildDocs(c.repo);
    const t0 = Date.now();
    const r = await routeDecisions({
      changeText: c.diff.slice(0, 4000),
      decisions: docs,
      changeEmbedding: routeOpts.embedBoost ? c.changeEmbedding : undefined,
      ...routeOpts,
    });
    const ms = Date.now() - t0;
    const bucket = (perRepo[c.repo] ??= { n: 0, hits1: 0, hits3: 0, hits5: 0, nNone: 0, falseAlarms: 0, ms: 0 });
    bucket.ms += ms;
    if (c.adr_id === 'none') {
      bucket.nNone++;
      if (r.routed.length > 0) bucket.falseAlarms++; // router proposed a decision for a change that governs none
      continue;
    }
    bucket.n++;
    const rank = rankOf(r, c.gt_file);
    if (rank <= 1) bucket.hits1++;
    if (rank <= 3) bucket.hits3++;
    if (rank <= 5) bucket.hits5++;
  }
  return { name, perRepo };
}

const configs = [
  { name: 'bm25-baseline (current default, T53)', opts: {} },
  { name: 'bm25+embedBoost', opts: { embedBoost: true } },
  { name: 'bm25+embedBoost+useGovernsSummary', opts: { embedBoost: true, useGovernsSummary: true } },
];

const results = [];
for (const cfg of configs) {
  console.log('running', cfg.name);
  results.push(await runConfig(cfg.name, cfg.opts));
}

writeFileSync(OUT, JSON.stringify(results, null, 2));
console.log('wrote', OUT);
