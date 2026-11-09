#!/usr/bin/env node
// T118: false-alarm sanity check -- on v3 dev's 'none' cases (22, no governing decision should exist), does
// scopeBoost change which decision(s) the DEFAULT router (topK=5, confidenceRatio=0.75, no LLM -- the zero-cost
// bm25-only tier most cases hit) actually routes to? scopeBoost only REORDERS candidates already found by BM25
// (same set, same scores) -- it cannot introduce a candidate BM25 itself didn't already surface, but it CAN
// change which one wins ties for the top-1 slot when confidence is low, which is the actual false-alarm risk
// path (a wrongly-promoted decision reaching the escalation LLM a 'none' case should never reach).
import { resolve } from 'node:path';
import { readFileSync as rf } from 'node:fs';
import { routeDecisions } from '/Users/a1/Desktop/CS Code/Project/Mole-worktrees/T118-router-recall/packages/decisions/dist/src/route/route.js';
import { indexTextOf, oneLineSummaryOf } from '/Users/a1/Desktop/CS Code/Project/Mole-worktrees/T118-router-recall/packages/decisions/dist/src/route/index-text.js';
import { loadGraph } from '/Users/a1/Desktop/CS Code/Project/Mole-worktrees/T118-router-recall/packages/decisions/dist/src/index.js';

const B2 = '/Users/a1/Desktop/CS Code/Project/Mole/context/product-plan/systems/metrics-proof/m2-conflict';
const INACTIVE = new Set(['superseded', 'deprecated', 'rejected', 'retired']);

function filesOfDiff(diff) {
  const files = new Set();
  const re = /^diff --git a\/(\S+) b\/(\S+)/gm;
  let m;
  while ((m = re.exec(diff))) { files.add(m[1]); files.add(m[2]); }
  return [...files];
}

const cases = JSON.parse(rf(resolve(B2, 'v3/cases_with_labels_v3.json'), 'utf8')).filter((c) => c.split === 'dev' && c.adr_id === 'none');
const REPOS = [...new Set(cases.map((c) => c.repo))];
const decisionsByRepo = {};
for (const repo of REPOS) {
  const recordsRoot = resolve(B2, 'v3/run/records_arm2', repo);
  const graph = loadGraph(recordsRoot);
  const docs = [];
  for (const n of graph.nodes) {
    if (n.kind !== 'decision' || INACTIVE.has(n.status)) continue;
    const text = rf(resolve(recordsRoot, n.file), 'utf8');
    const scopeGlobs = (n.scope ?? []).map((a) => a.target).filter(Boolean);
    docs.push({ id: n.id, title: n.title, summary: oneLineSummaryOf(n.title, text), text: indexTextOf(n.title, text), ...(scopeGlobs.length ? { scopeGlobs } : {}) });
  }
  decisionsByRepo[repo] = docs;
}

let changed = 0, bothEmpty = 0, bothSame = 0;
const detail = [];
for (const c of cases) {
  const docs = decisionsByRepo[c.repo];
  const changeText = c.diff ?? '';
  const changedFiles = filesOfDiff(changeText);
  const without = await routeDecisions({ changeText, decisions: docs, topK: 5, confidenceRatio: 0.75 });
  const withBoost = await routeDecisions({ changeText, decisions: docs, topK: 5, confidenceRatio: 0.75, changedFiles, scopeBoost: true });
  const a = without.routed.map((x) => x.id).sort();
  const b = withBoost.routed.map((x) => x.id).sort();
  const same = JSON.stringify(a) === JSON.stringify(b);
  if (same) bothSame++; else changed++;
  if (a.length === 0 && b.length === 0) bothEmpty++;
  detail.push({ id: c.id, without: a, withBoost: b, same });
}
console.log(JSON.stringify({ n_none_cases: cases.length, routed_set_unchanged: bothSame, routed_set_changed: changed, both_routed_nothing: bothEmpty, detail }, null, 2));
