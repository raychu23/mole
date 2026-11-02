import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

// T56 (D67 first slice): proposal branches of the decision records, evaluated against one pinned baseline.
// Rewritten from the codex draft (17:0x): its CLI path pointed inside the temp repo, and its expected labels
// misread Argdown (`<A>` + indented `-> <B>` means A attacks B, so the baseline has A in, B out).
const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'src', 'cli.js');
const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

function git(root: string, args: string[]): string {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
}

function write(root: string, file: string, text: string): void {
  const path = join(root, file);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

function tmp(prefix: string): string {
  const d = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(d);
  return d;
}

// baseline: A ("cache reads are safe") attacks B ("reads can serve stale data") -> A in, B out; D1 rests on A
function repo(): string {
  const root = tmp('mole-proposals-');
  git(root, ['init', '-q', '-b', 'main']);
  git(root, ['config', 'user.name', 'T']);
  git(root, ['config', 'user.email', 't@example.com']);
  write(root, '.mole/decisions/d1.md', ['---', 'id: D1', 'title: Cache reads', 'status: accepted', 'source: docs/adr.md#D1', 'cites: [A]', '---', ''].join('\n'));
  write(root, '.mole/arguments/case.argdown', ['<A>: Cache reads are safe.', '  -> <B>: Cache reads can serve stale data.', ''].join('\n'));
  git(root, ['add', '.']);
  git(root, ['commit', '-qm', 'baseline']);
  return root;
}

function cli(args: string[]): any {
  return JSON.parse(execFileSync('node', [CLI, ...args], { encoding: 'utf8' }));
}

function cliFails(args: string[]): string {
  try {
    execFileSync('node', [CLI, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e: any) {
    return String(e.stderr ?? e.message);
  }
  throw new Error('expected the command to fail');
}

describe('mole-proposals CLI (T56)', () => {
  it('two proposals from one pinned baseline: compare shows which arguments and decisions each one changes, baseline untouched', () => {
    const root = repo();
    const treeBefore = git(root, ['rev-parse', 'HEAD^{tree}']);
    const space = tmp('mole-proposal-wt-');
    const alpha = join(space, 'alpha');
    const beta = join(space, 'beta');

    const a = cli(['create', '--repo', root, '--name', 'alpha', '--path', alpha]);
    const b = cli(['create', '--repo', root, '--name', 'beta', '--path', beta]);
    expect(a.baselineRevision).toMatch(/^[0-9a-f]{40}$/);
    expect(b.baselineRevision).toBe(a.baselineRevision);
    expect(a.branch).toBe('mole/proposal/alpha');

    // alpha drops the rebuttal: B stands, A still stands -> B out -> in, D1 unaffected
    write(alpha, '.mole/arguments/case.argdown', ['<A>: Cache reads are safe.', '', '<B>: Cache reads can serve stale data.', ''].join('\n'));
    // beta adds a counter-attack B -> A -> both undecided, D1 now contested
    write(beta, '.mole/arguments/case.argdown', ['<A>: Cache reads are safe.', '  -> <B>: Cache reads can serve stale data.', '', '<B>', '  -> <A>', ''].join('\n'));
    write(beta, 'notes/idea.txt', 'free prose, not a record');

    const cmp = cli(['compare', '--left', alpha, '--right', beta]);
    expect(cmp.baselineRevision).toBe(a.baselineRevision);
    const [pa, pb] = cmp.proposals;
    expect(pa.name).toBe('alpha');
    expect(pa.changes.arguments).toEqual([expect.objectContaining({ id: 'B', text: 'Cache reads can serve stale data.', before: 'out', after: 'in', source: { file: '.mole/arguments/case.argdown', line: 3 } })]);
    expect(pa.changes.decisions).toEqual([]);
    expect(pb.changes.arguments.map((c: any) => [c.id, c.before, c.after])).toEqual([['A', 'in', 'undecided'], ['B', 'out', 'undecided']]);
    expect(pb.changes.decisions).toEqual([expect.objectContaining({ id: 'D1', source: 'docs/adr.md#D1', before: 'holds', after: 'contested', because: ['A'] })]);
    // files a proposal changed that are not structured records are listed, never interpreted
    expect(pb.notEvaluated).toContain('notes/idea.txt');

    // approved baseline: same tree, clean, still on main
    expect(git(root, ['rev-parse', 'HEAD^{tree}'])).toBe(treeBefore);
    expect(git(root, ['status', '--porcelain'])).toBe('');
    expect(git(root, ['branch', '--show-current'])).toBe('main');
  });

  it('evaluate reports one proposal against its baseline', () => {
    const root = repo();
    const p = join(tmp('mole-proposal-wt-'), 'solo');
    cli(['create', '--repo', root, '--name', 'solo', '--path', p]);
    write(p, '.mole/arguments/case.argdown', ['<A>: Cache reads are safe.', '', '<B>: Cache reads can serve stale data.', ''].join('\n'));
    const r = cli(['evaluate', '--path', p]);
    expect(r.name).toBe('solo');
    expect(r.changes.arguments.map((c: any) => c.id)).toEqual(['B']);
  });

  it('rejects unsafe names, existing paths and existing branches without writing anything', () => {
    const root = repo();
    const space = tmp('mole-proposal-wt-');
    const taken = join(space, 'taken');
    mkdirSync(taken);
    expect(cliFails(['create', '--repo', root, '--name', '../bad', '--path', join(space, 'x')])).toMatch(/name/i);
    expect(cliFails(['create', '--repo', root, '--name', 'ok', '--path', taken])).toMatch(/exists/i);
    expect(cliFails(['create', '--repo', root, '--name', 'ok', '--path', 'relative/path'])).toMatch(/absolute/i);
    expect(git(root, ['branch', '--list', 'mole/proposal/*'])).toBe('');
    cli(['create', '--repo', root, '--name', 'ok', '--path', join(space, 'ok')]);
    expect(cliFails(['create', '--repo', root, '--name', 'ok', '--path', join(space, 'ok2')])).toMatch(/exists/i);
    expect(existsSync(join(space, 'ok2'))).toBe(false);
  });

  it('refuses a non-git folder and a proposal path that is not a Mole proposal', () => {
    const plain = tmp('mole-not-git-');
    expect(cliFails(['create', '--repo', plain, '--name', 'x', '--path', join(tmp('w-'), 'x')])).toMatch(/git/i);
    expect(cliFails(['evaluate', '--path', plain])).toMatch(/proposal/i);
  });

  it('compare refuses proposals made from different baselines', () => {
    const root = repo();
    const space = tmp('mole-proposal-wt-');
    cli(['create', '--repo', root, '--name', 'one', '--path', join(space, 'one')]);
    write(root, 'README.md', 'next commit');
    git(root, ['add', '.']);
    git(root, ['commit', '-qm', 'second']);
    cli(['create', '--repo', root, '--name', 'two', '--path', join(space, 'two')]);
    expect(cliFails(['compare', '--left', join(space, 'one'), '--right', join(space, 'two')])).toMatch(/baseline/i);
  });
});
