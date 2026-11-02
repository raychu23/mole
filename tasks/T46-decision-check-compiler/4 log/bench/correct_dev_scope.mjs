#!/usr/bin/env node
// T46 bench: a person's correction of the v1 draft before re-approving (dev-tuning only; the model's guessed
// barrel-file path was close but wrong -- packages/catalog-model/src/index.ts vs the real
// packages/catalog-model/src/entity/index.ts). Logged here, not silently fixed: see t46_bench_report.md.
import { saveDraft, approveDraft } from '../../../../packages/decisions/dist/src/index.js';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const recordsRoot = resolve(here, 'records');

const corrections = [
  { id: 'bs-adr002', recordFile: '.mole/decisions/bs-adr002.md', scope: ['packages/catalog-model/src/entity/index.ts'] },
  { id: 'bs-adr009', recordFile: '.mole/decisions/bs-adr009.md', scope: ['packages/catalog-model/src/entity/index.ts'] },
];

for (const c of corrections) {
  const draft = { decision: c.id, recordFile: c.recordFile, draftedAt: new Date().toISOString(), status: 'pending', scope: c.scope, match: [], rules: [], guardTests: [], raw: '(person correction, not a model draft: the ADR\'s own entity barrel file, guessed slightly wrong by the v1 draft)', usage: {} };
  const saved = saveDraft(recordsRoot, draft);
  const { recordPath } = approveDraft(recordsRoot, c.id, { approver: 't46-builder (person correction to v1 scope guess)' });
  console.log(`${c.id} v${saved.version} corrected scope -> ${recordPath}`);
}
