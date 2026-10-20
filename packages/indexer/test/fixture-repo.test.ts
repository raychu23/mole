import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { missingEvidence } from '@mole/core';
import { readGraph, TsIndexer } from '../src/index.js';

// Real-repo proof for M0: the hermes ui-tui fixture (read-only). Skipped where the fixture is not checked out.
const root = join(homedir(), '.hermes/hermes-agent/ui-tui');

describe.skipIf(!existsSync(join(root, 'tsconfig.build.json')))('ui-tui fixture', () => {
  it('indexes every src file and every current-layer node/edge has file:line@commit', () => {
    const ix = new TsIndexer({ root, tsconfig: 'tsconfig.build.json', srcDir: 'src' });
    const stats = ix.indexAll();
    const g = readGraph(ix.db);
    ix.close();
    expect(stats.files).toBeGreaterThanOrEqual(300);
    expect(stats.partialFiles).toBe(0);
    expect(g.nodes.length).toBeGreaterThan(1000);
    expect(g.edges.some((e) => e.kind === 'calls')).toBe(true);
    expect(missingEvidence([...g.nodes, ...g.edges])).toEqual([]);
  }, 120_000);
});
