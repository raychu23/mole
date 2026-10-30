// T31 connection requirement: packages/mcp gets exactly one import + one call (registerOneOnOneTool in
// server.ts) registering `mole_oneonone`. This test proves the registration happened and exercises prep +
// readback against a real temp repo with a real .mole/decisions record, without spinning up the daemon.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { registerOneOnOneTool } from '../src/oneonone-tool.js';

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const c of cleanups.splice(0).reverse()) c();
});

type Registered = { name: string; config: { title: string; description: string }; handler: (args: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> };

function fakeServer() {
  const tools: Registered[] = [];
  return {
    tools,
    registerTool(name: string, config: Registered['config'], handler: Registered['handler']) {
      tools.push({ name, config, handler });
    },
  };
}

describe('mole_oneonone (packages/mcp connection point)', () => {
  it('is registered once, named mole_oneonone, describing folder-grouped prep + read-back (never per person)', () => {
    const server = fakeServer();
    // @ts-expect-error -- fakeServer implements only the one method this tool calls
    registerOneOnOneTool(server, { root: '.' });
    expect(server.tools.map((t) => t.name)).toContain('mole_oneonone');
    const tool = server.tools.find((t) => t.name === 'mole_oneonone')!;
    expect(tool.config.description).toContain("'Ask'");
    expect(tool.config.description).toContain('FOLDER');
    expect(tool.config.description).toContain('never by person');
  });

  it('prep groups a real logged question against a real .mole/decisions record, folder-scoped', async () => {
    const root = mkdtempSync(join(tmpdir(), 'mole-oneonone-mcp-'));
    cleanups.push(() => rmSync(root, { recursive: true, force: true }));
    mkdirSync(join(root, '.mole', 'decisions'), { recursive: true });
    writeFileSync(join(root, '.mole', 'decisions', 'D1-resume.md'), '# D1 resume\nthe resume is the plan, bullet 1 covers design reviews and mentorship.\n');
    mkdirSync(join(root, '.mole', 'local', 'oneonone'), { recursive: true });
    writeFileSync(
      join(root, '.mole', 'local', 'oneonone', 'questions.json'),
      JSON.stringify([{ id: 'q1', text: 'this is what I currently have planned for resume and I have some big problems', folder: 'context/product-plan', loggedAt: '2026-10-29' }]),
    );
    const server = fakeServer();
    // @ts-expect-error -- fakeServer implements only the one method this tool calls
    registerOneOnOneTool(server, { root });
    const tool = server.tools.find((t) => t.name === 'mole_oneonone')!;
    const res = await tool.handler({ action: 'prep' });
    expect(res.isError).toBeFalsy();
    const parsed = JSON.parse(res.content[0]!.text) as { groups: Array<{ folder: string; items: Array<{ match?: { recordId: string } }> }> };
    expect(parsed.groups[0]?.folder).toBe('context/product-plan');
    expect(parsed.groups[0]?.items[0]?.match?.recordId).toBe('D1-resume');
  });

  it('readback stores a confirm/reject keyed by folder + question id (no person field)', async () => {
    const root = mkdtempSync(join(tmpdir(), 'mole-oneonone-mcp-'));
    cleanups.push(() => rmSync(root, { recursive: true, force: true }));
    const server = fakeServer();
    // @ts-expect-error -- fakeServer implements only the one method this tool calls
    registerOneOnOneTool(server, { root });
    const tool = server.tools.find((t) => t.name === 'mole_oneonone')!;
    const res = await tool.handler({ action: 'readback', folder: 'tasks', questionId: 'q1', verdict: 'confirmed', recordId: 'rec-handoff' });
    expect(res.isError).toBeFalsy();
    expect(res.content[0]!.text).not.toMatch(/"person"|"author"|"raymond"/i);
    expect(JSON.parse(res.content[0]!.text).stored.verdict).toBe('confirmed');
  });
});
