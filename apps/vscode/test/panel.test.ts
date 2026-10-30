// T34 one-panel (M26). Red-tests commit (R1): written against a key dated before any implementation
// (tasks/T34-one-panel/4 log/m26-key.json). Exercises src/panelData.ts, which does not exist yet.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildPanelModel, SECTION_IDS, type PanelModel, type Runners } from '../src/panelData.js';

const noop = async (): Promise<never> => {
  throw new Error('should not be called in this test');
};

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
});

describe('buildPanelModel (M26a: 8 sections cover 14 CLI read features)', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'mole-m26-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('has all 8 sections, each with a one-line caption tying it to the decisions-behind-the-code center', async () => {
    const model = await buildPanelModel({ root: dir, file: 'src/a.ts', line: 1, symbol: undefined }, okRunners());
    expect(Object.keys(model.sections).sort()).toEqual([...SECTION_IDS].sort());
    for (const id of SECTION_IDS) {
      expect(model.sections[id].caption.length).toBeGreaterThan(10);
      expect(model.sections[id].caption.toLowerCase()).toMatch(/decision/);
    }
  });

  it('failure case a: no .mole and no git -> every section is a one-line "what to do", zero thrown errors', async () => {
    const notRepoRunners: Runners = {
      ...okRunners(),
      map: async () => ({ state: 'error', message: 'not a git repository' }) as never,
      impact: async () => ({ state: 'error', message: 'not a git repository' }) as never,
      decisions: async () => ({ decisions: [], tenets: [] }) as never,
      rules: async () => ({ violations: [] }) as never,
      check: async () => {
        throw new Error('not a git repository');
      },
      questions: async () => {
        throw new Error('not a git repository');
      },
      since: async () => {
        throw new Error('not a git repository');
      },
      flows: async () => ({ tests: [], callers: [], callees: [] }) as never,
      claims: async () => ({ claims: [] }) as never,
      collisions: async () => ({ pairs: [] }) as never,
      tried: async () => ({ tried: [] }) as never,
    };
    let model: PanelModel | undefined;
    let threw = false;
    try {
      model = await buildPanelModel({ root: dir, file: 'src/a.ts', line: 1, symbol: undefined }, notRepoRunners);
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
    for (const id of SECTION_IDS) {
      const s = model!.sections[id];
      expect(['ok', 'empty', 'unavailable']).toContain(s.status);
      if (s.status !== 'ok') {
        expect(s.message?.split('\n').length).toBe(1);
        expect(s.message!.length).toBeGreaterThan(0);
      }
    }
  });

  it('failure case b: one failing data source degrades only its own section', async () => {
    const oneFails: Runners = {
      ...okRunners(),
      decisions: async () => {
        throw new Error('boom: decisions graph corrupt');
      },
    };
    const model = await buildPanelModel({ root: dir, file: 'src/a.ts', line: 1, symbol: undefined }, oneFails);
    expect(model.sections.decisions.status).toBe('error');
    expect(model.sections.decisions.message).toContain('boom');
    for (const id of SECTION_IDS) {
      if (id === 'decisions') continue;
      expect(model.sections[id].status).not.toBe('error');
    }
  });

  it('never calls a runner that was not provided (each source wrapped independently)', async () => {
    const mostlyUnset = { ...okRunners(), tried: noop as unknown as Runners['tried'] };
    const model = await buildPanelModel({ root: dir, file: 'src/a.ts', line: 1, symbol: undefined }, mostlyUnset);
    expect(model.sections.agents.status).toBe('error');
    expect(model.sections.decisions.status).not.toBe('error');
  });
});
