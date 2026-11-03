// T79: red test for D52's internal inconsistency (M14's "run all ... at 1347.5% of the suite"), using only the
// frozen, committed m14-key.json (never edited by this task, R2) -- no live bench run / scratch checkout needed.
// Bug: the bench's old formula for ANY row's "share" is fullSuiteTests / reach.tests (a ratio against the
// REACH baseline), then calls the run-all row's result "% of the suite". Since reach.tests <= fullSuiteTests
// for every row, that ratio is >=100% whenever reach < suite, i.e. run-all's own "share of the full suite" can
// never correctly be computed this way. The standard RTS definition (Rothermel & Harrold 1996; Ekstazi ISSTA
// 2015; STARTS ASE 2017 -- see 4 log/prior-art.md) always expresses selection size as selected / FULL SUITE,
// under which run-all is 100% by construction and run-none is 0% by construction.
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { summarizeM14, type Detail, type KeyRow } from '../bench/m14-summary.js';

const benchDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

describe('T79 M14 run-all/run-none selection-size consistency (D52)', () => {
  const key = JSON.parse(readFileSync(join(benchDir, 'bench/keys/m14-key.json'), 'utf8')) as { frozen: string[]; regressions: KeyRow[] };
  const rows = key.frozen.map((id) => key.regressions.find((r) => r.id === id)!);

  // run-all: every row's "selection" IS the full suite (ran = fullSuiteTests). This is the frozen bench's own
  // definition of the run-all baseline (keys/m14-key.json definitions.runAll: "fullSuiteTests of each row").
  const runAllDetails: Detail[] = rows.map((r) => ({ id: r.id, ran: r.fullSuiteTests, reach: r.reach.tests, fullSuiteTests: r.fullSuiteTests, caughtBy: r.failing.map((f: { file: string; name: string }) => `${f.file} > ${f.name}`) }));

  it('run-all selects exactly 100% of the full suite, by construction, for every frozen row', () => {
    const summary = summarizeM14(rows, runAllDetails);
    // the one fact a "run all" baseline can never violate: it IS the full suite.
    expect(summary.suiteShare.mean).toBeCloseTo(1, 10);
    expect(summary.suiteShare.aggregate).toBeCloseTo(1, 10);
  });

  it('the old reach-relative formula (fullSuiteTests / reach.tests, averaged) reproduces D52\'s reported 1347.5% ' +
    '-- demonstrating why that formula must never be labelled "% of the suite"', () => {
    const oldFormulaMean = rows.reduce((s, r) => s + r.fullSuiteTests / r.reach.tests, 0) / rows.length;
    expect(Math.round(oldFormulaMean * 1000) / 10).toBeCloseTo(1347.5, 0);
    // and that number is NOT the 100% that a correct "% of the suite" must be for a run-all baseline:
    expect(oldFormulaMean).not.toBeCloseTo(1, 1);
  });

  it('run-none selects exactly 0% of the full suite, by construction', () => {
    const runNoneDetails: Detail[] = rows.map((r) => ({ id: r.id, ran: 0, reach: r.reach.tests, fullSuiteTests: r.fullSuiteTests, caughtBy: [] }));
    const summary = summarizeM14(rows, runNoneDetails);
    expect(summary.suiteShare.mean).toBe(0);
    expect(summary.suiteShare.aggregate).toBe(0);
  });

  it('aggregate selection size reproduces the committed numbers exactly: 163 ran / 14065 full-suite tests', () => {
    // 163 and 12159 are the frozen aggregate ran/reach from tasks/T22-hand-back-test-selection/4 log/runs.jsonl
    // (last line); 14065 = sum of fullSuiteTests over the 10 frozen rows, both purely from committed inputs.
    const suiteTotal = rows.reduce((s, r) => s + r.fullSuiteTests, 0);
    expect(suiteTotal).toBe(14065);
    const reachTotal = rows.reduce((s, r) => s + r.reach.tests, 0);
    expect(reachTotal).toBe(12159);
  });
});
