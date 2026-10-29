// T28 red tests: runtime call edges recorded while code runs (AppMap-style), per test, with static-graph ids.
// Ids follow @mole/indexer: function:path#name, method:path#Class.member, class:path#Class, variable:path#name, file:path#path.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
import { afterAll, describe, expect, it } from 'vitest';
import { flowsFor, installRuntime, instrumentSource, loadFlows, recordFlows, writeFlows, type TestFlow } from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../../..');
const cli = join(repo, 'packages/daemon/dist/cli.js');
const dirs: string[] = [];
const tmp = (): string => {
  const d = mkdtempSync(join(tmpdir(), 'mole-flows-'));
  dirs.push(d);
  return d;
};
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

let n = 0;
/** instrument a TS module as if it lived at `rel`, compile it with tsc, import it */
async function load(src: string, rel = 'src/m.ts'): Promise<Record<string, any>> {
  const r = instrumentSource(src, rel);
  expect(r).not.toBeNull();
  const js = ts.transpileModule(r!.code, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
  const d = tmp();
  const f = join(d, `m${n++}.mjs`);
  writeFileSync(f, js);
  return import(pathToFileURL(f).href);
}

const rt = () => installRuntime();
async function run(name: string, fn: () => unknown): Promise<TestFlow> {
  const r = rt();
  r.begin(name, 'test/x.test.ts');
  try {
    await fn();
  } finally {
    r.end();
  }
  const f = r.flows().filter((t) => t.test === name).pop();
  expect(f).toBeDefined();
  return f!;
}
const edges = (f: TestFlow): string[] => f.edges.map(([a, b]) => `${a} -> ${b}`);
const F = (name: string, path = 'src/m.ts') => `function:${path}#${name}`;

describe('runtime edges (instrumentSource + installRuntime)', () => {
  it('a callback passed as an argument: the function that runs it is the caller, not the one that passed it', async () => {
    const m = await load(`
export function each(xs: number[], f: (x: number) => number): number[] { return xs.map((x) => f(x)); }
export function visit(x: number): number { return x + 1; }
export function sorted(xs: number[]): number[] { return [...xs].sort(byValue); }
export const byValue = (a: number, b: number): number => a - b;
export function use(xs: number[]): number[] { return each(sorted(xs), visit); }
`);
    const f = await run('callback', () => expect(m.use([3, 1])).toEqual([2, 4]));
    const e = edges(f);
    expect(e).toEqual(expect.arrayContaining([`${F('use')} -> ${F('each')}`, `${F('each')} -> ${F('visit')}`, `${F('use')} -> ${F('sorted')}`, `${F('sorted')} -> ${F('byValue')}`]));
    expect(e).not.toContain(`${F('use')} -> ${F('visit')}`);
    expect(f.roots).toContain(F('use'));
    expect(f.paths[F('visit')]).toEqual([F('use'), F('each'), F('visit')]);
  });

  it('registry entry: an object lookup reaches the variable node, and the entry lambda calls belong to that variable', async () => {
    const m = await load(`
export function helper(): number { return 7; }
export const registry: Record<string, () => number> = { seven: () => helper() };
export function register(r: Record<string, () => number>, k: string, f: () => number): void { r[k] = f; }
export function dispatch(k: string): number { return registry[k]!(); }
`);
    const f = await run('registry', () => {
      m.register(m.registry, 'again', m.helper);
      expect(m.dispatch('seven')).toBe(7);
    });
    const e = edges(f);
    expect(e).toEqual(expect.arrayContaining([`${F('dispatch')} -> variable:src/m.ts#registry`, `variable:src/m.ts#registry -> ${F('helper')}`]));
    expect(e).not.toContain(`${F('dispatch')} -> ${F('helper')}`);
    expect(e).not.toContain(`${F('register')} -> ${F('helper')}`);
  });

  it('async: calls after an await stay with the awaiting function; the caller that kept running is not credited', async () => {
    const m = await load(`
export async function a(): Promise<number> { await new Promise((r) => setTimeout(r, 5)); return b(); }
export function b(): number { return 1; }
export function d(): number { return 2; }
export async function main(): Promise<number> { const p = a(); const x = d(); return (await p) + x; }
export async function other(): Promise<void> { await Promise.resolve(); d(); }
`);
    const f = await run('async', async () => {
      const [x] = await Promise.all([m.main(), m.other()]);
      expect(x).toBe(3);
    });
    const e = edges(f);
    expect(e).toEqual(expect.arrayContaining([`${F('main')} -> ${F('a')}`, `${F('a')} -> ${F('b')}`, `${F('main')} -> ${F('d')}`, `${F('other')} -> ${F('d')}`]));
    expect(e).not.toContain(`${F('main')} -> ${F('b')}`);
    expect(e).not.toContain(`${F('a')} -> ${F('d')}`);
    expect(e).not.toContain(`${F('other')} -> ${F('b')}`);
  });

  it('classes: new C() is an edge to the class, the constructor body is C.constructor, a call through an interface lands on the implementation', async () => {
    const m = await load(`
export interface Runner { run(): number }
export function leaf(): number { return 3; }
export class Impl implements Runner {
  private n = seed();
  constructor(private readonly k: number) { this.init(); }
  init(): void {}
  run(): number { return leaf() + this.k + this.n; }
}
export function seed(): number { return 0; }
export function go(r: Runner): number { return r.run(); }
export function make(): Runner { return new Impl(1); }
`);
    const f = await run('classes', () => expect(m.go(m.make())).toBe(4));
    const e = edges(f);
    expect(e).toEqual(
      expect.arrayContaining([
        `${F('make')} -> class:src/m.ts#Impl`,
        'method:src/m.ts#Impl.constructor -> method:src/m.ts#Impl.init',
        `class:src/m.ts#Impl -> ${F('seed')}`,
        `${F('go')} -> method:src/m.ts#Impl.run`,
        `method:src/m.ts#Impl.run -> ${F('leaf')}`,
      ]),
    );
    expect(e).not.toContain(`${F('make')} -> ${F('seed')}`);
    expect(e.some((x) => x.includes('Runner.run'))).toBe(false);
  });

  it('events and timers: emit runs the listener (caller = the emitting function); registering is not a call; a timer callback is a root', async () => {
    const m = await load(`
import { EventEmitter } from 'node:events';
export function onPing(): void {}
export function tick(): void {}
export function wire(em: EventEmitter): void { em.on('ping', onPing); }
export function fire(em: EventEmitter): void { em.emit('ping'); }
export function later(): Promise<void> { return new Promise((r) => setTimeout(() => { tick(); r(); }, 1)); }
export function soon(): Promise<void> { return new Promise((r) => setTimeout(() => { r(); }, 1)).then(tick2); }
export function tick2(): void {}
`);
    const f = await run('events', async () => {
      const { EventEmitter } = await import('node:events');
      const em = new EventEmitter();
      m.wire(em);
      m.fire(em);
      await m.later();
      await m.soon();
    });
    const e = edges(f);
    expect(e).toContain(`${F('fire')} -> ${F('onPing')}`);
    expect(e).not.toContain(`${F('wire')} -> ${F('onPing')}`);
    // the setTimeout lambda is lexically inside later(): its call to tick() belongs to later
    expect(e).toContain(`${F('later')} -> ${F('tick')}`);
    // a promise reaction runs from the microtask queue: tick2 is a root, soon() did not call it
    expect(e).not.toContain(`${F('soon')} -> ${F('tick2')}`);
    expect(f.roots).toContain(F('tick2'));
  });

  it('generators: calls inside the generator body belong to the generator, not to the consumer', async () => {
    const m = await load(`
export function inner(): number { return 1; }
export function* gen(): Generator<number> { yield inner(); yield inner(); }
export function consume(): number { let s = 0; for (const v of gen()) s += use2(v); return s; }
export function use2(v: number): number { return v; }
`);
    const f = await run('gen', () => expect(m.consume()).toBe(2));
    const e = edges(f);
    expect(e).toEqual(expect.arrayContaining([`${F('gen')} -> ${F('inner')}`, `${F('consume')} -> ${F('use2')}`]));
    expect(e).not.toContain(`${F('consume')} -> ${F('inner')}`);
  });

  it('keeps every line number and still compiles TS syntax (types, generics, satisfies, arrow properties, overloads, abstract)', async () => {
    const src = `
export type Fn<T> = (x: T) => T;
export function over(x: number): number;
export function over(x: string): string;
export function over(x: any): any { return x; }
export abstract class Base<T> { constructor() {} abstract get(): T; twice = (x: T): T[] => [x, x]; static make(): number { return 1; } }
export class Num extends Base<number> {
  constructor() { super(); }
  get(): number { return over(2) satisfies number; }
}
export const id = <T,>(x: T): T => x;
export function viaArrow(): number[] { return new Num().twice(id(new Num().get())); }
`;
    const r = instrumentSource(src, 'src/syntax.ts');
    expect(r).not.toBeNull();
    expect(r!.code.split('\n').length).toBe(src.split('\n').length);
    expect(r!.functions).toBeGreaterThanOrEqual(8);
    const m = await load(src, 'src/syntax.ts');
    const f = await run('syntax', () => expect(m.viaArrow()).toEqual([2, 2]));
    expect(edges(f)).toEqual(
      expect.arrayContaining([
        'function:src/syntax.ts#viaArrow -> method:src/syntax.ts#Base.twice',
        'method:src/syntax.ts#Num.get -> function:src/syntax.ts#over',
        'function:src/syntax.ts#viaArrow -> function:src/syntax.ts#id',
        'method:src/syntax.ts#Num.constructor -> method:src/syntax.ts#Base.constructor',
      ]),
    );
  });
});

describe('store + query', () => {
  it('flowsFor lists the tests and call paths that exercise file#Symbol', () => {
    const d = tmp();
    const flows: TestFlow[] = [
      { test: 'a > one', file: 'test/a.test.ts', edges: [['function:src/x.ts#outer', 'function:src/x.ts#inner', 2]], roots: ['function:src/x.ts#outer'], paths: { 'function:src/x.ts#inner': ['function:src/x.ts#outer', 'function:src/x.ts#inner'] } },
      { test: 'b > two', file: 'test/b.test.ts', edges: [['method:src/y.ts#K.go', 'function:src/x.ts#inner', 1]], roots: ['method:src/y.ts#K.go'], paths: { 'function:src/x.ts#inner': ['method:src/y.ts#K.go', 'function:src/x.ts#inner'] } },
      { test: 'c > none', file: 'test/c.test.ts', edges: [], roots: ['function:src/z.ts#other'], paths: {} },
    ];
    writeFlows(d, flows, { root: '/r', commit: 'abc', files: ['test/a.test.ts'] });
    const store = loadFlows(d);
    expect(store.tests.length).toBe(3);
    const r = flowsFor(store, 'src/x.ts#inner');
    expect(r.ids).toEqual(['function:src/x.ts#inner']);
    expect(r.tests.map((t) => t.test).sort()).toEqual(['a > one', 'b > two']);
    expect(r.tests.find((t) => t.test === 'b > two')!.path).toEqual(['method:src/y.ts#K.go', 'function:src/x.ts#inner']);
    expect(r.callers).toEqual(expect.arrayContaining([{ id: 'function:src/x.ts#outer', count: 2 }, { id: 'method:src/y.ts#K.go', count: 1 }]));
    expect(flowsFor(store, 'src/x.ts#outer').callees).toEqual([{ id: 'function:src/x.ts#inner', count: 2 }]);
    expect(flowsFor(store, 'src/x.ts#nope').tests).toEqual([]);
  });
});

describe('mole flows record / mole flows <file#Symbol>', () => {
  const mini = join(here, 'fixtures/mini');

  it('recordFlows runs vitest with the instrumentation and stores per-test flows; the plain run records nothing', async () => {
    const out = tmp();
    const r = await recordFlows({ root: mini, files: ['test/app.spec.ts'], out });
    expect(r.exit).toBe(0);
    expect(r.tests).toEqual({ passed: 1, failed: 0 });
    const store = loadFlows(out);
    const t = store.tests.find((x) => x.test.includes('doubles through a callback'));
    expect(t).toBeDefined();
    expect(edges(t!)).toEqual(expect.arrayContaining(['function:src/app.ts#use -> function:src/app.ts#each', 'function:src/app.ts#each -> function:src/app.ts#visit']));
    expect(edges(t!)).not.toContain('function:src/app.ts#use -> function:src/app.ts#visit');
    const plainOut = tmp();
    const p = await recordFlows({ root: mini, files: ['test/app.spec.ts'], out: plainOut, instrument: false });
    expect(p.exit).toBe(0);
    expect(p.tests).toEqual({ passed: 1, failed: 0 });
    expect(p.flows).toBe(0);
  }, 120_000);

  it('the daemon CLI registers `mole flows`: record, then query a symbol', () => {
    const out = tmp();
    const usage = spawnSync(process.execPath, ['--no-warnings', cli, 'flows'], { encoding: 'utf8' });
    expect(usage.status).toBe(2);
    expect(usage.stderr).toContain('mole flows record');
    const rec = spawnSync(process.execPath, ['--no-warnings', cli, 'flows', 'record', 'test/app.spec.ts', '--root', mini, '--out', out], { encoding: 'utf8' });
    expect(rec.status, rec.stderr + rec.stdout).toBe(0);
    expect(rec.stdout).toMatch(/recorded \d+ test/);
    const q = spawnSync(process.execPath, ['--no-warnings', cli, 'flows', 'src/app.ts#visit', '--root', mini, '--out', out], { encoding: 'utf8' });
    expect(q.status, q.stderr).toBe(0);
    expect(q.stdout).toContain('doubles through a callback');
    expect(q.stdout).toContain('function:src/app.ts#each');
    const j = JSON.parse(execFileSync(process.execPath, ['--no-warnings', cli, 'flows', 'src/app.ts#visit', '--root', mini, '--out', out, '--json'], { encoding: 'utf8' }));
    expect(j.callers).toEqual([{ id: 'function:src/app.ts#each', count: 2 }]);
    expect(readFileSync(join(out, 'run.json'), 'utf8')).toContain('test/app.spec.ts');
  }, 120_000);
});
