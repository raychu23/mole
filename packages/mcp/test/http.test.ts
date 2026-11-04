import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request as httpRequest } from 'node:http';
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

// T91-distribution-channels review fix HIGH 1: the MCP spec (2025-03-26 through 2026-07-28) says servers
// MUST validate the Origin header on every incoming connection to prevent DNS rebinding, independent of
// bind address. These three prove the SDK's own enableDnsRebindingProtection + allowedHosts/allowedOrigins
// are actually wired in (not just declared), against the real HTTP server, not a unit mock.
function rawPost(url: string, headers: Record<string, string>): Promise<{ status: number; body: string }> {
  const u = new URL(url);
  // Node's http.request() wants a bare address for `hostname` (no brackets) -- `new URL(...).hostname` keeps
  // the brackets for an IPv6 literal (`[::1]`), which getaddrinfo then fails to resolve as a literal string.
  const hostname = u.hostname.replace(/^\[|\]$/g, '');
  return new Promise((resolvePromise, reject) => {
    const req = httpRequest(
      { hostname, port: u.port, path: u.pathname, method: 'POST', headers: { 'content-type': 'application/json', ...headers } },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => resolvePromise({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') }));
      },
    );
    req.on('error', reject);
    req.end(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '0' } } }));
  });
}

it('a cross-origin POST (Origin: https://evil.example) is rejected with 403', async () => {
  const root = mkdtempSync(join(tmpdir(), 'mole-mcp-http-origin-'));
  cleanups.push(() => rmSync(root, { recursive: true, force: true }));
  const server = await startMoleHttpServer({ root, stateDir: join(root, '.state') });
  cleanups.push(() => server.close());

  const res = await rawPost(server.url, { origin: 'https://evil.example', accept: 'application/json, text/event-stream' });
  expect(res.status).toBe(403);
});

it('a mismatched Host header is rejected with 403', async () => {
  const root = mkdtempSync(join(tmpdir(), 'mole-mcp-http-host-'));
  cleanups.push(() => rmSync(root, { recursive: true, force: true }));
  const server = await startMoleHttpServer({ root, stateDir: join(root, '.state') });
  cleanups.push(() => server.close());

  const res = await rawPost(server.url, { host: 'evil.example', accept: 'application/json, text/event-stream' });
  expect([403, 421]).toContain(res.status);
});

it('an allowed local Origin on the bound host/port still gets 200', async () => {
  const root = mkdtempSync(join(tmpdir(), 'mole-mcp-http-allowed-origin-'));
  cleanups.push(() => rmSync(root, { recursive: true, force: true }));
  const server = await startMoleHttpServer({ root, stateDir: join(root, '.state') });
  cleanups.push(() => server.close());

  const res = await rawPost(server.url, { origin: new URL(server.url).origin, accept: 'application/json, text/event-stream' });
  expect(res.status).toBe(200);
});

it('binding past loopback without allowNonLoopback + bearerToken is refused before listening', async () => {
  const root = mkdtempSync(join(tmpdir(), 'mole-mcp-http-nonloopback-'));
  cleanups.push(() => rmSync(root, { recursive: true, force: true }));
  await expect(startMoleHttpServer({ root, stateDir: join(root, '.state') }, { host: '0.0.0.0' })).rejects.toThrow(/allowNonLoopback|bearerToken/);
});

// T91 review round 2 fix MEDIUM: an IPv6 bind must produce a bracketed authority (`[::1]:PORT`) in both
// the returned `url` and the allowedHosts/allowedOrigins the SDK checks Host/Origin against -- an
// unbracketed `::1:PORT` is not a valid authority (ambiguous with the port separator) and would never
// match a real client's own bracketed Host/Origin header, silently breaking every IPv6 loopback request.
it('binding [::1] (IPv6 loopback): url is bracketed and a bracketed Host/Origin round-trips to 200', async () => {
  const root = mkdtempSync(join(tmpdir(), 'mole-mcp-http-ipv6-'));
  cleanups.push(() => rmSync(root, { recursive: true, force: true }));
  const server = await startMoleHttpServer({ root, stateDir: join(root, '.state') }, { host: '::1' });
  cleanups.push(() => server.close());

  expect(server.url).toMatch(/^http:\/\/\[::1\]:\d+\/mcp$/);
  const port = new URL(server.url).port;

  const withHeaders = await rawPost(server.url, {
    host: `[::1]:${port}`,
    origin: `http://[::1]:${port}`,
    accept: 'application/json, text/event-stream',
  });
  expect(withHeaders.status).toBe(200);
});

it('binding [::1] (IPv6 loopback): a request with no Origin header still gets 200 (non-browser clients)', async () => {
  const root = mkdtempSync(join(tmpdir(), 'mole-mcp-http-ipv6-noorigin-'));
  cleanups.push(() => rmSync(root, { recursive: true, force: true }));
  const server = await startMoleHttpServer({ root, stateDir: join(root, '.state') }, { host: '::1' });
  cleanups.push(() => server.close());
  const port = new URL(server.url).port;

  const res = await rawPost(server.url, { host: `[::1]:${port}`, accept: 'application/json, text/event-stream' });
  expect(res.status).toBe(200);
});
