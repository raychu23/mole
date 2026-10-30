// T31 connection requirement: apps/vscode gets exactly one call into the shared panel/view file
// (src/panelData.ts -- the 'oneonone' entry in SECTION_IDS + its section() call in buildPanelModel).
// This test proves the integration point exists with the required text: an 'Ask' affordance, a
// '1:1 prep' section and a 'Read-back' section, all in the same caption (one section, one call).
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildPanelModel, SECTION_IDS, type Runners } from '../src/panelData.js';

const okRunners = (): Runners => ({
  map: async () => ({ state: 'ok', nodes: [], edges: [] }) as never,
  impact: async () => ({ state: 'ok', nodes: [], edges: [] }) as never,
  flows: async () => ({ tests: [], callers: [], callees: [] }) as never,
  noteList: async () => [],
  since: async () => ({ files: [] }) as never,
  check: async () => ({ hunks: [] }) as never,
  questions: async () => ({ questions: [], notices: [], facts: { hunks: [], notes: [], guards: [] } }) as never,
  decisions: async () => ({ decisions: [], tenets: [] }) as never,
  rules: async () => ({ violations: [] }) as never,
  testsAtLine: () => [],
  claims: async () => ({ claims: [] }) as never,
  collisions: async () => ({ pairs: [] }) as never,
  tried: async () => ({ tried: [] }) as never,
  oneonone: async () => ({ groups: [{ folder: 'tasks', items: [] }], readback: {} }) as never,
});

describe("T31 'oneonone' panel section (Ask + 1:1 prep + Read-back, one call)", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'mole-t31-panel-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('registers the oneonone section id', () => {
    expect(SECTION_IDS).toContain('oneonone');
  });

  it("caption names the 'Ask' hover affordance, the '1:1 prep' and the 'Read-back' sections", async () => {
    const model = await buildPanelModel({ root: dir, file: 'src/a.ts', line: 1, symbol: undefined }, okRunners());
    const caption = model.sections.oneonone.caption;
    expect(caption).toContain("'Ask'");
    expect(caption).toContain('1:1 prep');
    expect(caption).toContain('Read-back');
  });

  it('carries the real folder-grouped data from the runner', async () => {
    const model = await buildPanelModel({ root: dir, file: 'src/a.ts', line: 1, symbol: undefined }, okRunners());
    expect(model.sections.oneonone.status).toBe('ok');
    expect((model.sections.oneonone.data as { groups: Array<{ folder: string }> }).groups[0]?.folder).toBe('tasks');
  });
});
