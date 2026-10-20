import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { missingEvidence } from '@mole/core';
import { readFiles, readGraph, TsIndexer } from '../src/index.js';

const dirs: string[] = [];
const indexers: TsIndexer[] = [];

function repo(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'mole-idx-'));
  dirs.push(root);
  for (const [p, body] of Object.entries(files)) {
    mkdirSync(dirname(join(root, p)), { recursive: true });
    writeFileSync(join(root, p), body);
  }
  return root;
}

function index(root: string, tsconfig?: string) {
  const ix = new TsIndexer({ root, tsconfig, commit: 'abc1234' });
  indexers.push(ix);
  const stats = ix.indexAll();
  return { ix, stats, ...readGraph(ix.db) };
}

afterEach(() => {
  for (const i of indexers.splice(0)) i.close();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('indexer fixtures', () => {
  it('resolves a call through a barrel re-export to the defining file', () => {
    const root = repo({
      'src/lib/impl.ts': 'export function greet(n: string) {\n  return n;\n}\n',
      'src/lib/index.ts': "export { greet } from './impl.js';\n",
      'src/app.ts': "import { greet } from './lib/index.js';\nexport function main() {\n  return greet('x');\n}\n",
    });
    const { edges } = index(root);
    const call = edges.find((e) => e.kind === 'calls');
    expect(call).toMatchObject({
      from: 'function:src/app.ts#main',
      to: 'function:src/lib/impl.ts#greet',
      evidence: { path: 'src/app.ts', line: 3, commit: 'abc1234' },
    });
    expect(edges.some((e) => e.kind === 'imports' && e.from === 'file:src/app.ts#src/app.ts' && e.to === 'file:src/lib/index.ts#src/lib/index.ts')).toBe(true);
  });

  it('resolves a call through a tsconfig path alias', () => {
    const root = repo({
      'tsconfig.json': JSON.stringify({ compilerOptions: { module: 'esnext', moduleResolution: 'bundler', baseUrl: '.', paths: { '@lib/*': ['src/lib/*'] } }, include: ['src'] }),
      'src/lib/math.ts': 'export const double = (n: number) => n * 2;\n',
      'src/app.ts': "import { double } from '@lib/math';\nexport function run() {\n  return double(2);\n}\n",
    });
    const { edges } = index(root, 'tsconfig.json');
    expect(edges.find((e) => e.kind === 'calls')).toMatchObject({ from: 'function:src/app.ts#run', to: 'function:src/lib/math.ts#double' });
  });

  it('resolves a method call on a class instance', () => {
    const root = repo({
      'src/svc.ts': 'export class Svc {\n  find(id: number) {\n    return id;\n  }\n}\n',
      'src/app.ts': "import { Svc } from './svc.js';\nconst s = new Svc();\nexport function go() {\n  return s.find(1);\n}\n",
    });
    const { edges } = index(root);
    const calls = edges.filter((e) => e.kind === 'calls');
    expect(calls.map((e) => e.to)).toContain('method:src/svc.ts#Svc.find');
    expect(calls.find((e) => e.to === 'method:src/svc.ts#Svc.find')?.from).toBe('function:src/app.ts#go');
    expect(calls.map((e) => e.to)).toContain('class:src/svc.ts#Svc'); // `new Svc()` is a call to the class
  });

  it('every current-layer node and edge carries file:line@commit', () => {
    const root = repo({ 'src/a.ts': 'export function a() {\n  return b();\n}\nfunction b() {\n  return 1;\n}\n' });
    const { nodes, edges } = index(root);
    expect(nodes.length).toBeGreaterThan(0);
    expect(missingEvidence([...nodes, ...edges])).toEqual([]);
  });
});

describe('indexer failure cases', () => {
  it('stores a file with a syntax error as partial and keeps indexing the rest', () => {
    const root = repo({
      'src/broken.ts': 'export function ok() {\n  return 1;\n}\nexport function bad( {\n  return ;\n',
      'src/fine.ts': "import { ok } from './broken.js';\nexport function fine() {\n  return ok();\n}\n",
    });
    const { ix, stats, edges } = index(root);
    const files = Object.fromEntries(readFiles(ix.db).map((f) => [f.path, f.status]));
    expect(files).toEqual({ 'src/broken.ts': 'partial', 'src/fine.ts': 'ok' });
    expect(stats.partialFiles).toBe(1);
    expect(edges.some((e) => e.kind === 'calls' && e.from === 'function:src/fine.ts#fine' && e.to === 'function:src/broken.ts#ok')).toBe(true);
  });

  it('an empty src dir gives 0 nodes and no error', () => {
    const root = repo({ 'src/.keep': '' });
    const { stats, nodes, edges } = index(root);
    expect(stats).toMatchObject({ files: 0, nodes: 0, edges: 0 });
    expect(nodes).toEqual([]);
    expect(edges).toEqual([]);
  });

  it('a missing src dir also gives 0 nodes and no error', () => {
    const root = repo({ 'README.md': 'x' });
    expect(index(root).stats.nodes).toBe(0);
  });
});

describe('incremental update', () => {
  it('re-indexes one changed file and leaves the rest', () => {
    const root = repo({
      'src/a.ts': 'export function a() {\n  return 1;\n}\n',
      'src/b.ts': "import { a } from './a.js';\nexport function b() {\n  return a();\n}\n",
    });
    const { ix, nodes: before } = index(root);
    writeFileSync(join(root, 'src/a.ts'), 'export function a() {\n  return 1;\n}\nexport function a2() {\n  return a();\n}\n');
    const st = ix.updateFile('src/a.ts');
    const after = readGraph(ix.db);
    expect(after.nodes.length).toBe(before.length + 1);
    expect(after.edges.some((e) => e.from === 'function:src/a.ts#a2' && e.to === 'function:src/a.ts#a')).toBe(true);
    expect(after.edges.some((e) => e.from === 'function:src/b.ts#b' && e.to === 'function:src/a.ts#a')).toBe(true);
    expect(st.files).toBe(2);
  });
});
