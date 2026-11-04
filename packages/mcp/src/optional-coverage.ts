// T87 review fix (HIGH): @mole/coverage is excluded from the public release export (scripts/export-public.mjs
// -- its commit attribution depends on the literal commit-message shape the author's own private workflow
// tool writes, not an end-user Mole feature). Loaded here through a non-literal dynamic import specifier for
// the same reason as packages/mcp/src/optional-agentstate.ts (see that file's header comment for the full
// tsc-resolution rationale): a literal `import('@mole/coverage')` is statically resolved by tsc and would
// fail TS2307 once the package and its tsconfig reference are gone, a variable one is not.
const COVERAGE_SPECIFIER = '@mole/coverage';

/** Loose structural mirror of the one @mole/coverage entry `mole_coverage` needs -- see that file's own
 * source for the precise real types. */
export interface CoverageFileEntry {
  agents: Array<{ session: string }>;
  weak: { is: boolean };
  [k: string]: unknown;
}
export interface CoverageScanResult {
  notice?: string;
  files: CoverageFileEntry[];
  [k: string]: unknown;
}
export interface CoverageApi {
  coverage: (root: string, file: string) => Promise<object>;
  scanCoverage: (root: string) => CoverageScanResult;
}

export async function loadCoverage(): Promise<CoverageApi> {
  try {
    return (await import(/* not a literal on purpose, see header comment */ COVERAGE_SPECIFIER)) as unknown as CoverageApi;
  } catch (e) {
    throw new Error(`@mole/coverage is not available in this build: ${(e as Error).message}`);
  }
}
