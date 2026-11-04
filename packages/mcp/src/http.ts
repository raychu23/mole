// T91-distribution-channels: remote MCP endpoint over streamable HTTP, built on the same `createServer()`
// (server.ts) the stdio CLI (cli.ts) already uses -- no new tools, no new tool logic, just a second
// transport. Stateless mode (sessionIdGenerator: undefined, same choice packages/server/src/mcpServer.ts
// made for the team server's authed HTTP MCP, see that file's own comment): one McpServer + one transport
// per request, since an McpServer instance connects to exactly one transport at a time, and a brand-new
// `mole` repo-scoped server has no per-session state worth keeping across requests anyway (unlike the team
// server, which is per-org-token-scoped).
//
// Deliberately NOT auth'd and NOT DB-backed: this is the single-user/local-repo `mole-mcp` (packages/mcp),
// the same trust model docs/mcp.md already documents for the stdio form ("treat it like any other local dev
// tool, not a networked service") -- exposing it over HTTP just adds a second way a LOCAL client (e.g. a
// Dockerized MCP client, a Smithery URL-publish target, VS Code/Cursor's "http" server type) can reach it
// without spawning a child process. Bind to 127.0.0.1 by default for exactly that reason: this is a
// loopback convenience, not a hardened remote service (an operator who wants to expose it past loopback is
// responsible for putting auth in front of it themselves -- out of scope here, same non-goal as the stdio
// form's "no authentication layer" limit).
import http from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer, type MoleMcpOptions } from './server.js';

export interface MoleHttpServer {
  url: string;
  close(): Promise<void>;
}

/** Starts a stateless streamable-HTTP MCP endpoint at POST/GET/DELETE `/mcp`, serving the exact same tools
 * as the stdio server (same `createServer(opts)`). One fresh McpServer + transport per request. */
export async function startMoleHttpServer(
  opts: MoleMcpOptions,
  listenOpts: { port?: number; host?: string } = {}
): Promise<MoleHttpServer> {
  const host = listenOpts.host ?? '127.0.0.1';

  const server = http.createServer((req, res) => {
    if (req.url !== '/mcp') {
      res.writeHead(404, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'not found' }));
      return;
    }
    void (async () => {
      // A fresh McpServer per request (stateless mode): an McpServer can only be bound to one transport at
      // a time, so reusing one instance across concurrent requests would race. `createServer` is cheap --
      // it only registers tool handlers, it does not itself open the daemon connection (that happens lazily
      // per-tool-call via `ensureDaemon`/`MoleClient`, same as the stdio path).
      const mcp = createServer(opts);
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      res.on('close', () => {
        void transport.close();
        void mcp.close();
      });
      await mcp.connect(transport);
      await transport.handleRequest(req, res);
    })().catch((err) => {
      if (!res.headersSent) res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: String(err instanceof Error ? err.message : err) }));
    });
  });

  await new Promise<void>((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(listenOpts.port ?? 0, host, () => resolveListen());
  });

  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : listenOpts.port ?? 0;
  const url = `http://${host}:${port}/mcp`;

  return {
    url,
    async close() {
      await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
    },
  };
}
