// T79: M14 summary computation, extracted from bench/m14.ts so the arithmetic is unit-testable against the
// frozen m14-key.json without a live multi-repo bench run (no scratch checkout / network needed).
//
// Standard RTS terms used here (Rothermel & Harrold 1996; Ekstazi ISSTA 2015; STARTS ASE 2017 -- see
// 4 log/prior-art.md), each ALWAYS relative to the full suite / full modification-revealing-test set:
//   - selection size %  = tests the selection ran / fullSuiteTests (run-all is always exactly 100%, run-none 0%)
//   - inclusiveness/safety (recall of tests that fail) = failing tests the selection ran & caught / failing tests total
// Plus Mole's own secondary (non-standard, clearly labelled) comparison against the `vitest related` baseline:
//   - share of reach = tests the selection ran / reach.tests (reach ⊆ full suite; NEVER call this "% of the suite" --
//     it is >=100% whenever reach < suite, which is exactly D52's 1347.5% bug for the run-all baseline).
export interface KeyTest {
  file: string;
  name: string;
  line: number | null;
}
export interface KeyRow {
  id: string;
  repo: 'mole' | 'excalidraw';
  failing: KeyTest[];
  fullSuiteTests: number;
  reach: { tests: number; files: number };
  valid: boolean;
}
export interface Detail {
  id: string;
  ran: number;
  reach: number;
  fullSuiteTests: number;
  /** `${file} > ${name}` of truth-failing tests this detail's run caught (selected, ran, and failed). */
  caughtBy: string[];
}

export interface M14Summary {
  n: number;
  caught: number;
  reachShare: { mean: number; aggregate: number; ranTotal: number; reachTotal: number };
  suiteShare: { mean: number; aggregate: number; ranTotal: number; suiteTotal: number };
  /** test-level inclusiveness/safety: recall of ground-truth failing tests, averaged over rows that have any. */
  inclusiveness: { mean: number; rows: number };
  met: boolean;
  M14: string;
}

const pct = (x: number): string => `${(x * 100).toFixed(1)}%`;

export function summarizeM14(rows: KeyRow[], details: Detail[], modelCalls = 0): M14Summary {
  if (rows.length !== details.length) throw new Error(`rows/details length mismatch: ${rows.length} vs ${details.length}`);

  const reachRatio = (d: Detail): number => (d.reach > 0 ? d.ran / d.reach : d.ran > 0 ? Infinity : 0);
  const suiteRatio = (d: Detail): number => (d.fullSuiteTests > 0 ? d.ran / d.fullSuiteTests : 0);

  const ranTotal = details.reduce((s, d) => s + d.ran, 0);
  const reachTotal = details.reduce((s, d) => s + d.reach, 0);
  const suiteTotal = details.reduce((s, d) => s + d.fullSuiteTests, 0);

  const meanReachShare = details.reduce((s, d) => s + reachRatio(d), 0) / details.length;
  const meanSuiteShare = details.reduce((s, d) => s + suiteRatio(d), 0) / details.length;

  const caught = details.filter((d) => d.caughtBy.length > 0).length;

  const inclusivenessRows = rows
    .map((r, i) => ({ r, d: details[i]! }))
    .filter(({ r }) => r.failing.length > 0);
  const meanInclusiveness =
    inclusivenessRows.length > 0
      ? inclusivenessRows.reduce((s, { r, d }) => s + d.caughtBy.length / r.failing.length, 0) / inclusivenessRows.length
      : 1;

  const met = caught >= Math.ceil(rows.length * 0.9) && meanReachShare <= 1 / 3 && modelCalls === 0;

  const M14 =
    `caught ${caught}/${rows.length} · selection size: mean ${pct(meanSuiteShare)} of the full suite ` +
    `(aggregate ${pct(suiteTotal > 0 ? ranTotal / suiteTotal : 0)}, ${ranTotal}/${suiteTotal}) · ` +
    `share of reach baseline (vitest related, not a suite %): mean ${pct(meanReachShare)} ` +
    `(aggregate ${pct(reachTotal > 0 ? ranTotal / reachTotal : 0)}, ${ranTotal}/${reachTotal}) · ` +
    `inclusiveness/safety (recall of failing tests): mean ${pct(meanInclusiveness)} over ${inclusivenessRows.length} rows with >=1 failing test · ` +
    `run all = 100% of the suite (trivial) · run none = 0% of the suite (trivial) · target >= 9/10 caught at <= 33.3% share of reach`;

  return {
    n: rows.length,
    caught,
    reachShare: { mean: meanReachShare, aggregate: reachTotal > 0 ? ranTotal / reachTotal : 0, ranTotal, reachTotal },
    suiteShare: { mean: meanSuiteShare, aggregate: suiteTotal > 0 ? ranTotal / suiteTotal : 0, ranTotal, suiteTotal },
    inclusiveness: { mean: meanInclusiveness, rows: inclusivenessRows.length },
    met,
    M14,
  };
}
