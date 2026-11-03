// T48 done-when #3: Nixon diamond + an undercut example, labelled correctly end to end through
// packages/reasoning's evaluate() -- Argdown source -> loadGraph -> argumentFramework -> evaluate().
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { evaluate } from '@mole/reasoning';
import { afterEach, describe, expect, it } from 'vitest';
import { argumentFramework, loadGraph } from '../src/index.js';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function repo(argdown: string): string {
  const root = mkdtempSync(join(tmpdir(), 'mole-dec-reasoning-'));
  dirs.push(root);
  const p = join(root, '.mole/arguments/case.argdown');
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, argdown);
  execFileSync('git', ['-C', root, '-c', 'user.name=T', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', 'init', '-q', '-b', 'main']);
  return root;
}

describe('Argdown relations through packages/reasoning evaluate() (T48 end to end)', () => {
  it('Nixon diamond (mutual attack, no defender): both arguments undecided, same as the memo\'s worked example', () => {
    // memo §5: B1 and B2 symmetrically attack each other with no third argument defending either side.
    const source = ['<B1>: Nixon is a Quaker; Quakers are typically pacifists, so Nixon is a pacifist.', '  -> <B2>: Nixon is a Republican; Republicans are typically not pacifists, so Nixon is not a pacifist.', '', '<B2>', '  -> <B1>', ''].join('\n');
    const root = repo(source);
    const graph = loadGraph(root);
    expect(graph.problems).toHaveLength(0);

    const { framework } = argumentFramework(graph);
    expect(framework.args.map((a) => a.id).sort()).toEqual(['B1', 'B2']);
    expect(framework.attacks.map(([f, t]) => `${f}->${t}`).sort()).toEqual(['B1->B2', 'B2->B1']);

    const result = evaluate(framework);
    expect(result.labels['B1']).toBe('undecided');
    expect(result.labels['B2']).toBe('undecided');
  });

  it('undercut example: the exception undercuts the general rule, collapsed to a plain attack', () => {
    // Carneades/CAES-style "argument pro an exception" collapsed to a Dung attack (types.ts doc comment,
    // memo §4.1/§4.2): Exception has no attacker of its own -> in; Base is attacked by an 'in' argument -> out.
    const source = ['<Base>: Tweety is a bird, so Tweety can fly.', '  <_ <Exception>: Tweety is a penguin, and penguins cannot fly.', ''].join('\n');
    const root = repo(source);
    const graph = loadGraph(root);
    expect(graph.problems).toHaveLength(0);

    const { framework, supportedBy } = argumentFramework(graph);
    expect(framework.attacks).toEqual([['Exception', 'Base']]);
    expect(supportedBy.size).toBe(0); // no supports edges in this fixture

    const result = evaluate(framework);
    expect(result.labels['Exception']).toBe('in');
    expect(result.labels['Base']).toBe('out');
    expect(result.why['Base']?.defeatedBy).toBe('Exception');
  });

  it('a supports edge is recorded in the graph but excluded from the Framework (memo §4.3: plain Dung has no support slot)', () => {
    const source = ["[A]: The Beatles are the best!", "  + [B]: The Beatles made 'Rubber Soul'!", '  -> <C>: The Rolling Stones were cooler!', ''].join('\n');
    const root = repo(source);
    const graph = loadGraph(root);
    expect(graph.edges.some((e) => e.type === 'supports')).toBe(true);
    // Argdown statements and arguments are interchangeable relation endpoints in Dung's abstract sense
    // (a statement that attacks/supports something is still an abstract "argument" to a Dung reasoner);
    // Mole's NodeKind collapses both into 'argument', keeping Argdown's own statement/argument
    // distinction only in statusText (display), per the loader's doc comment.
    expect(graph.nodes.filter((n) => n.kind === 'argument').map((n) => n.id).sort()).toEqual(['A', 'B', 'C']);

    const { framework, supportedBy } = argumentFramework(graph);
    expect(framework.args.map((a) => a.id).sort()).toEqual(['A', 'B', 'C']);
    expect(framework.attacks).toEqual([['A', 'C']]); // A attacks C; B's "+" edge is support, not fed into the Framework
    expect(supportedBy.get('A')).toEqual(['B']); // display-only: B supports A
  });

  // T67: self-attack semantics decision (prior-art.md D1), checked end to end through this package's
  // own argumentFramework() + packages/reasoning's evaluate() -- the two primary sources (Caminada's
  // complete-labelling definition; ICCMA's own IN/UNDEC notation, both prior-art.md #2/#3) agree a
  // self-attacking argument with no other attacker is UNDECIDED under grounded, not OUT: it can never
  // be 'in' (attacks itself, so never conflict-free) and can never be 'out' either (its only attacker,
  // itself, can never be 'in' first). Carneades's own dung.go was NOT RUN (no local Go toolchain/
  // network -- prior-art.md #4); this is the Caminada/ICCMA reference instead.
  it('a bare self-attacking argument (no other attacker) is undecided under grounded, matching the Caminada/ICCMA reference', () => {
    const source = '[A]: a self-contradictory claim\n  - [A]\n';
    const root = repo(source);
    const graph = loadGraph(root);
    expect(graph.problems).toHaveLength(0);

    const { framework } = argumentFramework(graph);
    expect(framework.attacks).toEqual([['A', 'A']]);

    const result = evaluate(framework);
    expect(result.labels['A']).toBe('undecided');
  });

  // Dung's documented "self-defeat poisons anything it attacks" phenomenon (prior-art.md D1,
  // Baumann/Spanring/Woltran AAAI-20): a self-attacker that also attacks B leaves B undecided too,
  // because B's only attacker (the self-attacker) can never become 'in' to make B 'out'.
  it('a self-attacker that also attacks another argument leaves that argument undecided too (no false reinstatement)', () => {
    const source = '[A]: a self-contradictory claim\n  - [A]\n\n[A]\n  -> [B]: B, attacked only by the self-contradictory claim\n';
    const root = repo(source);
    const graph = loadGraph(root);
    expect(graph.problems).toHaveLength(0);

    const { framework } = argumentFramework(graph);
    expect(framework.attacks.sort()).toEqual([['A', 'A'], ['A', 'B']]);

    const result = evaluate(framework);
    expect(result.labels['A']).toBe('undecided');
    expect(result.labels['B']).toBe('undecided');
  });
});
