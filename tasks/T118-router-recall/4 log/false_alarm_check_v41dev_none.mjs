#!/usr/bin/env node
// T118 step B self-review: does mentionBoost change which decision(s) the DEFAULT zero-LLM router actually
// routes to on v4.1 dev's 'none' cases (changes that govern NO decision)? Same shape as
// false_alarm_check_v3dev_none.mjs (routing-SET identity, bm25-only tier, no LLM calls), but on the REAL
// claw-operator/handbook/merino-py/hmrc-frontend corpora where mentionBoost actually has nonzero data (v3's
// synthetic corpus has no real git repo to resolve mentionPaths against).
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { routeDecisions } from '/Users/a1/Desktop/CS Code/Project/Mole-worktrees/T118-router-recall/packages/decisions/dist/src/route/route.js';
import { semanticRouteDocs, listRepoFiles } from '/Users/a1/Desktop/CS Code/Project/Mole-worktrees/T118-router-recall/packages/decisions/dist/src/cascade/semantic-docs.js';
import { loadGraph } from '/Users/a1/Desktop/CS Code/Project/Mole-worktrees/T118-router-recall/packages/decisions/dist/src/index.js';

const B2 = '/Users/a1/Desktop/CS Code/Project/Mole/context/product-plan/systems/metrics-proof/m2-conflict';

function filesOfDiff(diff) {
  const files = new Set();
  const re = /^diff --git a\/(\S+) b\/(\S+)/gm;
  let m;
  while ((m = re.exec(diff))) { files.add(m[1]); files.add(m[2]); }
  return [...files];
}

const REPO_PATHS = {
  'claw-operator': '/Users/a1/.hermes/cache/scratch/m2v4/claw-operator',
  handbook: '/Users/a1/.hermes/cache/scratch/m2v4/handbook',
  'merino-py': '/Users/a1/.hermes/cache/scratch/m2v4/merino-py',
  'hmrc-frontend': '/Users/a1/.hermes/cache/scratch/m2v4/hmrc-frontend',
};
const ADR_DIRS = ['docs/adr'];

const cases = JSON.parse(readFileSync(resolve(B2, 'v4.1/cases_with_labels_v4_1.json'), 'utf8')).filter((c) => c.split === 'dev' && c.adr_id === 'none');
const docsByRepo = {};
for (const [repo, root] of Object.entries(REPO_PATHS)) {
  if (!existsSync(root)) continue;
  const graph = loadGraph(root, { adrDirs: ADR_DIRS });
  docsByRepo[repo] = semanticRouteDocs(root, graph, listRepoFiles(root));
}

let same = 0, changed = 0;
const detail = [];
for (const c of cases) {
  const docs = docsByRepo[c.repo];
  if (!docs) continue;
  const changeText = c.diff ?? '';
  const changedFiles = filesOfDiff(changeText);
  const without = await routeDecisions({ changeText, decisions: docs, topK: 5, confidenceRatio: 0.75 });
  const withBoost = await routeDecisions({ changeText, decisions: docs, topK: 5, confidenceRatio: 0.75, changedFiles, scopeBoost: true, mentionBoost: true });
  const a = without.routed.map((x) => x.id).sort();
  const b = withBoost.routed.map((x) => x.id).sort();
  const isSame = JSON.stringify(a) === JSON.stringify(b);
  if (isSame) same++; else changed++;
  detail.push({ id: c.id, repo: c.repo, without: a, withBoost: b, same: isSame });
}
console.log(JSON.stringify({ n_none_cases: cases.length, routed_set_unchanged: same, routed_set_changed: changed, detail }, null, 2));
writeFileSync(resolve(process.cwd(), 'false_alarm_check_v41dev_none.json'), JSON.stringify({ n_none_cases: cases.length, routed_set_unchanged: same, routed_set_changed: changed, detail }, null, 2));
