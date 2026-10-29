import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { formatNeighborhood } from '@mole/core';
import { ensureDaemon, MoleClient, type EnsureOptions } from '@mole/daemon';
import { defaultSources, tried } from '@mole/agentstate';
import { executeTool, GEN_AI } from '@mole/telemetry';

export interface MoleMcpOptions extends EnsureOptions {
  /** Do not spawn a daemon if none runs (tests). */
  noStart?: boolean;
}

/** `mole_map(path|symbol)`: the same ranked neighbourhood the editor panel draws, as compact text for an agent. */
export function createServer(opts: MoleMcpOptions): McpServer {
  const server = new McpServer({ name: 'mole', version: '0.0.0' });
  server.registerTool(
    'mole_map',
    {
      title: 'Mole map',
      description:
        'Ranked neighbourhood (<=25 nodes) of a file or symbol: what it defines, who calls it, what it calls, who imports it. ' +
        'Facts come from the TypeScript compiler index with file:line evidence; no LLM. Use before reading unfamiliar code. ' +
        'For "called by" and "imported by" the line is where the call or import happens (the first one; ×N means N sites); for everything else it is the declaration line.',
      inputSchema: {
        target: z.string().describe('repo-relative file (src/a.ts), file#Symbol (src/a.ts#Cls.method), or a bare symbol name'),
        impact: z.boolean().optional().describe('also mark transitive callers (what breaks if this changes) with !impact'),
      },
    },
    // T16: OTel GenAI execute_tool span per call (no-op unless MOLE_OTEL=1)
    async ({ target, impact }, extra) =>
      executeTool('mole_map', { [GEN_AI.toolCallId]: String(extra.requestId), [GEN_AI.mcpMethod]: 'tools/call', 'mole.target': target }, async (span) => {
      const client = opts.noStart ? new MoleClient(opts) : await ensureDaemon(opts);
      let n = await client.map(target, impact === true);
      for (let i = 0; i < 50 && n.state === 'indexing'; i++) {
        await new Promise((r) => setTimeout(r, 200));
        n = await client.map(target, impact === true);
      }
      span({ 'mole.map.state': n.state });
      return { content: [{ type: 'text' as const, text: formatNeighborhood(n) }], isError: n.state === 'index-unavailable' };
    }),
  );
  // T18: what agents already tried (commands, tests, fixes + outcome), including before a context compaction
  server.registerTool(
    'mole_tried',
    {
      title: 'Mole tried',
      description:
        'Commands, tests and edits an agent run already tried, each with its outcome (pass/fail/unknown) and the compaction it came before. ' +
        'Target = a run id (Hermes session, Claude Code or Codex session id, or a unique prefix) or file#Symbol / file (the runs that edited it). ' +
        'Read from the local transcripts (read-only); no LLM. Use after a compaction, before retrying a fix.',
      inputSchema: { target: z.string().describe('run id or prefix, file#Symbol, or repo-relative file') },
    },
    async ({ target }) => ({ content: [{ type: 'text' as const, text: JSON.stringify(tried(target, { ...defaultSources(), root: opts.root }), null, 2) }] }),
  );
  return server;
}
