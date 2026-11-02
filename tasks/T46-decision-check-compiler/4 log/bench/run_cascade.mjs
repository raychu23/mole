#!/usr/bin/env node
// T46 bench step 2: run the cascade over cases_with_mole.json's REAL diffs (via the same backstage sparse clone +
// base/head shas M2 used -- no re-synthesis). One real `hermes` call per escalated decision (FrugalGPT stopping
// rule: only when a governed scope has no crisp zero-LLM verdict). Appends one JSON row per case to --out.
import { cascadeCheck, decisionTextFromRecords, hermesLlmClient, loadGraph } from '../../../../packages/decisions/dist/src/index.js';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const recordsRoot = resolve(here, 'records');
const REPO = '/Users/a1/.hermes/cache/scratch/mb-why/backstage';
const ADR_DIR = `${REPO}/docs/architecture-decisions`;
const ADR_FILES = {
  adr002: 'adr002-default-catalog-file-format.md', adr003: 'adr003-avoid-default-exports.md',
  adr005: 'adr005-catalog-core-entities.md', adr006: 'adr006-avoid-react-fc.md',
  adr007: 'adr007-use-msw-to-mock-service-requests.md', adr009: 'adr009-entity-references.md',
  adr010: 'adr010-luxon-date-library.md', adr014: 'adr014-use-fetch.md',
};

const [filterArg, outArg] = process.argv.slice(2); // "dev" | "heldout" | "all", then --out path (or default)
const out = outArg ?? resolve(here, `cascade_${filterArg}_results.json`);

const CASES = JSON.parse(readFileSync('/Users/a1/Desktop/CS Code/Project/Mole/context/product-plan/systems/metrics-proof/m2-conflict/cases_with_mole.json', 'utf8'));
const cases = filterArg === 'all' ? CASES : CASES.filter((c) => c.id.startsWith(`${filterArg}-`));
if (!cases.length) { console.error(`no cases for filter ${filterArg}`); process.exit(2); }

const graph = loadGraph(recordsRoot);
const llm = hermesLlmClient();
const decisionText = decisionTextFromRecords(recordsRoot, graph.nodes, (id) => {
  const short = id.replace(/^bs-/, '');
  return ADR_FILES[short] ? resolve(ADR_DIR, ADR_FILES[short]) : undefined;
});

const results = existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')) : [];
const done = new Set(results.map((r) => r.id));

for (const c of cases) {
  if (done.has(c.id)) { console.log(`skip (already done) ${c.id}`); continue; }
  const t0 = Date.now();
  const r = await cascadeCheck({ root: REPO, base: c.base, head: c.head, recordsRoot, llm, decisionText });
  const wallMs = Date.now() - t0;
  const targetId = `bs-${c.adr}`;
  const target = r.verdicts.find((v) => v.decision === targetId);
  const predicted = target ? target.flag === 'violates' : false; // not governed at all -> predicted compliant
  const llmCalls = r.verdicts.filter((v) => v.tier === 'llm');
  const totalCost = llmCalls.reduce((s, v) => s + (v.usage?.costUsd ?? 0), 0);
  const row = { id: c.id, adr: c.adr, label: c.label, predicted, targetVerdict: target ?? null, allVerdicts: r.verdicts, llmCallCount: llmCalls.length, totalCostUsd: totalCost, wallMs };
  console.log(`${c.id}  predicted=${predicted} label=${c.label}  llmCalls=${llmCalls.length} cost=$${totalCost.toFixed(4)}  (${wallMs} ms)`);
  results.push(row);
  writeFileSync(out, JSON.stringify(results, null, 2));
}
console.log(`wrote ${results.length} rows -> ${out}`);
