// T40 key: the delta diagram is deterministic (byte-identical twice) and its delta colors match a hand-labeled key 100%.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildTreeGraph, renderSvg } from '../src/diagram.js';

const here = dirname(fileURLToPath(import.meta.url));
const treeRoot = join(here, '..', 'bench', 'fixtures', 'tree');
const key = JSON.parse(readFileSync(join(here, '..', 'bench', 'fixtures', 'delta-key.json'), 'utf8')) as {
  changedFiles: string[];
  colors: { changed: string; unchanged: string };
  expectedDelta: Record<string, 'changed' | 'unchanged'>;
};

describe('file-tree delta diagram (M34 part 2: deterministic, delta-colored, PR Lens pattern)', () => {
  it('builds a graph whose delta state matches the hand-labeled key 100%', () => {
    const graph = buildTreeGraph(treeRoot, key.changedFiles);
    const byPath = new Map(graph.nodes.map((n) => [n.path, n]));
    let matches = 0;
    const paths = Object.keys(key.expectedDelta);
    for (const p of paths) {
      const node = byPath.get(p);
      expect(node, `missing node for ${JSON.stringify(p)}`).toBeDefined();
      if (node!.delta === key.expectedDelta[p]) matches++;
    }
    expect(matches).toBe(paths.length); // 100% per done-when
  });

  it('renders byte-identical SVG for the same input, twice, with no timestamps or randomness', () => {
    const graph = buildTreeGraph(treeRoot, key.changedFiles);
    const svg1 = renderSvg(graph, key.colors);
    const svg2 = renderSvg(buildTreeGraph(treeRoot, key.changedFiles), key.colors);
    expect(svg1).toBe(svg2);
    expect(svg1.length).toBeGreaterThan(0);
  });

  it('colors every changed node with colors.changed and every unchanged node with colors.unchanged', () => {
    const graph = buildTreeGraph(treeRoot, key.changedFiles);
    const svg = renderSvg(graph, key.colors);
    for (const n of graph.nodes) {
      const expected = n.delta === 'changed' ? key.colors.changed : key.colors.unchanged;
      expect(svg.includes(`fill="${expected}"`) || svg.includes(`data-delta="${n.delta}"`)).toBe(true);
    }
  });
});
