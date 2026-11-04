import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { afterEach, expect, it } from 'vitest';
import { startMoleHttpServer } from '../src/http.js';
import type { MoleHttpServer } from '../src/http.js';

// T91-distribution-channels: proves the remote MCP channel (Docker MCP catalog "remote" type, Smithery URL
// publish, VS Code/Cursor's "http" server config) is a real, working MCP endpoint, not just a file that
// parses -- a true `initialize` + `tools/list` + `tools/call` round trip over HTTP, same assertions
// test/mcp.test.ts already makes for the stdio transport.
const cleanups: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  for (const c of cleanups.splice(0).reverse()) await c();
});

it('mole_map over streamable HTTP returns the same neighbourhood text as the stdio server', async () => {
  const root = mkdtempSync(join(tmpdir(), 'mole-mcp-http-'));
  cleanups.push(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'src'));
  writeFileSync(join(root, 'src/a.ts'), 'export function a() {\n  return 1;\n}\n');
  writeFileSync(join(root, 'src/b.ts'), "import { a } from './a.js';\nexport function b() {\n  return a();\n}\n");
  const stateDir = join(root, '.state');

  let server: MoleHttpServer | undefined;
  server = await startMoleHttpServer({ root, stateDir });
  cleanups.push(() => server!.close());

  const client = new Client({ name: 'test', version: '0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(server.url)));
  cleanups.push(() => client.close());

  const tools = await client.listTools();
  expect(tools.tools.map((t) => t.name)).toContain('mole_map');

  const res = await client.callTool({ name: 'mole_map', arguments: { target: 'src/a.ts', impact: true } });
  const text = (res.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
  expect(res.isError).toBeFalsy();
  expect(text).toContain('file src/a.ts');
  expect(text).toContain('called by: b');
});

it('an unknown path returns 404, never a crash (the endpoint is /mcp only)', async () => {
  const root = mkdtempSync(join(tmpdir(), 'mole-mcp-http-404-'));
  cleanups.push(() => rmSync(root, { recursive: true, force: true }));

  const server = await startMoleHttpServer({ root, stateDir: join(root, '.state') });
  cleanups.push(() => server.close());

  const res = await fetch(server.url.replace('/mcp', '/not-mcp'));
  expect(res.status).toBe(404);
});
