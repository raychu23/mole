#!/usr/bin/env node
// stdio MCP server. Root = MOLE_ROOT or cwd; MOLE_STATE_DIR / MOLE_TSCONFIG / MOLE_SRC_DIR as for the daemon CLI.
import { resolve } from 'node:path';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';

const server = createServer({
  root: resolve(process.env.MOLE_ROOT ?? process.cwd()),
  stateDir: process.env.MOLE_STATE_DIR,
  tsconfig: process.env.MOLE_TSCONFIG,
  srcDir: process.env.MOLE_SRC_DIR,
  // T113 (core cut, D77): default exposes only the 5 core tools; set MOLE_MCP_ALL_TOOLS=1 to get the rest
  // (reasoning/priorities/incident/proposals/recall, hotspots, coupling, outcomes, oneonone, compile/cascade,
  // collisions, agent_intent, coverage, interrogate, decisions_asof) -- see docs/mcp.md.
  allTools: process.env.MOLE_MCP_ALL_TOOLS === '1',
});
// T16: spans when MOLE_OTEL=1 (no-op otherwise); flush them when the client goes away
const otel = await import('@mole/telemetry');
if (await otel.startTelemetry('mole-mcp')) {
  const bye = () => void otel.shutdownTelemetry().finally(() => process.exit(0));
  process.stdin.on('end', bye);
  for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, bye);
}
await server.connect(new StdioServerTransport());
