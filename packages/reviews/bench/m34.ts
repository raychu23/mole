// M34 bench: design review + meeting notes -> pinned decision drafts + deterministic delta diagram + Swimm-style
// drift split. Scores the frozen fixtures/keys committed in the R1 (red-tests) commit; never edits them (R2).
// usage: node packages/reviews/dist/bench/m34.js
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildTreeGraph, renderSvg } from '../src/diagram.js';
import { draftsFromNotes } from '../src/drafts.js';
import { classifyDrift } from '../src/drift.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(here, '..', '..', 'bench', 'fixtures');
const repoRoot = resolve(here, '..', '..', '..', '..');

interface DraftKey {
  cases: Array<{ fixture: string; expectedAnchor: string | null }>;
}
interface DeltaKey {
  changedFiles: string[];
  colors: { changed: string; unchanged: string };
  expectedDelta: Record<string, 'changed' | 'unchanged'>;
}
interface DriftKey {
  cases: Array<{ dir: string; tail: string; expected: 'trivial' | 'real' }>;
}

function part1(): { correctPct: number; invented: number; n: number } {
  const key: DraftKey = JSON.parse(readFileSync(join(fixturesDir, 'key.json'), 'utf8'));
  let correct = 0;
  let withExpectation = 0;
  let invented = 0;
  for (const c of key.cases) {
    const text = readFileSync(join(fixturesDir, 'notes', c.fixture), 'utf8');
    const drafts = draftsFromNotes(repoRoot, text).filter((d) => d.flagged);
    const d = drafts[0];
    if (c.expectedAnchor === null) {
      if (d?.anchor) invented++;
    } else {
      withExpectation++;
      if (d?.anchor === c.expectedAnchor) correct++;
    }
  }
  return { correctPct: withExpectation ? (100 * correct) / withExpectation : 100, invented, n: key.cases.length };
}

function part2(): { deltaMatchPct: number; byteIdentical: boolean } {
  const key: DeltaKey = JSON.parse(readFileSync(join(fixturesDir, 'delta-key.json'), 'utf8'));
  const treeRoot = join(fixturesDir, 'tree');
  const graph = buildTreeGraph(treeRoot, key.changedFiles);
  const byPath = new Map(graph.nodes.map((n) => [n.path, n]));
  const paths = Object.keys(key.expectedDelta);
  let matches = 0;
  for (const p of paths) if (byPath.get(p)?.delta === key.expectedDelta[p]) matches++;
  const svg1 = renderSvg(graph, key.colors);
  const svg2 = renderSvg(buildTreeGraph(treeRoot, key.changedFiles), key.colors);
  return { deltaMatchPct: (100 * matches) / paths.length, byteIdentical: svg1 === svg2 };
}

function part3(): { agreePct: number; realMisclassifiedTrivial: number; n: number } {
  const key: DriftKey = JSON.parse(readFileSync(join(fixturesDir, 'drift-key.json'), 'utf8'));
  let agree = 0;
  let realMisclassifiedTrivial = 0;
  for (const c of key.cases) {
    const before = readFileSync(join(fixturesDir, 'drift', c.dir, 'before.ts'), 'utf8');
    const after = readFileSync(join(fixturesDir, 'drift', c.dir, 'after.ts'), 'utf8');
    const r = classifyDrift('case.ts', before, after, c.tail);
    if (r.status === c.expected) agree++;
    if (c.expected === 'real' && r.status === 'trivial') realMisclassifiedTrivial++;
  }
  return { agreePct: (100 * agree) / key.cases.length, realMisclassifiedTrivial, n: key.cases.length };
}

const p1 = part1();
const p2 = part2();
const p3 = part3();
const m34 = `drafts link right ${p1.correctPct.toFixed(1)}% (n=${p1.n}), invented ${p1.invented} · diagram delta match ${p2.deltaMatchPct.toFixed(1)}%, byte-identical twice ${p2.byteIdentical} · drift split agree ${p3.agreePct.toFixed(1)}% (n=${p3.n}), real->trivial misses ${p3.realMisclassifiedTrivial} · model calls 0`;
const targetsMet = p1.correctPct >= 90 && p1.invented === 0 && p2.deltaMatchPct === 100 && p2.byteIdentical && p3.agreePct >= 90 && p3.realMisclassifiedTrivial === 0;
console.log(JSON.stringify({ metrics: { M34: m34 }, targetsMet, parts: { p1, p2, p3 } }, null, 2));
process.exit(targetsMet ? 0 : 1);
