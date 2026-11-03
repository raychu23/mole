// T60: tenets reranked as priorities shift (launch → scale). Tests first. Temp repos only, never a live .mole.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { evaluate } from '@mole/reasoning';
import { afterEach, describe, expect, it } from 'vitest';
import { argumentFramework, comparePhases, evaluatePhase, loadGraph, phaseAt, prioritiesCli, readPriorities } from '../src/index.js';

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((r) => rmSync(r, { recursive: true, force: true })));
function write(root: string, file: string, text: string) {
  mkdirSync(dirname(join(root, file)), { recursive: true });
  writeFileSync(join(root, file), text);
}

// D1 "hand-roll the queue" rests on <ship-fast> (speed); <use-kafka> (cost at scale) attacks it and vice versa.
// launch: speed > cost -> ship-fast wins, D1 holds · scale: cost > speed -> use-kafka wins, D1 defeated
function repo(priorities?: string): string {
  const root = mkdtempSync(join(tmpdir(), 'mole-t60-'));
  roots.push(root);
  write(root, '.mole/tenets.md', ['# Tenets', '', '## tenet-speed · Ship fast', '', '## tenet-cost · Drive down cost per request', ''].join('\n'));
  write(root, '.mole/decisions/d1.md', ['---', 'id: D1', 'title: Hand-roll the job queue', 'status: accepted', 'cites: [ship-fast]', '---', ''].join('\n'));
  write(root, '.mole/arguments/queue.argdown', [
    '<ship-fast>: A hand-rolled queue ships this week. #tenet-speed',
    '  -> <use-kafka>: A managed queue is cheaper per message at scale. #tenet-cost',
    '',
    '<use-kafka>',
    '  -> <ship-fast>',
    '',
  ].join('\n'));
  if (priorities !== undefined) write(root, '.mole/priorities.md', priorities);
  return root;
}

const PHASES = ['# Priorities', '', '## launch · from 2026-01-01', '', '1. tenet-speed', '2. tenet-cost', '',
  '## scale · from 2026-09-01', '', '1. tenet-cost', '2. tenet-speed', ''].join('\n');

describe('mole priorities (T60)', () => {
  it('done-when 2: no priorities file -> labels identical to the plain engine', () => {
    const root = repo();
    const plain = evaluate(argumentFramework(loadGraph(root)).framework).labels;
    expect(evaluatePhase(root).labels).toEqual(plain);
    expect(plain).toEqual({ 'ship-fast': 'undecided', 'use-kafka': 'undecided' });
  });

  it('reads phases in order with their ranks and file:line', () => {
    const p = readPriorities(repo(PHASES));
    expect(p.map((x) => [x.name, x.from, x.order])).toEqual([['launch', '2026-01-01', ['tenet-speed', 'tenet-cost']], ['scale', '2026-09-01', ['tenet-cost', 'tenet-speed']]]);
    expect(p[0]!.line).toBe(3);
  });

  it('each phase gives its own labels and decision state', () => {
    const root = repo(PHASES);
    const launch = evaluatePhase(root, { phase: 'launch' });
    expect(launch.labels).toEqual({ 'ship-fast': 'in', 'use-kafka': 'out' });
    expect(launch.decisions).toEqual([expect.objectContaining({ id: 'D1', state: 'holds' })]);
    const scale = evaluatePhase(root, { phase: 'scale' });
    expect(scale.labels).toEqual({ 'ship-fast': 'out', 'use-kafka': 'in' });
    expect(scale.decisions).toEqual([expect.objectContaining({ id: 'D1', state: 'defeated' })]);
  });

  it('--at picks the latest phase starting on or before the date', () => {
    const root = repo(PHASES);
    expect(phaseAt(readPriorities(root), '2026-05-01').name).toBe('launch');
    expect(phaseAt(readPriorities(root), '2026-09-01').name).toBe('scale');
    expect(evaluatePhase(root, { at: '2026-10-15' }).phase).toBe('scale');
    expect(() => phaseAt(readPriorities(root), '2025-12-31')).toThrow(/before the first phase/);
  });

  it('done-when 3: compare explains every changed label with the flipped attack, both tenets and both ranks', () => {
    const c = comparePhases(repo(PHASES), 'launch', 'scale');
    expect(c.arguments.map((a) => [a.id, a.before, a.after])).toEqual([['ship-fast', 'in', 'out'], ['use-kafka', 'out', 'in']]);
    const sf = c.arguments.find((a) => a.id === 'ship-fast')!;
    expect(sf.flipped).toEqual([{
      from: 'use-kafka', to: 'ship-fast', fromValue: 'tenet-cost', toValue: 'tenet-speed',
      before: { succeeds: false, ranks: [2, 1] }, after: { succeeds: true, ranks: [1, 2] },
    }]);
    expect(c.decisions).toEqual([expect.objectContaining({ id: 'D1', before: 'holds', after: 'defeated', because: ['ship-fast'] })]);
  });

  it.each([
    ['an unknown tenet', PHASES.replace('2. tenet-cost', '2. tenet-latency'), /tenet-latency.*priorities\.md:6/],
    ['a duplicate rank', PHASES.replace('2. tenet-cost', '2. tenet-speed'), /tenet-speed.*twice.*priorities\.md:6/],
    ['a bad date', PHASES.replace('from 2026-09-01', 'from soon'), /date.*priorities\.md:8/],
    ['phases out of date order', PHASES.replace('from 2026-09-01', 'from 2025-06-01'), /after.*priorities\.md:8/],
  ])('done-when 4: refuses %s with file:line', (_n, text, msg) => {
    expect(() => readPriorities(repo(text))).toThrow(msg);
  });

  it('refuses an argument tagged with an unknown tenet, with file:line', () => {
    const root = repo(PHASES);
    write(root, '.mole/arguments/x.argdown', ['<other>: Something. #tenet-nope', ''].join('\n'));
    expect(() => evaluatePhase(root, { phase: 'launch' })).toThrow(/tenet-nope.*x\.argdown:1/);
  });

  it('an unknown phase name is refused', () => {
    expect(() => evaluatePhase(repo(PHASES), { phase: 'growth' })).toThrow(/growth/);
  });
});

describe('mole priorities CLI', () => {
  it('is registered in the daemon CLI with one line', () => {
    const daemon = readFileSync(new URL('../../daemon/src/cli.ts', import.meta.url), 'utf8');
    expect(daemon).toContain("cmd === 'priorities'");
    expect(daemon).toContain('prioritiesCli(pos, flags, root)');
  });
  it('exit codes: compare 0, missing phase arg 2, unknown phase 2', () => {
    const root = repo(PHASES);
    const [log, err] = [console.log, console.error];
    console.log = console.error = () => undefined;
    try {
      expect(prioritiesCli(['compare', 'launch', 'scale'], {}, root)).toBe(0);
      expect(prioritiesCli(['compare', 'launch'], {}, root)).toBe(2);
      expect(prioritiesCli([], { phase: 'growth' }, root)).toBe(2);
    } finally {
      [console.log, console.error] = [log, err];
    }
  });
});
