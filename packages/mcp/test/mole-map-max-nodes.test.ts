// T50 done-when 3 / core-audit agent-surfaces.md rank 4 (Serena symbol_tools.py max_matches: "a huge match set
// degrades gracefully instead of truncating silently"): mole_map's node cap (@mole/core MAX_MAP_NODES = 25) was
// fixed, not caller-tunable -- a client that wants a SMALLER map (to save context) had no way to ask for one.
// `maxNodes` lets a caller cap the tool's own response further (never larger than the server-side ceiling, since
// that part stays in packages/daemon, out of this task's boundary); dropped nodes move into `more` so nothing is
// silently lost. RED before server.ts's maxNodes handling; GREEN after.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { afterEach, expect, it } from 'vitest';
import { MoleClient } from '@mole/daemon';

const here = dirname(fileURLToPath(import.meta.url));
const bin = join(here, '../dist/cli.js');

const cleanups: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  for (const c of cleanups.splice(0).reverse()) await c();
});

it('mole_map maxNodes caps the returned neighbourhood below the server-side ceiling, caller-tunable', async () => {
  const root = mkdtempSync(join(tmpdir(), 'mole-mcp-maxnodes-'));
  cleanups.push(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'src'));
  // a.ts is called by 4 different files, so its full map has focus + 4 callers = 5 nodes
  writeFileSync(join(root, 'src/a.ts'), 'export function a() {\n  return 1;\n}\n');
  for (const name of ['b', 'c', 'd', 'e']) {
    writeFileSync(join(root, `src/${name}.ts`), `import { a } from './a.js';\nexport function ${name}() {\n  return a();\n}\n`);
  }
  const stateDir = join(root, '.state');
  const env = { ...process.env, MOLE_ROOT: root, MOLE_STATE_DIR: stateDir } as Record<string, string>;
  const client = new Client({ name: 'test', version: '0' });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: ['--no-warnings', bin], env }));
  cleanups.push(() => client.close());
  cleanups.push(() => new MoleClient({ root, stateDir }).call('shutdown').catch(() => undefined));

  const full = await client.callTool({ name: 'mole_map', arguments: { target: 'src/a.ts' } });
  const fullText = (full.content as Array<{ text: string }>)[0]?.text ?? '';
  const fullCount = Number(/\((\d+) nodes,/.exec(fullText)?.[1] ?? NaN);
  expect(fullCount).toBeGreaterThanOrEqual(5);

  const capped = await client.callTool({ name: 'mole_map', arguments: { target: 'src/a.ts', maxNodes: 2 } });
  const cappedText = (capped.content as Array<{ text: string }>)[0]?.text ?? '';
  const cappedCount = Number(/\((\d+) nodes,/.exec(cappedText)?.[1] ?? NaN);
  expect(cappedCount).toBe(2); // focus + 1, never the fixed server-side cap
  expect(cappedCount).toBeLessThan(fullCount);
  expect(cappedText).toMatch(/\+\d+ more/); // dropped nodes are accounted for, not silently gone

  await new MoleClient({ root, stateDir }).call('shutdown');
}, 60000);
