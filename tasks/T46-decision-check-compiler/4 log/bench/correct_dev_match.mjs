#!/usr/bin/env node
// T46 bench: a second person correction (dev-tuning): both adr002 and adr009 govern the SAME barrel file
// (packages/catalog-model/src/entity/index.ts), so the v2 scope-only fix pushed every case there to the LLM tier
// TWICE per case (once per decision) -- correct, but over 25% of the LLM reviewer's own cost (see t46_bench_report.md
// "what dev tuning found"). A crisp, title-grounded content anchor pushes the decidable half back to tier 0: a
// barrel file exists ONLY to re-export; a genuinely NEW top-level export from it changes what the entity shape /
// reference surface looks like to every consumer, which is exactly what ADR002 (entity envelope/descriptor shape)
// and ADR009 (entity reference exports) govern -- a comment-only addition never does. This is the same generic
// claim pr-check.ts's own "option 4" export-convention AST fallback already encodes for export-CONVENTION records;
// here it is written as an explicit `match:` anchor scoped to this one barrel file instead.
import { saveDraft, approveDraft } from '../../../../packages/decisions/dist/src/index.js';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const recordsRoot = resolve(here, 'records');
const PATTERN = '^\\s*export\\s+(const|let|function|class|interface|type)\\s';
const IN = 'packages/catalog-model/src/entity/index.ts';
const WHY = 'a barrel file exists only to re-export; a brand-new top-level export from it changes the entity shape/reference surface this decision governs';

const corrections = [
  { id: 'bs-adr002', recordFile: '.mole/decisions/bs-adr002.md' },
  { id: 'bs-adr009', recordFile: '.mole/decisions/bs-adr009.md' },
];

for (const c of corrections) {
  const draft = { decision: c.id, recordFile: c.recordFile, draftedAt: new Date().toISOString(), status: 'pending', scope: [], match: [{ pattern: PATTERN, in: IN, why: WHY }], rules: [], guardTests: [], raw: '(person correction: crisp content anchor for the shared barrel file, see comment above)', usage: {} };
  const saved = saveDraft(recordsRoot, draft);
  const { recordPath } = approveDraft(recordsRoot, c.id, { approver: 't46-builder (person correction: crisp barrel-file export anchor)' });
  console.log(`${c.id} v${saved.version} added crisp match -> ${recordPath}`);
}
