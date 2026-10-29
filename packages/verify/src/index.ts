// @mole/verify (T22): at hand-back, run only the tests that matter for a change.
// RED-COMMIT STUB: types + signatures only; every function throws until the implementation lands (loop rule R1).
import type { Change, CheckResult } from '@mole/history';

export type { Change } from '@mole/history';

export interface SelectOptions {
  /** which commits count as fixes (passed to @mole/history check) */
  fixRule?: string;
  /** SQLite file for the call graph; reused while its recorded commit equals HEAD, else rebuilt. Default: in memory */
  graphDb?: string;
  /** max reverse call-graph depth searched for tests (default 8) */
  maxDepth?: number;
}

export interface EditedSymbol {
  /** @mole/indexer node id, e.g. function:src/math.ts#add */
  id: string;
  file: string;
  name: string;
  line: number;
}

export type Via = 'fix' | 'graph' | 'edited';

export interface SelectedTest {
  file: string;
  /** full name as the runner reports it: describe titles + test title joined by ' > ' */
  name: string;
  /** 1-based line of the test call (the runner's location filter) */
  line: number;
  via: Via[];
  /** call-graph distance from an edited symbol (graph only) */
  depth?: number;
  /** short sha of the past fix this test guards (fix only) */
  fix?: string;
  reason: string;
}

export interface Selection {
  root: string;
  check: CheckResult;
  edited: EditedSymbol[];
  tests: SelectedTest[];
  /** test cases the call graph reaches at any depth <= maxDepth (diagnostic; the selection takes the nearest) */
  reachable: number;
  noTestReaches: boolean;
  /** when no test reaches the change: the nearest guarding test to look at */
  nearest?: { file: string; name?: string; line?: number; why: string };
  ms: number;
}

export interface TestOutcome {
  file: string;
  name: string;
  line: number | null;
  status: 'passed' | 'failed' | 'skipped';
  message?: string;
}

export interface RunResult {
  runner: 'vitest';
  command: string[];
  outcomes: TestOutcome[];
  passed: number;
  failed: number;
  ms: number;
  error?: string;
}

export const NO_TEST_REACHES = 'no test reaches this change';

/** model (LLM) calls made by this package: none; the model never decides which tests run */
export const modelCalls = { count: 0 };

export async function selectTests(_root: string, _change: Change, _opts: SelectOptions = {}): Promise<Selection> {
  throw new Error('not implemented (T22 red commit)');
}

export async function runTests(_root: string, _sel: Selection, _opts: { vitest?: string } = {}): Promise<RunResult> {
  throw new Error('not implemented (T22 red commit)');
}

export function formatVerify(_sel: Selection, _run?: RunResult): string {
  throw new Error('not implemented (T22 red commit)');
}

/** `mole check ... --run-tests` (called from packages/daemon/src/cli.ts) */
export async function verifyCli(_pos: string[], _flags: Record<string, string | true>, _root: string): Promise<number> {
  throw new Error('not implemented (T22 red commit)');
}
