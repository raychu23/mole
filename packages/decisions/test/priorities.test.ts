// T60: tenets reranked as priorities shift (launch → scale). Tests first. Temp repos only, never a live .mole.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { evaluate } from '@mole/reasoning';
import { afterEach, describe, expect, it } from 'vitest';
import { argumentFramework, comparePhases, compareWithOrder, evaluateOrder, evaluatePhase, loadGraph, phaseAt, prioritiesCli, PrioritiesError, readPriorities, setPriorities } from '../src/index.js';

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

  // review 1 (deleg_8866ecef) HIGH: the loader's node line is the FIRST mention; a bare `-> <use-kafka>` before its
  // tagged definition dropped the tag silently
  it('reads the tag from the definition line even when the argument is referenced earlier', () => {
    const root = repo(PHASES);
    write(root, '.mole/arguments/queue.argdown', [
      '<ship-fast>: A hand-rolled queue ships this week. #tenet-speed', '  -> <use-kafka>', '',
      '<use-kafka>: A managed queue is cheaper per message at scale. #tenet-cost', '  -> <ship-fast>', '',
    ].join('\n'));
    expect(evaluatePhase(root, { phase: 'launch' }).labels).toEqual({ 'ship-fast': 'in', 'use-kafka': 'out' });
  });

  it('refuses one argument defined twice with different tags, naming both lines', () => {
    const root = repo(PHASES);
    write(root, '.mole/arguments/x.argdown', ['<ship-fast>: Again. #tenet-cost', ''].join('\n'));
    expect(() => evaluatePhase(root, { phase: 'launch' })).toThrow(/ship-fast.*queue\.argdown:1.*x\.argdown:1/);
  });

  // review 2 (deleg_d06cf655): a separate regex scanner read prose/links/code outside ```argdown fences and missed
  // `-><id>:` with no space. Definitions now come from the parser itself.
  it('ignores definition-like prose, link references and code outside argdown fences in a decision .md', () => {
    const root = repo(PHASES);
    write(root, '.mole/arguments/queue.argdown', '');
    write(root, '.mole/decisions/d1.md', ['---', 'id: D1', 'title: Hand-roll the job queue', 'status: accepted', 'cites: [ship-fast]', '---', '',
      '<ship-fast>: prose that looks like a definition #tenet-cost', '[ship-fast]: https://example.com#tenet-cost', '```js', '<use-kafka>: code #tenet-speed', '```', '',
      '```argdown', '<ship-fast>: A hand-rolled queue ships this week. #tenet-speed', '  -> <use-kafka>: A managed queue is cheaper. #tenet-cost', '',
      '<use-kafka>', '  -> <ship-fast>', '```', ''].join('\n'));
    expect(evaluatePhase(root, { phase: 'launch' }).labels).toEqual({ 'ship-fast': 'in', 'use-kafka': 'out' });
  });

  it('reads a definition inline after an arrow with no space (-><id>: text), as the parser does', () => {
    const root = repo(PHASES);
    write(root, '.mole/arguments/queue.argdown', [
      '<ship-fast>: A hand-rolled queue ships this week. #tenet-speed', '  -><use-kafka>: A managed queue is cheaper. #tenet-cost', '',
      '<use-kafka>', '  -> <ship-fast>', '',
    ].join('\n'));
    expect(evaluatePhase(root, { phase: 'launch' }).labels).toEqual({ 'ship-fast': 'in', 'use-kafka': 'out' });
  });

  it('refuses an impossible calendar date (review 1 LOW)', () => {
    expect(() => readPriorities(repo(PHASES.replace('from 2026-09-01', 'from 2026-02-30')))).toThrow(/2026-02-30/);
  });

  it('an unknown phase name is refused', () => {
    expect(() => evaluatePhase(repo(PHASES), { phase: 'growth' })).toThrow(/growth/);
  });
});

describe('T73 setPriorities: a person writes the order, never MCP', () => {
  it('updates an existing phase in place: same from date, new order, the other phase untouched, round trip', () => {
    const root = repo(PHASES);
    const phases = setPriorities(root, 'scale', ['tenet-speed', 'tenet-cost']);
    expect(phases.map((p) => [p.name, p.from, p.order])).toEqual([
      ['launch', '2026-01-01', ['tenet-speed', 'tenet-cost']],
      ['scale', '2026-09-01', ['tenet-speed', 'tenet-cost']],
    ]);
    // done-when 3: re-read by T60's own parser gives the identical result (round trip)
    expect(readPriorities(root)).toEqual(phases);
  });

  it('a brand-new phase name is appended dated today, after the latest phase, round trip', () => {
    const root = repo(PHASES);
    const today = new Date().toISOString().slice(0, 10);
    const phases = setPriorities(root, 'ga', ['tenet-cost', 'tenet-speed']);
    expect(phases.map((p) => p.name)).toEqual(['launch', 'scale', 'ga']);
    const ga = phases[2]!;
    expect(ga.from).toBe(today);
    expect(ga.order).toEqual(['tenet-cost', 'tenet-speed']);
    expect(readPriorities(root)).toEqual(phases);
  });

  it('a brand-new phase name on an empty (no file) repo creates the file, round trip', () => {
    const root = repo();
    const phases = setPriorities(root, 'launch', ['tenet-speed', 'tenet-cost']);
    expect(phases).toEqual([expect.objectContaining({ name: 'launch', order: ['tenet-speed', 'tenet-cost'] })]);
    expect(readPriorities(root)).toEqual(phases);
  });

  it('refuses an unknown tenet or a duplicate rank, same as readPriorities, nothing written', () => {
    const root = repo(PHASES);
    const before = readFileSync(join(root, '.mole/priorities.md'), 'utf8');
    expect(() => setPriorities(root, 'scale', ['tenet-nope'])).toThrow(/tenet-nope.*not a tenet/);
    expect(() => setPriorities(root, 'scale', ['tenet-speed', 'tenet-speed'])).toThrow(/tenet-speed.*ranked twice/);
    expect(() => setPriorities(root, 'scale', [])).toThrow(/at least one tenet/);
    expect(readFileSync(join(root, '.mole/priorities.md'), 'utf8')).toBe(before);
  });

  it('a new phase that would not start after the last one is refused, nothing written', () => {
    const future = ['# Priorities', '', `## later · from 2099-01-01`, '', '1. tenet-speed', ''].join('\n');
    const root = repo(future);
    const before = readFileSync(join(root, '.mole/priorities.md'), 'utf8');
    expect(() => setPriorities(root, 'sooner', ['tenet-cost'])).toThrow(PrioritiesError);
    expect(readFileSync(join(root, '.mole/priorities.md'), 'utf8')).toBe(before);
  });
});

describe('T73 what-if: an order NOT read from or written to .mole/priorities.md', () => {
  it('evaluateOrder judges the graph under an arbitrary order, writing nothing', () => {
    const root = repo(PHASES);
    const before = readFileSync(join(root, '.mole/priorities.md'), 'utf8');
    const ev = evaluateOrder(root, ['tenet-cost', 'tenet-speed']);
    expect(ev.labels).toEqual({ 'ship-fast': 'out', 'use-kafka': 'in' }); // same as the 'scale' phase's order
    expect(readFileSync(join(root, '.mole/priorities.md'), 'utf8')).toBe(before);
  });

  it('compareWithOrder: the phase in force vs the what-if order, identical to comparePhases for the same orders', () => {
    const root = repo(PHASES);
    const viaPhases = comparePhases(root, 'launch', 'scale');
    const viaWhatIf = compareWithOrder(root, ['tenet-cost', 'tenet-speed'], { phase: 'launch' });
    expect(viaWhatIf.arguments).toEqual(viaPhases.arguments);
    expect(viaWhatIf.decisions).toEqual(viaPhases.decisions);
  });

  it('no priorities file: the baseline is plain Dung (empty order), the what-if is still evaluated', () => {
    const root = repo();
    const c = compareWithOrder(root, ['tenet-speed', 'tenet-cost']);
    expect(c.arguments.map((a) => a.id).sort()).toEqual(['ship-fast', 'use-kafka']);
  });

  it('CLI whatif never touches .mole/priorities.md (git status stays clean)', () => {
    const root = repo(PHASES);
    execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: root });
    execFileSync('git', ['add', '.'], { cwd: root });
    execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'baseline'], { cwd: root });
    const [log] = [console.log];
    console.log = () => undefined;
    try {
      expect(prioritiesCli(['whatif'], { order: 'tenet-cost,tenet-speed' }, root)).toBe(0);
    } finally {
      console.log = log;
    }
    const status = execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' });
    expect(status).toBe('');
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

  it('T73: `set` writes, missing flags/unknown tenet are exit 2, `whatif` needs --order', () => {
    const root = repo(PHASES);
    const [log, err] = [console.log, console.error];
    console.log = console.error = () => undefined;
    try {
      expect(prioritiesCli(['set'], { phase: 'scale', order: 'tenet-speed,tenet-cost' }, root)).toBe(0);
      expect(prioritiesCli(['set'], { order: 'tenet-speed' }, root)).toBe(2);
      expect(prioritiesCli(['set'], { phase: 'scale', order: 'tenet-nope' }, root)).toBe(2);
      expect(prioritiesCli(['whatif'], {}, root)).toBe(2);
      expect(prioritiesCli(['whatif'], { order: 'tenet-speed,tenet-cost' }, root)).toBe(0);
    } finally {
      [console.log, console.error] = [log, err];
    }
  });
});
