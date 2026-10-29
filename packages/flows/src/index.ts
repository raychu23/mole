// @mole/flows (T28): what actually runs. Records caller -> callee edges while vitest runs (a vite transform wraps every
// function body with enter/exit hooks), stores per-test flows under .mole/local/flows, answers `mole flows <file#Symbol>`.
// RED STUBS: the T28 red commit only fixes the API the checks call; every function throws until the implementation lands.

/** One test's recorded flow. Edge ids use the static graph's naming (`kind:path#Qualified`, @mole/indexer). */
export interface TestFlow {
  test: string;
  file: string;
  /** [caller id, callee id, times] */
  edges: Array<[string, string, number]>;
  /** functions entered with no instrumented caller (called by the test runner, the event loop, or module code) */
  roots: string[];
  /** first logical call chain seen for each callee in this test, outermost first, ending with the callee */
  paths: Record<string, string[]>;
}

export interface FlowRuntime {
  begin(test: string, file: string): void;
  end(): void;
  flows(): TestFlow[];
  reset(): void;
}

export interface InstrumentResult {
  code: string;
  functions: number;
}

export interface FlowsMeta {
  time: string;
  root: string;
  commit: string;
  files: string[];
  wallMs: number;
  exit: number;
  tests: { passed: number; failed: number };
}

export interface FlowStore {
  dir: string;
  meta: FlowsMeta | null;
  tests: TestFlow[];
}

export interface RecordOptions {
  root: string;
  /** test files (relative to root); default: the repo's whole vitest suite */
  files?: string[];
  /** store dir; default <root>/.mole/local/flows */
  out?: string;
  /** false = plain vitest run with the same wrapper (overhead baseline), nothing recorded */
  instrument?: boolean;
  /** vitest config to extend; default: the root's vitest/vite config if any */
  baseConfig?: string;
}

export interface RecordResult {
  out: string;
  wallMs: number;
  exit: number;
  tests: { passed: number; failed: number };
  flows: number;
}

export interface SymbolFlows {
  target: string;
  ids: string[];
  tests: Array<{ test: string; file: string; path: string[] }>;
  callers: Array<{ id: string; count: number }>;
  callees: Array<{ id: string; count: number }>;
}

const todo = (what: string): never => {
  throw new Error(`@mole/flows: ${what} not implemented (T28)`);
};

export function instrumentSource(_code: string, _relPath: string, _opts: { idPath?: string } = {}): InstrumentResult | null {
  return todo('instrumentSource');
}
export function installRuntime(): FlowRuntime {
  return todo('installRuntime');
}
export function writeFlows(_dir: string, _flows: TestFlow[], _meta?: Partial<FlowsMeta>): void {
  todo('writeFlows');
}
export function loadFlows(_dir: string): FlowStore {
  return todo('loadFlows');
}
export function flowsFor(_store: FlowStore, _target: string): SymbolFlows {
  return todo('flowsFor');
}
export async function recordFlows(_o: RecordOptions): Promise<RecordResult> {
  return todo('recordFlows');
}
export async function flowsCli(_pos: string[], _flags: Record<string, string | true>, _root: string): Promise<number> {
  return todo('flowsCli');
}
