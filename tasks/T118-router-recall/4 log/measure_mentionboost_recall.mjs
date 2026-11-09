#!/usr/bin/env node
// T118 step B: recall@1/3/5 measurement with mentionBoost on v3 dev + v4.1 dev (DEV splits ONLY, per task
// instruction -- B2 v4.2 is the frozen held-out, never tuned on). Mirrors measure_scopeboost_recall.mjs's shape
// exactly, but wires mentionPaths/mentionIdentifiers (route/mentions.ts, extracted from each decision's own
// ADR TEXT against the real repo file list via git ls-files) instead of/alongside scopeGlobs, and turns on
// mentionBoost (scopeBoost left on too, since both are independent, additive signals -- the real cli.ts call
// site would run both together once this ships, not one or the other).
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { routeDecisions } from '/Users/a1/Desktop/CS Code/Project/Mole-worktrees/T118-router-recall/packages/decisions/dist/src/route/route.js';
import { semanticRouteDocs, listRepoFiles } from '/Users/a1/Desktop/CS Code/Project/Mole-worktrees/T118-router-recall/packages/decisions/dist/src/cascade/semantic-docs.js';
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

async function recallAtK(decisions, cases, idField) {
  const rows = [];
  for (const c of cases) {
    const hasTarget = c.adr_id !== 'none';
    const targetId = idField ? idField(c) : c.adr_id;
    const r = await routeDecisions({
      changeText: c.diff ?? '',
      decisions,
      topK: 50,
      minScore: 0,
      changedFiles: filesOfDiff(c.diff ?? ''),
      scopeBoost: true,
      mentionBoost: true,
    });
    const pos = hasTarget ? r.bm25Candidates.findIndex((x) => x.id === targetId) : -1;
    rows.push({ id: c.id, hasTarget, rank: pos === -1 ? null : pos + 1, candidateCount: r.bm25Candidates.length });
  }
  return rows;
}

function summarize(rows) {
  const withTarget = rows.filter((r) => r.hasTarget);
  const n = withTarget.length;
  const atK = (k) => withTarget.filter((r) => r.rank !== null && r.rank <= k).length;
  return {
    n_with_target: n,
    recall_at_1: n ? +(atK(1) / n).toFixed(4) : null,
    recall_at_3: n ? +(atK(3) / n).toFixed(4) : null,
    recall_at_5: n ? +(atK(5) / n).toFixed(4) : null,
    miss_detail: withTarget.filter((r) => r.rank === null || r.rank > 5).map(({ id, rank, candidateCount }) => ({ id, rank, candidateCount })),
  };
}

function docsOf(graph, recordsRoot, repoFiles) {
  return semanticRouteDocs(recordsRoot, graph, repoFiles);
}

async function runV3Dev() {
  const cases = JSON.parse(readFileSync(resolve(B2, 'v3/cases_with_labels_v3.json'), 'utf8')).filter((c) => c.split === 'dev');
  const REPOS = [...new Set(cases.map((c) => c.repo))];
  const decisionsByRepo = {};
  const mentionCounts = {};
  for (const repo of REPOS) {
    const recordsRoot = resolve(B2, 'v3/run/records_arm2', repo);
    const graph = loadGraph(recordsRoot);
    // v3's corpus is synthetic .mole records, not a real git-cloned app repo -- no real repoFiles list to
    // resolve mentions against (listRepoFiles(recordsRoot) returns [] here, same as the real cli.ts would for
    // a records-only root with no .git). mentionIdentifiers (no repo list needed) still runs.
    const docs = docsOf(graph, recordsRoot, listRepoFiles(recordsRoot));
    decisionsByRepo[repo] = docs;
    mentionCounts[repo] = { scoped: docs.filter((d) => d.scopeGlobs?.length).length, mentionPaths: docs.filter((d) => d.mentionPaths?.length).length, mentionIdentifiers: docs.filter((d) => d.mentionIdentifiers?.length).length };
  }
  let rows = [];
  for (const repo of REPOS) rows = rows.concat(await recallAtK(decisionsByRepo[repo], cases.filter((c) => c.repo === repo)));
  return { split: 'v3_dev_scope_plus_mentionBoost', mention_counts_by_repo: mentionCounts, ...summarize(rows) };
}

async function runV41Dev() {
  const cases = JSON.parse(readFileSync(resolve(B2, 'v4.1/cases_with_labels_v4_1.json'), 'utf8')).filter((c) => c.split === 'dev');
  const REPO_PATHS = {
    'claw-operator': '/Users/a1/.hermes/cache/scratch/m2v4/claw-operator',
    handbook: '/Users/a1/.hermes/cache/scratch/m2v4/handbook',
    'merino-py': '/Users/a1/.hermes/cache/scratch/m2v4/merino-py',
    'hmrc-frontend': '/Users/a1/.hermes/cache/scratch/m2v4/hmrc-frontend',
  };
  const ADR_DIRS = ['docs/adr'];
  const decisionsByRepo = {};
  const mentionCounts = {};
  for (const [repo, root] of Object.entries(REPO_PATHS)) {
    if (!existsSync(root)) continue;
    const graph = loadGraph(root, { adrDirs: ADR_DIRS });
    const repoFiles = listRepoFiles(root);
    const docs = docsOf(graph, root, repoFiles);
    decisionsByRepo[repo] = docs;
    mentionCounts[repo] = { repoFileCount: repoFiles.length, scoped: docs.filter((d) => d.scopeGlobs?.length).length, mentionPaths: docs.filter((d) => d.mentionPaths?.length).length, mentionIdentifiers: docs.filter((d) => d.mentionIdentifiers?.length).length, total_decisions: docs.length };
  }
  let rows = [];
  for (const [repo, docs] of Object.entries(decisionsByRepo)) {
    const repoCases = cases.filter((c) => c.repo === repo);
    rows = rows.concat(await recallAtK(docs, repoCases, (c) => (c.adr_id === 'none' ? null : c.adr_id.split('-').pop())));
  }
  return { split: 'v4_1_dev_scope_plus_mentionBoost', mention_counts_by_repo: mentionCounts, ...summarize(rows) };
}

const out = { v3_dev: await runV3Dev(), v4_1_dev: await runV41Dev() };
console.log(JSON.stringify(out, null, 2));
writeFileSync(resolve(process.cwd(), 'mentionboost_recall.json'), JSON.stringify(out, null, 2));
