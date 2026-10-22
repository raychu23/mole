import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { formatNeighborhood, MAX_MAP_NODES } from '@mole/core';
import { TsIndexer } from '@mole/indexer';
import { AlreadyRunning, Daemon, MoleClient, neighborhood } from '../src/index.js';

const cleanups: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  for (const c of cleanups.splice(0).reverse()) await c();
});

function repo(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'mole-d-'));
  cleanups.push(() => rmSync(root, { recursive: true, force: true }));
  for (const [p, body] of Object.entries(files)) {
    mkdirSync(dirname(join(root, p)), { recursive: true });
    writeFileSync(join(root, p), body);
  }
  return root;
}

const SMALL = {
  'src/util.ts': 'export function clamp(n: number) {\n  return n;\n}\nexport function unused() {\n  return 0;\n}\n',
  'src/svc.ts': "import { clamp } from './util.js';\nexport class Svc {\n  find(id: number) {\n    return clamp(id);\n  }\n}\nexport function make() {\n  return new Svc();\n}\n",
  'src/app.ts': "import { make } from './svc.js';\nexport function main() {\n  return make().find(1);\n}\n",
};

function indexed(files: Record<string, string>) {
  const root = repo(files);
  const ix = new TsIndexer({ root, commit: 'abc1234' });
  ix.indexAll();
  cleanups.push(() => ix.close());
  return ix.db;
}

describe('neighborhood (pure query)', () => {
  it('file map lists its symbols, callers, callees and importers', () => {
    const n = neighborhood(indexed(SMALL), 'src/svc.ts');
    expect(n.state).toBe('ok');
    expect(n.focus).toMatchObject({ kind: 'file', path: 'src/svc.ts' });
    const by = (role: string) => n.nodes.filter((x) => x.role === role).map((x) => x.name).sort();
    expect(by('own')).toEqual(['Svc', 'make']); // methods fold into their class on a file map
    expect(by('callee')).toContain('clamp');
    expect(by('caller')).toContain('main');
    expect(n.nodes.find((x) => x.role === 'importer')?.path).toBe('src/app.ts');
    expect(n.nodes.find((x) => x.role === 'imported')?.path).toBe('src/util.ts');
    expect(n.nodes.every((x) => x.evidence.commit === 'abc1234' && x.evidence.line >= 1)).toBe(true);
  });

  it('symbol map: container file, callers and callees', () => {
    const n = neighborhood(indexed(SMALL), 'src/svc.ts#Svc.find');
    expect(n.focus).toMatchObject({ kind: 'method', name: 'find' });
    expect(n.nodes.find((x) => x.role === 'container')?.path).toBe('src/svc.ts');
    expect(n.nodes.filter((x) => x.role === 'callee').map((x) => x.name)).toContain('clamp');
    expect(n.nodes.filter((x) => x.role === 'caller').map((x) => x.name)).toContain('main');
  });

  it('impact view flags transitive callers', () => {
    const n = neighborhood(indexed(SMALL), 'src/util.ts', { impact: true });
    const hit = new Map(n.nodes.map((x) => [x.name, x.impacted === true]));
    expect(hit.get('clamp')).toBe(true); // called by Svc.find
    expect(hit.get('unused')).toBe(false); // nobody calls it
  });

  it('a file outside the index is "not-indexed", not an error', () => {
    const n = neighborhood(indexed(SMALL), 'src/nope.ts');
    expect(n.state).toBe('not-indexed');
    expect(n.nodes).toEqual([]);
    expect(formatNeighborhood(n)).toContain('not-indexed');
  });

  it('caps the map at MAX_MAP_NODES and groups the rest as +N more', () => {
    const many: Record<string, string> = {};
    let hub = '';
    for (let i = 0; i < 40; i++) {
      many[`src/f${i}.ts`] = `export function f${i}() {\n  return ${i};\n}\n`;
      hub += `import { f${i} } from './f${i}.js';\n`;
    }
    hub += `export function hub() {\n  return [${Array.from({ length: 40 }, (_, i) => `f${i}()`).join(', ')}];\n}\n`;
    many['src/hub.ts'] = hub;
    const n = neighborhood(indexed(many), 'src/hub.ts');
    expect(n.nodes.length).toBe(MAX_MAP_NODES);
    expect(n.nodes[0]?.role).toBe('focus');
    expect(n.more.reduce((a, m) => a + m.count, 0)).toBeGreaterThan(0);
    expect(formatNeighborhood(n)).toMatch(/\+\d+ more/);
    const ids = new Set(n.nodes.map((x) => x.id));
    expect(n.edges.every((e) => ids.has(e.from) && ids.has(e.to))).toBe(true);
  });
});

async function until<T>(fn: () => Promise<T>, ok: (v: T) => boolean, ms = 20000): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (ok(v) || Date.now() > end) return v;
    await new Promise((r) => setTimeout(r, 100));
  }
}

describe('daemon', () => {
  it('serves map over the socket, is the only writer, and re-indexes a changed file', async () => {
    const root = repo(SMALL);
    const stateDir = join(root, '.state');
    const d = new Daemon({ root, stateDir });
    await d.start();
    cleanups.push(() => d.stop());
    const c = new MoleClient({ root, stateDir });
    const n = await until(() => c.map('src/svc.ts'), (x) => x.state === 'ok');
    expect(n.state).toBe('ok');
    expect(n.nodes.some((x) => x.name === 'clamp')).toBe(true);
    expect((await c.status()).state).toBe('ready');

    writeFileSync(join(root, 'src/svc.ts'), SMALL['src/svc.ts'] + 'export function extra() {\n  return 1;\n}\n');
    await c.call('update', { paths: ['src/svc.ts'] });
    const n2 = await until(() => c.map('src/svc.ts'), (x) => x.nodes.some((y) => y.name === 'extra'));
    expect(n2.nodes.some((x) => x.name === 'extra')).toBe(true);
  }, 60000);

  it('one daemon per repo: a second start fails, a stale lock is taken over', async () => {
    const root = repo(SMALL);
    const stateDir = join(root, '.state');
    const d = new Daemon({ root, stateDir });
    await d.start();
    cleanups.push(() => d.stop());
    await expect(new Daemon({ root, stateDir }).start()).rejects.toBeInstanceOf(AlreadyRunning);
    await d.stop();
    writeFileSync(join(stateDir, 'daemon.lock'), JSON.stringify({ pid: 2 ** 22 + 12345, socket: '/tmp/none.sock', root, startedAt: 0 }));
    const d2 = new Daemon({ root, stateDir });
    await d2.start(); // pid not alive → lock replaced
    cleanups.push(() => d2.stop());
    expect(await new MoleClient({ root, stateDir }).running()).toBe(true);
  }, 60000);

  it('FAILURE: daemon down → "index-unavailable", no throw', async () => {
    const root = repo(SMALL);
    const n = await new MoleClient({ root, stateDir: join(root, '.state'), timeoutMs: 500 }).map('src/svc.ts');
    expect(n.state).toBe('index-unavailable');
    expect(n.message).toMatch(/not reachable/);
  });

  it('FAILURE: file outside the index → "not-indexed" through the daemon', async () => {
    const root = repo(SMALL);
    const stateDir = join(root, '.state');
    const d = new Daemon({ root, stateDir });
    await d.start();
    cleanups.push(() => d.stop());
    const c = new MoleClient({ root, stateDir });
    await until(() => c.status(), (s) => s.state === 'ready');
    expect((await c.map('docs/readme.md')).state).toBe('not-indexed');
  }, 60000);
});
