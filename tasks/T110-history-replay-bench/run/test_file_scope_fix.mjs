#!/usr/bin/env node
// T110 v2 review-fix (2026-11-08): standalone demonstration that checkStep()'s file-scope fix in
// run_t46_cascade_v2.mjs actually works, using a REAL case diff, not a synthetic fixture.
//
// Case h2v2-bs-18540-fixed's diff adds `export * from './types';` to
// `plugins/org/src/components/Cards/OwnershipCard/index.ts`. adr004's compiled match: patterns
// (compiled_adrs_v2.json) are:
//   #1 pattern /export\s*\*\s*from\s*['"]\.\/[^'"]+\.(ts|tsx)['"]/            in: **/index.{ts,tsx}
//   #2 pattern /^\s*export\s*(\*|\{[^}]*\})\s*from\s*['"]/                    in: **/!(index).{ts,tsx}
// Pattern #2 is scoped to NON-index files. The pre-fix checkStep() ignored `in:` entirely and matched
// pattern #2 against the `export * from './types';` line even though it was added to index.ts -- a false
// positive this test shows is gone after the fix (this exact line is what drove h2v2-bs-18540-fixed's
// reported T46-cascade false positive, results-v2.md's per-case table / per-failure analysis).
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { globToRegExp } from '/Users/a1/Desktop/CS Code/Project/Mole/packages/decisions/dist/src/check/index.js';
import { filesWithAddedLines, checkStep } from './run_t46_cascade_v2.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const TASK = resolve(here, '..');
const CASES = JSON.parse(readFileSync(resolve(TASK, 'cases_h2_v2.json'), 'utf8'));
const compiled = JSON.parse(readFileSync(resolve(here, 'compiled_adrs_v2.json'), 'utf8')).compiled;

let failures = 0;
function assert(cond, msg) {
  if (!cond) { console.error(`FAIL: ${msg}`); failures++; }
  else console.log(`ok: ${msg}`);
}

const c = CASES.find((x) => x.id === 'h2v2-bs-18540-fixed');
assert(!!c, 'h2v2-bs-18540-fixed case found in cases_h2_v2.json');

const files = filesWithAddedLines(c.diff);
const idxFile = files.find((f) => f.newPath?.endsWith('OwnershipCard/index.ts'));
assert(!!idxFile, 'index.ts parsed as its own file block with newPath set');
assert(idxFile.lines.includes("export * from './types';"), "index.ts's added lines include the re-export line");

const adr004 = compiled.find((d) => d.decision === 'adr004');
const nonIndexPattern = adr004.match.find((m) => m.in === '**/!(index).{ts,tsx}');
assert(!!nonIndexPattern, 'adr004 has the non-index-scoped pattern compiled_adrs_v2.json records');

const nonIndexRe = new RegExp(nonIndexPattern.pattern);
assert(nonIndexRe.test("export * from './types';"), 'sanity: the pattern DOES match the line text (bug was never about the regex itself)');

const inRe = globToRegExp(nonIndexPattern.in);
assert(!inRe.test(idxFile.newPath), "FIX: the non-index glob's compiled RegExp does NOT cover index.ts's own path");

// Old (buggy) behavior for comparison, inline, not re-imported: applied every pattern to every added line
// in the WHOLE diff regardless of path.
function buggyPredict(caseObj, decisionCompiled) {
  const allAdded = caseObj.diff.split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++')).map((l) => l.slice(1));
  return (decisionCompiled.match ?? []).some((m) => new RegExp(m.pattern).test ? allAdded.some((l) => new RegExp(m.pattern).test(l)) : false);
}
const buggyHit = buggyPredict(c, adr004);
assert(buggyHit === true, 'reproduces the ORIGINAL bug: unscoped check flags this case (false positive)');

const rows = checkStep(compiled);
const fixedRow = rows.find((r) => r.id === 'h2v2-bs-18540-fixed');
assert(!!fixedRow, 'fixed checkStep() produced a row for h2v2-bs-18540-fixed');
assert(fixedRow.predictedViolate === false, 'FIX CONFIRMED: scoped checkStep() no longer predicts violate for h2v2-bs-18540-fixed (index.ts line no longer matches the non-index pattern)');

console.log(failures ? `\n${failures} assertion(s) FAILED` : '\nall assertions passed');
process.exit(failures ? 1 : 0);
