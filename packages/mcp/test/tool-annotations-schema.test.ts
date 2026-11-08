// T50 done-when 4 (core-audit agent-surfaces.md rank 3; official filesystem server server.ts:331 "annotations: {
// readOnlyHint: true, openWorldHint: false }" + Anthropic's mcp-builder node_mcp_server.md listing annotations /
// outputSchema as required alongside title/description/inputSchema): Mole had 0 tools with annotations or
// outputSchema -- a client had to re-parse text to get structured data MCP already has a slot for, and had no
// readOnlyHint to skip a permission prompt on a tool that never writes. RED before server.ts/collisions-tool.ts/
// oneonone-tool.ts/compile-cascade-tool.ts register annotations + outputSchema; GREEN after (the MCP SDK itself
// throws on a mismatched structuredContent -- see node_modules/@modelcontextprotocol/sdk server/mcp.js
// validateToolOutput -- so a passing callTool() here IS the schema-validation proof).
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../src/server.js';

const dirs: string[] = [];
// mole_coverage / mole_tried read the machine's real agent logs (~/.hermes/state.db, ~/.claude/projects,
// ~/.codex/sessions; agentstate defaultSources). On a busy dev machine that took 17-18 s per call and timed this
// schema test out (11-02, alone, after the T55 merge). The test proves output-schema validity, not log reading:
// point the three sources at empty scratch paths.
const SOURCE_ENV = ['MOLE_HERMES_DB', 'MOLE_CLAUDE_DIR', 'MOLE_CODEX_DIR'] as const;
const savedEnv = new Map<string, string | undefined>();
beforeAll(() => {
  const empty = mkdtempSync(join(tmpdir(), 'mole-mcp-no-logs-'));
  dirs.push(empty);
  for (const k of SOURCE_ENV) savedEnv.set(k, process.env[k]);
  process.env.MOLE_HERMES_DB = join(empty, 'state.db');
  process.env.MOLE_CLAUDE_DIR = join(empty, 'claude');
  process.env.MOLE_CODEX_DIR = join(empty, 'codex');
});
afterAll(() => {
  for (const [k, v] of savedEnv) v === undefined ? delete process.env[k] : (process.env[k] = v);
});
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

async function connect(root: string) {
  const server = createServer({ root, noStart: true, allTools: true });
  const client = new Client({ name: 'test', version: '0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  return client;
}

// every tool whose real-world behaviour is a pure read (no writes, no deletes) -- the audit's own list (rank 3) plus
// the collisions/agent-intent tools added since, which are equally read-only and never call an external service
const READ_ONLY_TOOLS = ['mole_map', 'mole_tried', 'mole_claims', 'mole_collisions', 'mole_agent_intent', 'mole_check', 'mole_decisions', 'mole_coverage', 'mole_interrogate', 'mole_decisions_asof', 'mole_priorities', 'mole_incident_suggest', 'mole_proposals_compare', 'mole_hotspots', 'mole_recall', 'mole_coupling', 'mole_outcomes'];
// read-only but may escalate to an LLM call (openWorldHint: true) -- T46's cascade tier, not one of the audit's
// original 8, so it is checked separately rather than forced into the closed-world assumption those 8 share
const READ_ONLY_OPEN_WORLD_TOOLS = ['mole_cascade_check'];
// tools that actually write local state or a decision record (never read-only)
const WRITE_TOOLS = ['mole_oneonone', 'mole_compile_draft', 'mole_compile_review'];

// T113 (D77 cut-to-a-core): with allTools passed above, connect() still sees every tool the audit covers --
// this file proves the annotations/outputSchema contract for the FULL roster regardless of default exposure.
describe('T113 core cut: the default (no allTools) server exposes only the 5 core tools', () => {
  it('listTools() with allTools unset returns exactly CORE_TOOLS, and allTools: true restores the rest', async () => {
    const root = mkdtempSync(join(tmpdir(), 'mole-mcp-core-cut-'));
    dirs.push(root);
    const { CORE_TOOLS } = await import('../src/server.js');

    const coreOnly = createServer({ root, noStart: true });
    const coreClient = new Client({ name: 'test', version: '0' });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await Promise.all([coreClient.connect(a), coreOnly.connect(b)]);
    const { tools: coreTools } = await coreClient.listTools();
    expect(new Set(coreTools.map((t) => t.name))).toEqual(new Set(CORE_TOOLS));
    await coreClient.close();

    const full = createServer({ root, noStart: true, allTools: true });
    const fullClient = new Client({ name: 'test', version: '0' });
    const [c, d] = InMemoryTransport.createLinkedPair();
    await Promise.all([fullClient.connect(c), full.connect(d)]);
    const { tools: fullTools } = await fullClient.listTools();
    expect(fullTools.length).toBeGreaterThan(coreTools.length);
    for (const name of CORE_TOOLS) expect(fullTools.map((t) => t.name)).toContain(name);
    await fullClient.close();
  });
});

describe('every Mole MCP tool declares annotations (readOnlyHint at minimum) and an outputSchema', () => {
  it('listTools(): every tool has annotations.readOnlyHint set correctly and a non-empty outputSchema', async () => {
    const root = mkdtempSync(join(tmpdir(), 'mole-mcp-annotations-'));
    dirs.push(root);
    const client = await connect(root);
    const { tools } = await client.listTools();
    const byName = new Map(tools.map((t) => [t.name, t]));

    for (const name of READ_ONLY_TOOLS) {
      const t = byName.get(name);
      expect(t, `${name} should be registered`).toBeDefined();
      expect(t?.annotations?.readOnlyHint, `${name}.annotations.readOnlyHint`).toBe(true);
      expect(t?.annotations?.openWorldHint, `${name}.annotations.openWorldHint`).toBe(false);
      expect(t?.outputSchema, `${name}.outputSchema`).toBeDefined();
    }
    for (const name of READ_ONLY_OPEN_WORLD_TOOLS) {
      const t = byName.get(name);
      expect(t, `${name} should be registered`).toBeDefined();
      expect(t?.annotations?.readOnlyHint, `${name}.annotations.readOnlyHint`).toBe(true);
      expect(t?.outputSchema, `${name}.outputSchema`).toBeDefined();
    }
    for (const name of WRITE_TOOLS) {
      const t = byName.get(name);
      expect(t, `${name} should be registered`).toBeDefined();
      expect(t?.annotations?.readOnlyHint, `${name}.annotations.readOnlyHint`).toBe(false);
      expect(t?.outputSchema, `${name}.outputSchema`).toBeDefined();
    }
    await client.close();
  });

  it('a real call to a representative read-only tool returns structuredContent that validates against its outputSchema (the SDK throws otherwise)', async () => {
    const root = mkdtempSync(join(tmpdir(), 'mole-mcp-annotations-call-'));
    dirs.push(root);
    mkdirSync(join(root, '.mole/decisions'), { recursive: true });
    writeFileSync(join(root, '.mole/decisions/0001.md'), `---\nid: '0001'\ntitle: A decision\nstatus: accepted\nscope:\n  - a.ts\n---\n\n## Decision\n\nRule.\n`);
    const client = await connect(root);

    const decisions = await client.callTool({ name: 'mole_decisions', arguments: {} });
    expect(decisions.isError).toBeFalsy();
    expect(decisions.structuredContent).toBeDefined();
    expect((decisions.structuredContent as { decisions: unknown[] }).decisions.length).toBe(1);

    const coverage = await client.callTool({ name: 'mole_coverage', arguments: {} });
    expect(coverage.isError).toBeFalsy();
    expect(coverage.structuredContent).toBeDefined();

    const tried = await client.callTool({ name: 'mole_tried', arguments: { target: 'nonexistent-run-id' } });
    expect(tried.isError).toBeFalsy();
    expect(tried.structuredContent).toBeDefined();

    await client.close();
  });
});
