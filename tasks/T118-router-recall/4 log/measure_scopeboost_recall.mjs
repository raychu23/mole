#!/usr/bin/env node
// T118: same measurement as measure_baseline_recall.mjs, but with scopeBoost: true + changedFiles wired through
// routeDecisions (not just plain Bm25Index.score) -- isolates the effect of the T118 change alone on DEV splits,
// tuning ONLY on dev per the task brief. Uses the now-built dist (route.ts's applyScopeBoost, semantic-docs.ts's
// scopeGlobs wiring). v3's decision corpus has real `scope:` anchors (records_arm2's synthetic .mole records);
// v4.1's plain-ADR-folder corpus (loadGraph adrDirs) has NO scope anchors on any node (graph.ts:584 always sets
// scope: [] for nygard/backstage-format nodes) -- so scopeBoost is a no-op there by construction, reported as such.
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
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

async function recallAtK(idx_docs, decisions, cases, idField) {
  const rows = [];
  for (const c of cases) {
    const hasTarget = c.adr_id !== 'none';
    const targetId = idField ? idField(c) : c.adr_id;
    const r = await routeDecisions({
      changeText: c.diff ?? '',
      decisions,
      topK: 50, // measure the full ranking, not just the default topK=5 window
      minScore: 0,
      changedFiles: filesOfDiff(c.diff ?? ''),
      scopeBoost: true,
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

async function runV3Dev() {
  const cases = JSON.parse(readFileSync(resolve(B2, 'v3/cases_with_labels_v3.json'), 'utf8')).filter((c) => c.split === 'dev');
  const REPOS = [...new Set(cases.map((c) => c.repo))];
  const decisionsByRepo = {};
  for (const repo of REPOS) {
    const recordsRoot = resolve(B2, 'v3/run/records_arm2', repo);
    const graph = loadGraph(recordsRoot);
    const docs = [];
    for (const n of graph.nodes) {
      if (n.kind !== 'decision' || INACTIVE.has(n.status)) continue;
      const text = readFileSync(resolve(recordsRoot, n.file), 'utf8');
      const scopeGlobs = (n.scope ?? []).map((a) => a.target).filter(Boolean);
      docs.push({ id: n.id, title: n.title, summary: oneLineSummaryOf(n.title, text), text: indexTextOf(n.title, text), ...(scopeGlobs.length ? { scopeGlobs } : {}) });
    }
    decisionsByRepo[repo] = docs;
  }
  const scopedCount = Object.values(decisionsByRepo).flat().filter((d) => d.scopeGlobs?.length).length;
  console.log(`v3 dev: ${Object.values(decisionsByRepo).flat().length} decisions total, ${scopedCount} carry scope globs`);
  const byRepo = {};
  for (const repo of REPOS) byRepo[repo] = cases.filter((c) => c.repo === repo);
  let rows = [];
  for (const repo of REPOS) rows = rows.concat(await recallAtK(null, decisionsByRepo[repo], byRepo[repo]));
  return { split: 'v3_dev_scopeBoost', scoped_decision_count: scopedCount, ...summarize(rows) };
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
  for (const [repo, root] of Object.entries(REPO_PATHS)) {
    if (!existsSync(root)) continue;
    const graph = loadGraph(root, { adrDirs: ADR_DIRS });
    const docs = [];
    for (const n of graph.nodes) {
      if (n.kind !== 'decision' || INACTIVE.has(n.status)) continue;
      const abs = resolve(root, n.file);
      const text = existsSync(abs) ? readFileSync(abs, 'utf8') : '';
      const scopeGlobs = (n.scope ?? []).map((a) => a.target).filter(Boolean);
      docs.push({ id: n.id, title: n.title, summary: oneLineSummaryOf(n.title, text), text: indexTextOf(n.title, text), ...(scopeGlobs.length ? { scopeGlobs } : {}) });
    }
    decisionsByRepo[repo] = docs;
  }
  const scopedCount = Object.values(decisionsByRepo).flat().filter((d) => d.scopeGlobs?.length).length;
  console.log(`v4.1 dev: ${Object.values(decisionsByRepo).flat().length} decisions total, ${scopedCount} carry scope globs`);
  let rows = [];
  for (const [repo, docs] of Object.entries(decisionsByRepo)) {
    const repoCases = cases.filter((c) => c.repo === repo);
    rows = rows.concat(await recallAtK(null, docs, repoCases, (c) => (c.adr_id === 'none' ? null : c.adr_id.split('-').pop())));
  }
  return { split: 'v4_1_dev_scopeBoost', scoped_decision_count: scopedCount, ...summarize(rows) };
}

const out = { v3_dev: await runV3Dev(), v4_1_dev: await runV41Dev() };
console.log(JSON.stringify(out, null, 2));
writeFileSync(resolve(process.cwd(), 'scopeboost_recall.json'), JSON.stringify(out, null, 2));
