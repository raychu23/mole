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
});
