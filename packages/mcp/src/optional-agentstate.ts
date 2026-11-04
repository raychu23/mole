// T87 review fix (HIGH): @mole/agentstate is excluded from the public release export (scripts/export-public.mjs
// -- it reads the author's own machine's ~/.claude, ~/.codex and Hermes session state, an author-workflow
// concern, not an end-user Mole feature). The daemon CLI, MCP server and @mole/steer still need a few of its
// functions at runtime, so they load it here through a NON-LITERAL dynamic import specifier: tsc only tries to
// resolve a dynamic `import()` whose argument is a string literal (verified empirically -- a literal
// `import('@mole/agentstate')` fails TS2307/TS5083 once the package and its tsconfig project reference are
// gone, a variable one does not), so this keeps `npx tsc -b` green on the exported repo without the package
// being present, while behaving as a completely normal import in the private repo where it exists.
// Callers that hit the catch block in the public export get this clear message instead of a crash; in the
// private repo (and the published npm package, which bundles agentstate's dist regardless of this source
// mirror) the import always resolves and this never throws.
const AGENTSTATE_SPECIFIER = '@mole/agentstate';

/** Structural mirror of the handful of @mole/agentstate exports these callers use. Loose on purpose (not the
 * real module's precise types) -- this boundary exists so callers keep working whether or not the real
 * package is present, not to re-type agentstate's whole public API; the real module's own source is the
 * source of truth for these signatures. */
export interface AgentstateApi {
  tried: (target: string, opts: Record<string, unknown>) => object;
  claims: (run: string, opts: Record<string, unknown>) => object;
  defaultSources: (env?: NodeJS.ProcessEnv) => Record<string, unknown>;
  agentIntentsFor: (root: string, target: string) => object;
  collisions: (opts: Record<string, unknown>) => object;
}

export async function loadAgentstate(): Promise<AgentstateApi> {
  try {
    return (await import(/* not a literal on purpose, see header comment */ AGENTSTATE_SPECIFIER)) as unknown as AgentstateApi;
  } catch (e) {
    throw new Error(`@mole/agentstate is not available in this build: ${(e as Error).message}`);
  }
}
