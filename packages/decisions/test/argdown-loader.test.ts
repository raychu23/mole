// T48: the Argdown loader, wired into loadGraph -- `.mole/arguments/**/*.argdown` files and
// ```argdown fenced blocks in `.mole/arguments/**/*.md` + `.mole/decisions/*.md` become
// `argument`-kind GraphNodes with supports/attacks/undercuts GraphEdges.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadGraph } from '../src/index.js';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function repo(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'mole-dec-argdown-'));
  dirs.push(root);
  for (const [p, t] of Object.entries(files)) {
    mkdirSync(dirname(join(root, p)), { recursive: true });
    writeFileSync(join(root, p), t);
  }
  execFileSync('git', ['-C', root, '-c', 'user.name=T', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', 'init', '-q', '-b', 'main']);
  return root;
}

describe('loadArgdown via loadGraph', () => {
  it('loads a .argdown file under .mole/arguments into argument nodes + edges', () => {
    const root = repo({
      '.mole/arguments/beatles.argdown': `[A]: The Beatles are the best!\n  + [B]: The Beatles made 'Rubber Soul'!\n  -> <C>: The Rolling Stones were cooler!\n`,
    });
    const graph = loadGraph(root);
    const argNodes = graph.nodes.filter((n) => n.kind === 'argument');
    expect(argNodes.map((n) => n.id).sort()).toEqual(['A', 'B', 'C']);
    expect(argNodes.every((n) => n.format === 'argdown')).toBe(true);

    const supports = graph.edges.filter((e) => e.type === 'supports');
    const attacks = graph.edges.filter((e) => e.type === 'attacks');
    expect(supports).toHaveLength(1);
    expect(supports[0]).toMatchObject({ from: 'B', to: 'A' });
    expect(attacks).toHaveLength(1);
    expect(attacks[0]).toMatchObject({ from: 'A', to: 'C' });
  });

  it('loads an ```argdown fenced block inside a markdown file, with the right file:line', () => {
    const md = ['# Review notes', '', 'Some prose first.', '', '```argdown', '<Base>: Tweety is a bird, so Tweety can fly.', '  <_ <Exception>: Tweety is a penguin.', '```', ''].join('\n');
    const root = repo({ '.mole/arguments/review.md': md });
    const graph = loadGraph(root);
    const undercut = graph.edges.find((e) => e.type === 'undercuts');
    expect(undercut).toBeDefined();
    expect(undercut).toMatchObject({ from: 'Exception', to: 'Base' });
    // fence opens at line 5; body starts at line 6 ("<Base>: ..."); the undercut relation line is the body's 2nd line = file line 7
    expect(undercut!.line).toBe(7);
    expect(undercut!.file).toBe('.mole/arguments/review.md');
  });

  it('a repo with no .mole/arguments is unaffected (no problems, no argument nodes)', () => {
    const root = repo({ '.mole/decisions/d1.md': '---\nid: d1\ntitle: x\nstatus: accepted\n---\n' });
    const graph = loadGraph(root);
    expect(graph.nodes.some((n) => n.kind === 'argument')).toBe(false);
    expect(graph.problems).toHaveLength(0);
  });

  // T67: a self-attack edge must reach the graph (not be dropped by graph.ts's Builder.edge, which
  // used to treat e.from === e.to as always meaningless -- true for ADR relation types, wrong for
  // supports/attacks/undercuts; see prior-art.md #1).
  it('a self-attack edge survives into the graph (not silently dropped)', () => {
    const root = repo({ '.mole/arguments/self.argdown': '[A]: a self-contradictory claim\n  - [A]\n' });
    const graph = loadGraph(root);
    expect(graph.problems).toHaveLength(0);
    const attacks = graph.edges.filter((e) => e.type === 'attacks');
    expect(attacks).toHaveLength(1);
    expect(attacks[0]).toMatchObject({ from: 'A', to: 'A' });
  });

  // T67: a duplicate argument id (same title re-defined with its own `: text` in a second file) must
  // produce an explicit problem naming both files/lines, not just silently merge (loader.ts:69-75
  // used to bypass graph.ts's own "duplicate id" problem reporting here).
  it('a duplicate argument id across two files produces a problem naming both files/lines', () => {
    const root = repo({
      '.mole/arguments/first.argdown': '[A]: the first definition of A\n',
      '.mole/arguments/second.argdown': '[A]: a second, conflicting definition of A\n',
    });
    const graph = loadGraph(root);
    expect(graph.problems).toHaveLength(1);
    const p = graph.problems[0]!;
    expect(p.file).toBe('.mole/arguments/second.argdown');
    expect(p.message).toMatch(/duplicate argument id/i);
    expect(p.message).toContain('A');
    expect(p.message).toContain('.mole/arguments/first.argdown');
    // only the first definition's node is kept (same "first one kept" rule as graph.ts's own Builder.node)
    expect(graph.nodes.filter((n) => n.id === 'A')).toHaveLength(1);
  });

  // T67: a bare cross-file reference to an already-defined title (no `: text` of its own) is normal
  // Argdown usage -- the same statement/argument reused across documents, not a conflict -- and must
  // stay silent, same as before this task.
  it('a bare cross-file reference to an existing id is NOT reported as a duplicate', () => {
    const root = repo({
      '.mole/arguments/first.argdown': '[A]: the only definition of A\n',
      '.mole/arguments/second.argdown': '[A]\n  - [B]: B attacks A\n',
    });
    const graph = loadGraph(root);
    expect(graph.problems).toHaveLength(0);
  });
});
