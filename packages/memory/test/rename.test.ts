// T19 red tests: done-when 1 (mole memory / mole since report 'renamed: old → new', note stays fresh when only the name
// changed; rename + move), 3 (two equal candidates -> stays orphaned, lists both, never guesses), 4 (rename + body edit ->
// 'renamed + changed', stale, never silently fresh); seen history follows the rename; an unrelated delete stays deleted.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { addNote, appendSeen, formatSince, memory, since } from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const cli = resolve(here, '../../daemon/dist/cli.js');

const ALPHA = (name: string, extra = '') => `export function ${name}(xs: number[], depth: number): number {
  if (depth <= 0 || xs.length === 0) return 0;
  const [head, ...rest] = xs;${extra}
  return head * depth + ${name}(rest, depth - 1);
}
`;
const BETA = `export function beta(s: string): string {
  return s.trim().toUpperCase();
}
`;
const GAMMA = `export function gamma(a: number, b: number): number {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  return Math.round((hi - lo) / 2) + lo;
}
`;
const SUM = (name: string) => `export function ${name}(items: number[]): number {
  let total = 0;
  for (const item of items) total += item * 2;
  return total;
}
`;

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
function write(root: string, p: string, body: string): void {
  mkdirSync(dirname(join(root, p)), { recursive: true });
  writeFileSync(join(root, p), body);
}
function git(root: string, args: string[]): string {
  return execFileSync('git', ['-C', root, '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', ...args], {
    encoding: 'utf8',
    env: { ...process.env, GIT_AUTHOR_NAME: 'Ann', GIT_AUTHOR_EMAIL: 'ann@example.com', GIT_COMMITTER_NAME: 'Ann', GIT_COMMITTER_EMAIL: 'ann@example.com' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}
function commit(root: string, files: Record<string, string | null>, message: string): void {
  for (const [p, b] of Object.entries(files)) {
    if (b === null) rmSync(join(root, p), { force: true });
    else write(root, p, b);
  }
  git(root, ['add', '-A']);
  git(root, ['commit', '-q', '-m', message]);
}
function repo(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'mole-t19-'));
  dirs.push(root);
  git(root, ['init', '-q', '-b', 'main']);
  commit(root, files, 'base');
  return root;
}
const opts = { author: 'Ann', date: '2026-01-01T00:00:00.000Z' };
const entry = (root: string, symbol: string) => memory(root).find((e) => e.symbol === symbol);
function runCli(args: string[]): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', timeout: 60_000 });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

describe('mole memory: renamed symbols keep their notes (done-when 1)', () => {
  it('a renamed function keeps its note fresh and reports renamed: old → new (working tree and committed)', () => {
    const root = repo({ 'src/a.ts': ALPHA('alpha') + '\n' + BETA });
    addNote(root, 'src/a.ts#alpha', 'alpha weights by depth', opts);
    commit(root, {}, 'note');
    write(root, 'src/a.ts', ALPHA('alphaWeighted') + '\n' + BETA);
    const before = entry(root, 'src/a.ts#alpha');
    expect(before).toMatchObject({ status: 'fresh', renamedTo: 'src/a.ts#alphaWeighted', line: 1 });
    expect(before?.changed ?? false).toBe(false);
    commit(root, {}, 'rename alpha');
    expect(entry(root, 'src/a.ts#alpha')).toMatchObject({ status: 'fresh', renamedTo: 'src/a.ts#alphaWeighted' });
    expect(entry(root, 'src/a.ts#beta')).toBeUndefined();
    const t = runCli(['memory', '--root', root]);
    expect(t.status, t.stderr).toBe(0);
    expect(t.stdout).toMatch(/^fresh\s+.*renamed: src\/a\.ts#alpha → src\/a\.ts#alphaWeighted/m);
    const j = runCli(['memory', '--json', '--root', root]);
    expect(JSON.parse(j.stdout)[0]).toMatchObject({ status: 'fresh', renamedTo: 'src/a.ts#alphaWeighted' });
  }, 120_000);

  it('rename + move to another file: fresh, new path and new name', () => {
    const root = repo({ 'src/a.ts': ALPHA('alpha') + '\n' + BETA });
    addNote(root, 'src/a.ts#alpha', 'alpha note', opts);
    commit(root, { 'src/a.ts': BETA, 'src/lib/weights.ts': '// moved here\n' + ALPHA('weightedSum') }, 'move + rename alpha');
    const e = entry(root, 'src/a.ts#alpha');
    expect(e).toMatchObject({ status: 'fresh', renamedTo: 'src/lib/weights.ts#weightedSum', newPath: 'src/lib/weights.ts', line: 2 });
    expect(e?.changed ?? false).toBe(false);
  });
});

describe('rename + body edit is renamed + changed, stale (done-when 4)', () => {
  it('reports renamed + changed and stale, never silently fresh', () => {
    const root = repo({ 'src/a.ts': ALPHA('alpha') + '\n' + BETA });
    addNote(root, 'src/a.ts#alpha', 'alpha note', opts);
    commit(root, { 'src/a.ts': ALPHA('alphaV2', '\n  if (head === undefined) return -1;') + '\n' + BETA }, 'rename + edit alpha');
    const e = entry(root, 'src/a.ts#alpha');
    expect(e).toMatchObject({ status: 'stale', renamedTo: 'src/a.ts#alphaV2', changed: true });
    expect(e?.similarity).toBeGreaterThanOrEqual(0.55);
    expect(e?.similarity).toBeLessThan(1);
    const t = runCli(['memory', '--root', root]);
    expect(t.status, t.stderr).toBe(0);
    expect(t.stdout).toMatch(/^stale\s+.*renamed \+ changed: src\/a\.ts#alpha → src\/a\.ts#alphaV2/m);
  }, 120_000);
});

describe('ambiguous renames are never guessed (done-when 3)', () => {
  it('two new symbols with the same body: stays orphaned and lists both candidates', () => {
    const root = repo({ 'src/a.ts': SUM('total') + '\n' + BETA });
    addNote(root, 'src/a.ts#total', 'total doubles', opts);
    commit(root, { 'src/a.ts': BETA, 'src/x.ts': SUM('sumA'), 'src/y.ts': SUM('sumB') }, 'split total');
    const e = entry(root, 'src/a.ts#total');
    expect(e?.status).toBe('orphaned');
    expect(e?.renamedTo).toBeUndefined();
    expect([...(e?.candidates ?? [])].sort()).toEqual(['src/x.ts#sumA', 'src/y.ts#sumB']);
    const t = runCli(['memory', '--root', root]);
    expect(t.status, t.stderr).toBe(0);
    expect(t.stdout).toMatch(/^orphaned/m);
    expect(t.stdout).toContain('src/x.ts#sumA');
    expect(t.stdout).toContain('src/y.ts#sumB');
  }, 120_000);
});

describe('mole since follows renames (done-when 1, seen history)', () => {
  it('a seen symbol that was renamed shows renamed, not deleted; rename + edit shows renamed + changed', () => {
    const root = repo({ 'src/a.ts': ALPHA('alpha') + '\n' + BETA, 'src/g.ts': GAMMA });
    appendSeen(root, [
      { path: 'src/a.ts', tail: 'alpha', how: 'visible' },
      { path: 'src/g.ts', tail: 'gamma', how: 'visible' },
    ]);
    commit(root, { 'src/a.ts': ALPHA('alphaWeighted') + '\n' + BETA, 'src/g.ts': GAMMA.replace('gamma', 'midpoint').replace('/ 2', '/ 3') }, 'rename alpha, gamma');
    const all = since(root).files.flatMap((f) => f.symbols);
    const by = Object.fromEntries(all.map((s) => [s.symbol, s]));
    expect(by['src/a.ts#alpha']).toMatchObject({ status: 'renamed', renamedTo: 'src/a.ts#alphaWeighted' });
    expect(by['src/a.ts#alpha']!.changes[0]).toMatchObject({ subject: 'rename alpha, gamma' });
    expect(by['src/g.ts#gamma']).toMatchObject({ status: 'renamed+changed', renamedTo: 'src/g.ts#midpoint' });
    const text = formatSince(since(root));
    expect(text).toContain('renamed: alpha → alphaWeighted');
    expect(text).toContain('renamed + changed: gamma → midpoint');
    expect(text).not.toContain('deleted');
    const t = runCli(['since', '--root', root]);
    expect(t.status, t.stderr).toBe(0);
    expect(t.stdout).toContain('renamed: alpha → alphaWeighted');
  }, 120_000);

  it('a later look at the new name supersedes the look at the old name', () => {
    const root = repo({ 'src/a.ts': ALPHA('alpha') + '\n' + BETA });
    appendSeen(root, [{ path: 'src/a.ts', tail: 'alpha', how: 'visible', time: '2026-01-01T00:00:00.000Z' }]);
    commit(root, { 'src/a.ts': ALPHA('alphaWeighted', '\n  if (head === undefined) return -1;') + '\n' + BETA }, 'rename + edit');
    expect(since(root).files.flatMap((f) => f.symbols.map((s) => s.symbol))).toEqual(['src/a.ts#alpha']);
    appendSeen(root, [{ path: 'src/a.ts', tail: 'alphaWeighted', how: 'visible' }]);
    expect(since(root).files).toEqual([]);
  });
});

describe('an unrelated delete stays deleted', () => {
  it('memory: orphaned without candidates; since: deleted', () => {
    const root = repo({ 'src/a.ts': BETA, 'src/g.ts': GAMMA });
    addNote(root, 'src/g.ts#gamma', 'gamma note', opts);
    appendSeen(root, [{ path: 'src/g.ts', tail: 'gamma', how: 'visible' }]);
    commit(root, { 'src/g.ts': SUM('unrelatedTotal') }, 'drop gamma');
    const e = entry(root, 'src/g.ts#gamma');
    expect(e?.status).toBe('orphaned');
    expect(e?.renamedTo).toBeUndefined();
    expect(e?.candidates ?? []).toEqual([]);
    const s = since(root).files.flatMap((f) => f.symbols);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ symbol: 'src/g.ts#gamma', status: 'deleted' });
  });
});
