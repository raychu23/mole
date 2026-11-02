// T43 red test (done-when 1): mole_decisions (the MCP tool agents call to get the decisions behind code --
// server.ts "the MCP get/why tool" referenced by the task contract) returns each decision's full rationale
// text (named Decision/Context/Consequences sections), not just id/title/status/flag, for a real decision record.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../src/server.js';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

it('mole_decisions carries the full Decision + Consequences text of a record, not only its title/status', async () => {
  const root = mkdtempSync(join(tmpdir(), 'mole-mcp-dec-'));
  dirs.push(root);
  mkdirSync(join(root, '.mole/decisions'), { recursive: true });
  const rationale = 'Splitting the process would lose the warm in-memory cache that every request depends on, and the team has nobody to run a cluster safely around the clock. '.repeat(6);
  writeFileSync(
    join(root, '.mole/decisions/0001-one-process.md'),
    `---\nid: '0001'\ntitle: Serve from one process\nstatus: accepted\nscope:\n  - app.ts\n---\n\n## Decision\n\n${rationale}\n\n## Consequences\n\nAny future split must keep a single cache owner.\n`,
  );

  const server = createServer({ root, noStart: true });
  const client = new Client({ name: 'test', version: '0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

  const res = await client.callTool({ name: 'mole_decisions', arguments: {} });
  const text = (res.content as Array<{ text: string }>)[0]?.text ?? '';
  const json = JSON.parse(text);
  const d = json.decisions.find((x: { id: string }) => x.id === '0001');
  expect(d).toBeDefined();
  expect(d.rationale).toContain('lose the warm in-memory cache');
  expect(d.rationale).toMatch(/Decision:/);
  expect(d.rationale).toMatch(/Consequences:/);
  await client.close();
});
