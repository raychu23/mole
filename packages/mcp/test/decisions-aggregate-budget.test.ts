// T43 review fix P2 red test: MCP mole_decisions had no aggregate rationale budget when called without
// `files` -- a repo with many decisions/tenets, each carrying real rationale text, could return an
// unbounded response. This asserts a documented total budget: whole-decision dropping (never mid-
// rationale), with a `truncated` note pointing callers at `files` for a scoped, unbudgeted call.
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

async function connect(root: string) {
  const server = createServer({ root, noStart: true });
  const client = new Client({ name: 'test', version: '0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  return client;
}

function makeManyDecisions(root: string, n: number) {
  mkdirSync(join(root, '.mole/decisions'), { recursive: true });
  for (let i = 0; i < n; i++) {
    const id = String(i + 1).padStart(4, '0');
    const body = `This is decision ${id}'s real rationale text, repeated enough to be a realistic ADR-length paragraph that exercises an aggregate budget across many decisions at once. `.repeat(12); // ~3,000 chars
    writeFileSync(
      join(root, `.mole/decisions/${id}.md`),
      `---\nid: '${id}'\ntitle: Decision ${id}\nstatus: accepted\nscope:\n  - src/${id}.ts\n---\n\n## Decision\n\n${body}\n\n## Consequences\n\nEND-OF-RATIONALE-${id}\n`,
    );
  }
}

it('mole_decisions (no files arg) caps total rationale text with a documented aggregate budget, dropping whole decisions, never mid-rationale (P2 regression)', async () => {
  const root = mkdtempSync(join(tmpdir(), 'mole-mcp-dec-budget-'));
  dirs.push(root);
  const n = 15;
  makeManyDecisions(root, n); // ~15 * 3,000 chars = ~45,000 chars of rationale if nothing were capped

  const client = await connect(root);
  const res = await client.callTool({ name: 'mole_decisions', arguments: {} });
  const text = (res.content as Array<{ text: string }>)[0]?.text ?? '';
  const json = JSON.parse(text) as { decisions: Array<{ id: string; rationale?: string }>; truncated?: string };

  expect(json.decisions.length).toBe(n); // every decision is still listed (id/title/status/flag survive)

  const withRationale = json.decisions.filter((d) => d.rationale);
  const totalRationaleChars = withRationale.reduce((sum, d) => sum + (d.rationale?.length ?? 0), 0);

  // bounded total, well under the unbudgeted ~45,000 chars
  expect(totalRationaleChars).toBeLessThan(30_000);
  // whole-decision dropping: every KEPT rationale is intact (ends with its own marker), never cut mid-text
  for (const d of withRationale) expect(d.rationale).toContain(`END-OF-RATIONALE-${d.id}`);
  // at least one decision lost its rationale to the budget, and the response says so
  expect(withRationale.length).toBeLessThan(n);
  expect(json.truncated).toBeDefined();
  expect(json.truncated).toMatch(/files/);

  await client.close();
});

it('mole_decisions (files arg given) is NOT subject to the aggregate budget -- a scoped call keeps full rationale for the files it asked about', async () => {
  const root = mkdtempSync(join(tmpdir(), 'mole-mcp-dec-budget-scoped-'));
  dirs.push(root);
  const n = 15;
  makeManyDecisions(root, n);

  const client = await connect(root);
  const res = await client.callTool({ name: 'mole_decisions', arguments: { files: ['src/0001.ts', 'src/0002.ts', 'src/0003.ts'] } });
  const text = (res.content as Array<{ text: string }>)[0]?.text ?? '';
  const json = JSON.parse(text) as { decisions: Array<{ id: string; rationale?: string }>; truncated?: string };

  expect(json.decisions.map((d) => d.id).sort()).toEqual(['0001', '0002', '0003']);
  for (const d of json.decisions) expect(d.rationale).toContain(`END-OF-RATIONALE-${d.id}`);
  expect(json.truncated).toBeUndefined();

  await client.close();
});
