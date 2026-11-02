#!/usr/bin/env node
// T46 bench step 1 (dev only): compile-at-capture for the dev-set ADRs that ship with no content anchor at all
// (bs-adr002, bs-adr009 -- see context/.../m2-conflict/results.md). One real `hermes` call per ADR, drafted from the
// ADR's OWN text (never from the bench's case diffs/labels -- the model never sees a case), then approved by this
// task (recorded as approver "t46-builder (ledger task)").
import { draftChecksFor, hermesLlmClient, saveDraft, approveDraft, contentAnchorsOf, loadGraph } from '../../../../packages/decisions/dist/src/index.js';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const recordsRoot = resolve(here, 'records');
const ADR_DIR = '/Users/a1/.hermes/cache/scratch/mb-why/backstage/docs/architecture-decisions';
const ADR_FILES = { adr002: 'adr002-default-catalog-file-format.md', adr009: 'adr009-entity-references.md', adr005: 'adr005-catalog-core-entities.md', adr014: 'adr014-use-fetch.md' };

const ids = process.argv.slice(2); // e.g. node compile_dev.mjs adr002 adr009
if (!ids.length) {
  console.error('usage: node compile_dev.mjs <adr002|adr005|adr009|adr014> ...');
  process.exit(2);
}

const graph = loadGraph(recordsRoot);
const llm = hermesLlmClient();

for (const short of ids) {
  const id = `bs-${short}`;
  const node = graph.nodes.find((n) => n.id === id);
  if (!node) {
    console.error(`no decision ${id} in ${recordsRoot}`);
    process.exit(2);
  }
  const decisionText = readFileSync(resolve(ADR_DIR, ADR_FILES[short]), 'utf8');
  const existingMatch = contentAnchorsOf(recordsRoot, node).map((a) => ({ pattern: a.pattern, ...(a.in ? { in: a.in } : {}), ...(a.why ? { why: a.why } : {}) }));
  console.log(`drafting ${id} ...`);
  const draft = await draftChecksFor(llm, {
    id: node.id,
    title: node.title,
    recordFile: node.file,
    decisionText,
    existingScope: node.scope.map((a) => a.target),
    existingMatch,
  });
  const saved = saveDraft(recordsRoot, draft);
  console.log(`  drafted v${saved.version}: scope+=${JSON.stringify(saved.scope)} match+=${JSON.stringify(saved.match)} usage=${JSON.stringify(saved.usage)}`);
  const { recordPath } = approveDraft(recordsRoot, id, { approver: 't46-builder (ledger task T46, read ADR text only, no case data)' });
  console.log(`  approved -> ${recordPath}`);
}
