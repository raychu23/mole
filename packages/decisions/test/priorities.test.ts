// T60: tenets reranked as priorities shift (launch → scale). Tests first. Temp repos only, never a live .mole.
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { evaluate } from '@mole/reasoning';
import { afterEach, describe, expect, it } from 'vitest';
import { argumentFramework, comparePhases, compareWithOrder, evaluateOrder, evaluatePhase, loadGraph, phaseAt, prioritiesCli, PrioritiesError, readPriorities, setPriorities } from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');

// review 1 (deleg) HIGH 2: concurrency tests spawn REAL child processes (one Node process can't race itself --
// the event loop is single-threaded) running priorities-lock-worker.ts under vite-node (already a vitest dep).
const VITE_NODE = fileURLToPath(new URL('../../../node_modules/.bin/vite-node', import.meta.url));
const LOCK_WORKER = fileURLToPath(new URL('./priorities-lock-worker.ts', import.meta.url));
function runWorker(root: string, phase: string, order: string[], delayMs?: number, testDelayMs?: number, extraEnv?: Record<string, string>): Promise<{ code: number | null; stderr: string }> {
  const args = [LOCK_WORKER, root, phase, order.join(',')];
  if (delayMs !== undefined) args.push(String(delayMs));
  return new Promise((resolve) => {
    const env = { ...process.env, ...(testDelayMs !== undefined ? { MOLE_PRIORITIES_TEST_DELAY_MS: String(testDelayMs) } : {}), ...extraEnv };
    const child = spawn(VITE_NODE, args, { stdio: ['ignore', 'ignore', 'pipe'], env });
    let stderr = '';
    child.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
    child.on('close', (code) => resolve({ code, stderr }));
  });
}

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
  it('updates an existing phase in place: same from date, new order, the other phase untouched, round trip', async () => {
    const root = repo(PHASES);
    const phases = await setPriorities(root, 'scale', ['tenet-speed', 'tenet-cost']);
    expect(phases.map((p) => [p.name, p.from, p.order])).toEqual([
      ['launch', '2026-01-01', ['tenet-speed', 'tenet-cost']],
      ['scale', '2026-09-01', ['tenet-speed', 'tenet-cost']],
    ]);
    // done-when 3: re-read by T60's own parser gives the identical result (round trip)
    expect(readPriorities(root)).toEqual(phases);
  });

  it('a brand-new phase name is appended dated today, after the latest phase, round trip', async () => {
    const root = repo(PHASES);
    const today = new Date().toISOString().slice(0, 10);
    const phases = await setPriorities(root, 'ga', ['tenet-cost', 'tenet-speed']);
    expect(phases.map((p) => p.name)).toEqual(['launch', 'scale', 'ga']);
    const ga = phases[2]!;
    expect(ga.from).toBe(today);
    expect(ga.order).toEqual(['tenet-cost', 'tenet-speed']);
    expect(readPriorities(root)).toEqual(phases);
  });

  it('a brand-new phase name on an empty (no file) repo creates the file, round trip', async () => {
    const root = repo();
    const phases = await setPriorities(root, 'launch', ['tenet-speed', 'tenet-cost']);
    expect(phases).toEqual([expect.objectContaining({ name: 'launch', order: ['tenet-speed', 'tenet-cost'] })]);
    expect(readPriorities(root)).toEqual(phases);
  });

  it('refuses an unknown tenet or a duplicate rank, same as readPriorities, nothing written', async () => {
    const root = repo(PHASES);
    const before = readFileSync(join(root, '.mole/priorities.md'), 'utf8');
    await expect(setPriorities(root, 'scale', ['tenet-nope'])).rejects.toThrow(/tenet-nope.*not a tenet/);
    await expect(setPriorities(root, 'scale', ['tenet-speed', 'tenet-speed'])).rejects.toThrow(/tenet-speed.*ranked twice/);
    await expect(setPriorities(root, 'scale', [])).rejects.toThrow(/at least one tenet/);
    expect(readFileSync(join(root, '.mole/priorities.md'), 'utf8')).toBe(before);
  });

  it('a new phase that would not start after the last one is refused, nothing written', async () => {
    const future = ['# Priorities', '', `## later · from 2099-01-01`, '', '1. tenet-speed', ''].join('\n');
    const root = repo(future);
    const before = readFileSync(join(root, '.mole/priorities.md'), 'utf8');
    await expect(setPriorities(root, 'sooner', ['tenet-cost'])).rejects.toThrow(PrioritiesError);
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

  it('CLI whatif never touches .mole/priorities.md (git status stays clean)', async () => {
    const root = repo(PHASES);
    execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: root });
    execFileSync('git', ['add', '.'], { cwd: root });
    execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'baseline'], { cwd: root });
    const [log] = [console.log];
    console.log = () => undefined;
    try {
      expect(await prioritiesCli(['whatif'], { order: 'tenet-cost,tenet-speed' }, root)).toBe(0);
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
  it('exit codes: compare 0, missing phase arg 2, unknown phase 2', async () => {
    const root = repo(PHASES);
    const [log, err] = [console.log, console.error];
    console.log = console.error = () => undefined;
    try {
      expect(await prioritiesCli(['compare', 'launch', 'scale'], {}, root)).toBe(0);
      expect(await prioritiesCli(['compare', 'launch'], {}, root)).toBe(2);
      expect(await prioritiesCli([], { phase: 'growth' }, root)).toBe(2);
    } finally {
      [console.log, console.error] = [log, err];
    }
  });

  it('T73: `set` writes, missing flags/unknown tenet are exit 2, `whatif` needs --order', async () => {
    const root = repo(PHASES);
    const [log, err] = [console.log, console.error];
    console.log = console.error = () => undefined;
    try {
      expect(await prioritiesCli(['set'], { phase: 'scale', order: 'tenet-speed,tenet-cost' }, root)).toBe(0);
      expect(await prioritiesCli(['set'], { order: 'tenet-speed' }, root)).toBe(2);
      expect(await prioritiesCli(['set'], { phase: 'scale', order: 'tenet-nope' }, root)).toBe(2);
      expect(await prioritiesCli(['whatif'], {}, root)).toBe(2);
      expect(await prioritiesCli(['whatif'], { order: 'tenet-speed,tenet-cost' }, root)).toBe(0);
    } finally {
      [console.log, console.error] = [log, err];
    }
  });
});

describe('T73 review 1 fixes', () => {
  // HIGH 1: setPriorities used to replace EVERYTHING between the phase heading and the next heading, deleting
  // hand comments/notes/blank-line formatting. Now it rewrites only the numbered tenet-list lines.
  it('rewriting a phase keeps every other line in place: comments, prose and blank lines survive, in order', async () => {
    const root = repo();
    write(root, '.mole/tenets.md', ['# Tenets', '', '## tenet-speed · Ship fast', '', '## tenet-cost · Drive down cost per request', ''].join('\n'));
    const hand = [
      '# Priorities', '',
      '<!-- launch notes: decided in the kickoff -->',
      '## launch · from 2026-01-01', '',
      '<!-- before the list -->',
      '1. tenet-speed',
      '<!-- between items, keep speed in mind -->',
      '2. tenet-cost',
      '<!-- after the list -->', '',
      'Some prose explaining the launch phase.', '',
      '## scale · from 2026-09-01', '',
      '1. tenet-cost', '2. tenet-speed', '',
    ].join('\n');
    write(root, '.mole/priorities.md', hand);
    const path = join(root, '.mole/priorities.md');
    await setPriorities(root, 'launch', ['tenet-cost', 'tenet-speed']);
    const after = readFileSync(path, 'utf8');
    const isItem = (l: string) => /^\s*(?:\d+[.)]|[-*])\s+\S+\s*$/.test(l);
    expect(after.split('\n').filter((l) => !isItem(l))).toEqual(hand.split('\n').filter((l) => !isItem(l)));
    expect(readPriorities(root).find((p) => p.name === 'launch')!.order).toEqual(['tenet-cost', 'tenet-speed']);
    // the other phase, and everything outside the edited phase, untouched byte for byte
    expect(after.slice(after.indexOf('## scale'))).toBe(hand.slice(hand.indexOf('## scale')));
  });

  it('a phase with no list yet gets one inserted right after the heading, rest of the phase untouched', async () => {
    const root = repo();
    write(root, '.mole/tenets.md', ['# Tenets', '', '## tenet-speed · Ship fast', '', '## tenet-cost · Drive down cost per request', ''].join('\n'));
    const hand = ['# Priorities', '', '## launch · from 2026-01-01', '', '<!-- no list yet, still deciding -->', '', '## scale · from 2026-09-01', '', '1. tenet-cost', '2. tenet-speed', ''].join('\n');
    write(root, '.mole/priorities.md', hand);
    await setPriorities(root, 'launch', ['tenet-speed', 'tenet-cost']);
    const after = readFileSync(join(root, '.mole/priorities.md'), 'utf8');
    expect(after).toContain('<!-- no list yet, still deciding -->');
    expect(readPriorities(root).find((p) => p.name === 'launch')!.order).toEqual(['tenet-speed', 'tenet-cost']);
  });

  it('preserves CRLF line endings: no byte in an untouched line is altered', async () => {
    const root = repo();
    write(root, '.mole/tenets.md', ['# Tenets', '', '## tenet-speed · Ship fast', '', '## tenet-cost · Drive down cost per request', ''].join('\n'));
    const hand = ['# Priorities', '', '<!-- crlf file -->', '## launch · from 2026-01-01', '', '1. tenet-speed', '2. tenet-cost', '',
      '## scale · from 2026-09-01', '', '1. tenet-cost', '2. tenet-speed', ''].join('\r\n');
    write(root, '.mole/priorities.md', hand);
    const path = join(root, '.mole/priorities.md');
    await setPriorities(root, 'launch', ['tenet-cost', 'tenet-speed']);
    const after = readFileSync(path, 'utf8');
    expect(after).toContain('\r\n');
    expect(after.split('\n').every((l) => l === '' || l.endsWith('\r'))).toBe(true); // every line still CRLF-terminated
    expect(after).toContain('<!-- crlf file -->\r\n');
    expect(readPriorities(root).find((p) => p.name === 'launch')!.order).toEqual(['tenet-cost', 'tenet-speed']);
  });

  // HIGH 2: concurrent `priorities set` on different phases used to lose one edit (read-modify-write, no lock).
  it('N concurrent writes to DIFFERENT phases: every edit lands, none lost', async () => {
    const root = repo(['# Priorities', '', '## launch · from 2026-01-01', '', '1. tenet-speed', '2. tenet-cost', '',
      '## scale · from 2026-09-01', '', '1. tenet-cost', '2. tenet-speed', '', '## ga · from 2026-10-01', '', '1. tenet-speed', '2. tenet-cost', ''].join('\n'));
    const results = await Promise.all([
      runWorker(root, 'launch', ['tenet-cost', 'tenet-speed'], 0, 300),
      runWorker(root, 'scale', ['tenet-speed', 'tenet-cost'], 0, 300),
      runWorker(root, 'ga', ['tenet-cost', 'tenet-speed'], 0, 300),
    ]);
    for (const r of results) expect(r.code, r.stderr).toBe(0);
    const phases = readPriorities(root);
    expect(phases.find((p) => p.name === 'launch')!.order).toEqual(['tenet-cost', 'tenet-speed']);
    expect(phases.find((p) => p.name === 'scale')!.order).toEqual(['tenet-speed', 'tenet-cost']);
    expect(phases.find((p) => p.name === 'ga')!.order).toEqual(['tenet-cost', 'tenet-speed']);
  }, 20_000);

  it('N concurrent writes to the SAME phase: last writer wins, the file is never corrupt', async () => {
    const root = repo(PHASES);
    const results = await Promise.all([
      runWorker(root, 'scale', ['tenet-speed', 'tenet-cost'], 0, 300),
      runWorker(root, 'scale', ['tenet-cost', 'tenet-speed'], 10, 300),
    ]);
    for (const r of results) expect(r.code, r.stderr).toBe(0);
    // never corrupt: readPriorities parses it without throwing, and scale ends up as ONE of the two orders, whole
    const phases = readPriorities(root);
    const scale = phases.find((p) => p.name === 'scale')!;
    expect([['tenet-speed', 'tenet-cost'], ['tenet-cost', 'tenet-speed']]).toContainEqual(scale.order);
    expect(phases.find((p) => p.name === 'launch')!.order).toEqual(['tenet-speed', 'tenet-cost']); // untouched
  }, 20_000);

  it('a stale lock older than the bound is reclaimed, the write still succeeds', async () => {
    const root = repo(PHASES);
    const lockPath = join(root, '.mole/priorities.md.lock'); // proper-lockfile's mutex is a DIRECTORY (mkdir), not a file
    mkdirSync(lockPath);
    const old = Date.now() - 60_000; // well past any reasonable staleness bound
    utimesSync(lockPath, old / 1000, old / 1000);
    const phases = await setPriorities(root, 'scale', ['tenet-speed', 'tenet-cost']);
    expect(phases.find((p) => p.name === 'scale')!.order).toEqual(['tenet-speed', 'tenet-cost']);
  });
});

describe('T73 review 2 fixes', () => {
  // HIGH: the hand-rolled lock never refreshed its own mtime while held, so a live holder doing slow work
  // looked abandoned after LOCK_STALE_MS and got reclaimed (mutual exclusion lost). proper-lockfile refreshes
  // the lock directory's mtime on a background timer (`update`) while held; MOLE_PRIORITIES_TEST_STALE_MS
  // shrinks the stale/retry bounds to milliseconds so this is provable in a fast test, not minutes.
  it('a live holder sleeping PAST the stale bound keeps its lock: the waiter is blocked until release, never steals it, and the release never touches the waiter\'s own later lock', async () => {
    const root = repo(['# Priorities', '', '## launch · from 2026-01-01', '', '1. tenet-speed', '2. tenet-cost', '',
      '## scale · from 2026-09-01', '', '1. tenet-cost', '2. tenet-speed', ''].join('\n'));
    const env = { MOLE_PRIORITIES_TEST_STALE_MS: '2200' }; // proper-lockfile floors: stale >= 2000ms, update >= 1000ms
    const started = Date.now();
    const a = runWorker(root, 'launch', ['tenet-cost', 'tenet-speed'], 0, 3000, env); // holds the lock 3000ms > the 2200ms stale bound
    await new Promise((resolve) => setTimeout(resolve, 150)); // give A a head start so it is definitely the holder first
    const b = runWorker(root, 'scale', ['tenet-speed', 'tenet-cost'], 0, 0, env); // must wait for A, not reclaim it as stale
    const [ra, rb] = await Promise.all([a, b]);
    const elapsed = Date.now() - started;
    expect(ra.code, ra.stderr).toBe(0);
    expect(rb.code, rb.stderr).toBe(0);
    // B could only have finished after A released: the whole run took at least as long as A's own hold
    expect(elapsed).toBeGreaterThanOrEqual(2900);
    // mutual exclusion held: BOTH edits landed, neither lost to a reclaimed/stolen lock or a clobbered write
    const phases = readPriorities(root);
    expect(phases.find((p) => p.name === 'launch')!.order).toEqual(['tenet-cost', 'tenet-speed']);
    expect(phases.find((p) => p.name === 'scale')!.order).toEqual(['tenet-speed', 'tenet-cost']);
  }, 20_000);

  // crash-orphaned lock: a holder killed with SIGKILL never reaches its own `finally`/release, so the lock
  // directory is left behind. It must still be reclaimed once it is genuinely stale (never a permanent jam).
  it('a crash-orphaned lock (kill -9 mid-hold) is reclaimed once stale, not left dead forever', async () => {
    const root = repo(PHASES);
    const lockPath = join(root, '.mole/priorities.md.lock');
    const env = { ...process.env, MOLE_PRIORITIES_TEST_STALE_MS: '2200', MOLE_PRIORITIES_TEST_DELAY_MS: '10000' };
    const child = spawn(VITE_NODE, [LOCK_WORKER, root, 'scale', 'tenet-speed,tenet-cost'], { stdio: 'ignore', env });
    for (let i = 0; i < 100 && !existsSync(lockPath); i++) await new Promise((resolve) => setTimeout(resolve, 100)); // poll for vite-node startup + lock acquisition
    expect(existsSync(lockPath)).toBe(true); // holding
    child.kill('SIGKILL'); // never reaches its own release() -- the lock is now orphaned
    await new Promise((resolve) => setTimeout(resolve, 2800)); // past the (test-shrunk) stale bound
    process.env.MOLE_PRIORITIES_TEST_STALE_MS = '2200'; // this process's own setPriorities call must use the same (shrunk) stale bound
    try {
      const phases = await setPriorities(root, 'launch', ['tenet-cost', 'tenet-speed']);
      expect(phases.find((p) => p.name === 'launch')!.order).toEqual(['tenet-cost', 'tenet-speed']);
    } finally {
      delete process.env.MOLE_PRIORITIES_TEST_STALE_MS;
    }
  }, 20_000);
});

describe('T73 review 2: the lock directory is never committed', () => {
  it('Mole\'s own repo .gitignore ignores .mole/*.lock', () => {
    const text = readFileSync(join(repoRoot, '.gitignore'), 'utf8');
    expect(text.split('\n').map((l) => l.trim())).toContain('.mole/*.lock');
  });

  it('setPriorities writes .mole/.gitignore ignoring the lock in a repo that does not already ignore it', async () => {
    const root = repo(PHASES);
    await setPriorities(root, 'scale', ['tenet-speed', 'tenet-cost']);
    const ignore = readFileSync(join(root, '.mole/.gitignore'), 'utf8');
    expect(ignore.split('\n').map((l) => l.trim())).toContain('*.lock');
    execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: root });
    execFileSync('git', ['add', '.'], { cwd: root });
    execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'baseline'], { cwd: root });
    await setPriorities(root, 'scale', ['tenet-cost', 'tenet-speed']); // the lock dir is created and released again
    const status = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: root, encoding: 'utf8' });
    expect(status).not.toMatch(/priorities\.md\.lock/); // never shows up as untracked
  });

  it('ensureLockIgnored does not duplicate the line on repeated calls', async () => {
    const root = repo(PHASES);
    await setPriorities(root, 'scale', ['tenet-speed', 'tenet-cost']);
    await setPriorities(root, 'scale', ['tenet-cost', 'tenet-speed']);
    const ignore = readFileSync(join(root, '.mole/.gitignore'), 'utf8');
    expect(ignore.split('\n').filter((l) => l.trim() === '*.lock')).toHaveLength(1);
  });
});

describe('T73 review 2: an existing phase\'s body is validated before splicing, like readPriorities', () => {
  it('refuses to update a phase when ANOTHER phase in the same file is malformed, same error readPriorities throws, nothing written', async () => {
    // 'scale' (the phase being LEFT ALONE here) is corrupted with a duplicate rank -- two stray tenet lines.
    // The update-existing-phase branch used to splice 'launch' blindly, silently collapsing the corruption.
    const broken = ['# Priorities', '', '## launch · from 2026-01-01', '', '1. tenet-speed', '2. tenet-cost', '',
      '## scale · from 2026-09-01', '', '1. tenet-cost', '2. tenet-speed', '3. tenet-cost', ''].join('\n');
    const root = repo(broken);
    const before = readFileSync(join(root, '.mole/priorities.md'), 'utf8');
    await expect(setPriorities(root, 'launch', ['tenet-cost', 'tenet-speed'])).rejects.toThrow(/tenet-cost.*ranked twice.*priorities\.md:12/);
    expect(readFileSync(join(root, '.mole/priorities.md'), 'utf8')).toBe(before); // nothing written
  });

  it('refuses when the OTHER phase has an unknown tenet, same file:line readPriorities gives', async () => {
    const broken = ['# Priorities', '', '## launch · from 2026-01-01', '', '1. tenet-speed', '2. tenet-cost', '',
      '## scale · from 2026-09-01', '', '1. tenet-nope', '2. tenet-speed', ''].join('\n');
    const root = repo(broken);
    await expect(setPriorities(root, 'launch', ['tenet-cost', 'tenet-speed'])).rejects.toThrow(/tenet-nope.*priorities\.md:10/);
  });
});
