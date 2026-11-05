// T102 red->green: prCheckAsync must return the LITERAL SAME result as prCheck() (it runs the same implementation
// in a worker thread), and the worktree cache (worktree-cache.ts) must stay correct under concurrent calls against
// the SAME repo at DIFFERENT revisions (the scenario a server job queue with real concurrency would hit).
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prCheck, prCheckAsync, type PrCheckResult } from '../src/index.js';
import { __resetPrCheckAsyncPool } from '../src/check/pr-check-async.js';

const git = (root: string, ...args: string[]) =>
  execFileSync('git', ['-C', root, '-c', 'user.name=T', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', ...args], { encoding: 'utf8' }).trim();

const rec = (id: string, status: string, scope: string[]) =>
  `---\nid: '${id}'\ntitle: Record ${id}\nstatus: ${status}\nscope:\n${scope.map((s) => `  - ${s}`).join('\n')}\n---\n\n## Decision\n\nRecord ${id}.\n`;

function write(root: string, rel: string, text: string) {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), text);
}

let root = '';
let base = '';
const heads: Record<string, string> = {};

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'mole-pr-check-async-'));
  git(root, 'init', '-q', '-b', 'main');
  write(root, 'src/a.ts', 'export function foo(x: number): number {\n  return x + 1;\n}\n');
  write(root, 'src/b.ts', 'export const b = 1;\n');
  write(root, '.mole/decisions/0001-foo.md', rec('0001', 'accepted', ['src/a.ts#foo']));
  write(root, '.mole/decisions/0002-b.md', rec('0002', 'accepted', ['src/b.ts']));
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'base');
  base = git(root, 'rev-parse', 'HEAD');

  function pr(name: string, edit: () => void): string {
    git(root, 'checkout', '-q', '-b', name, base);
    edit();
    git(root, 'add', '-A');
    git(root, 'commit', '-q', '-m', name);
    const sha = git(root, 'rev-parse', 'HEAD');
    git(root, 'checkout', '-q', base);
    return sha;
  }
  heads.foo = pr('async-edit-foo', () => write(root, 'src/a.ts', 'export function foo(x: number): number {\n  return x + 2;\n}\n'));
  heads.b = pr('async-edit-b', () => write(root, 'src/b.ts', 'export const b = 2;\n'));
});
afterAll(async () => {
  await __resetPrCheckAsyncPool();
  if (root) rmSync(root, { recursive: true, force: true });
});

const strip = (r: PrCheckResult) => JSON.stringify({ ...r, ms: 0 }); // ms is a wall-clock measurement, not part of the decided result

describe('prCheckAsync: identical result to prCheck, non-blocking for the server', () => {
  it('returns the exact same payload as the sync prCheck for the same PR', async () => {
    const sync = await prCheck({ root, base, head: heads.foo!, history: true });
    const async_ = await prCheckAsync({ root, base, head: heads.foo!, history: true });
    expect(strip(async_)).toBe(strip(sync));
  });

  it('two concurrent calls against the SAME repo at DIFFERENT revisions both get their own correct result', async () => {
    const [a, b] = await Promise.all([prCheckAsync({ root, base, head: heads.foo!, history: false }), prCheckAsync({ root, base, head: heads.b!, history: false })]);
    expect(a.governed.map((g) => g.id)).toEqual(['0001']);
    expect(b.governed.map((g) => g.id)).toEqual(['0002']);
  });

  it('repeated concurrent async calls match their own sync equivalents (no cross-talk from the shared worktree cache)', async () => {
    const jobs = [heads.foo!, heads.b!, heads.foo!, heads.b!, heads.foo!, heads.b!];
    const [asyncResults, syncResults] = await Promise.all([
      Promise.all(jobs.map((head) => prCheckAsync({ root, base, head, history: false }))),
      Promise.all(jobs.map((head) => prCheck({ root, base, head, history: false }))),
    ]);
    for (let i = 0; i < jobs.length; i++) expect(strip(asyncResults[i]!)).toBe(strip(syncResults[i]!));
  });
});
