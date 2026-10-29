// T13 red tests: done-when 1 (the seen writer the extension calls: appendSeen + `mole seen --stdin`), 2 (since lists exactly the
// seen-then-changed symbols, newest first, grouped by file, with commit/author/agent; unseen never; looking again clears),
// 4 (no seen log -> 'nothing seen yet' + how to start, exit 0), 5 (.mole/local/ gitignored).
import { spawnSync, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { appendSeen, readSeen, SEEN_LOG, since, symbolsInFile, symbolsOfText } from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const cli = resolve(here, '../../daemon/dist/cli.js');
const repoRoot = resolve(here, '../../..');

const A0 = `export function alpha(x: number): number {
  return x + 1;
}

export function beta(x: number): number {
  return x * 2;
}

export class Box {
  open(): string {
    return 'open';
  }
}
`;
const B0 = `export function gamma(s: string): string {
  return s.trim();
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
function git(root: string, args: string[], env: Record<string, string> = {}): string {
  return execFileSync('git', ['-C', root, '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}
function commit(root: string, files: Record<string, string>, who: string, date: string, message: string): string {
  for (const [p, b] of Object.entries(files)) write(root, p, b);
  git(root, ['add', '-A']);
  git(root, ['commit', '-q', '-m', message], {
    GIT_AUTHOR_NAME: who,
    GIT_AUTHOR_EMAIL: `${who.toLowerCase()}@example.com`,
    GIT_AUTHOR_DATE: date,
    GIT_COMMITTER_NAME: who,
    GIT_COMMITTER_EMAIL: `${who.toLowerCase()}@example.com`,
    GIT_COMMITTER_DATE: date,
  });
  return git(root, ['rev-parse', 'HEAD']).trim();
}
function repo(): string {
  const root = mkdtempSync(join(tmpdir(), 'mole-since-'));
  dirs.push(root);
  git(root, ['init', '-q', '-b', 'main']);
  commit(root, { 'src/a.ts': A0, 'src/b.ts': B0 }, 'Base', '2026-01-01T10:00:00+00:00', 'base');
  return root;
}
const runCli = (args: string[], input?: string) =>
  spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', input, timeout: 60_000 });
const listed = (root: string) => since(root).files.flatMap((f) => f.symbols.map((s) => s.symbol));

describe('seen log writer (done-when 1: what the extension writes through)', () => {
  it('appendSeen writes one JSON line per symbol with hash + HEAD commit into .mole/local/seen.jsonl', () => {
    const root = repo();
    const head = git(root, ['rev-parse', 'HEAD']).trim();
    const ev = appendSeen(root, [
      { path: 'src/a.ts', tail: 'alpha', how: 'visible', time: '2026-02-01T00:00:00.000Z' },
      { path: 'src/a.ts', tail: 'Box.open', how: 'hover' },
      { path: 'src/a.ts', tail: 'NoSuchSymbol', how: 'visible' },
    ]);
    expect(SEEN_LOG).toBe('.mole/local/seen.jsonl');
    expect(ev.map((e) => e.symbol)).toEqual(['src/a.ts#alpha', 'src/a.ts#Box.open']);
    const lines = readFileSync(join(root, SEEN_LOG), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    expect(lines).toHaveLength(2);
    const alpha = symbolsInFile(root, 'src/a.ts').find((s) => s.tail === 'alpha')!;
    expect(lines[0]).toEqual({ time: '2026-02-01T00:00:00.000Z', symbol: 'src/a.ts#alpha', path: 'src/a.ts', hash: alpha.hash, how: 'visible', commit: head });
    expect(lines[1]).toMatchObject({ symbol: 'src/a.ts#Box.open', how: 'hover', commit: head });
    expect(readSeen(root)).toHaveLength(2);
  });

  it('hashes the editor buffer when text is given (unsaved edits), not the file on disk', () => {
    const root = repo();
    const buffer = A0.replace('x + 1', 'x + 100');
    const [ev] = appendSeen(root, [{ path: 'src/a.ts', tail: 'alpha', how: 'visible', text: buffer }]);
    expect(ev!.hash).toBe(symbolsOfText('src/a.ts', buffer).find((s) => s.tail === 'alpha')!.hash);
    expect(ev!.hash).not.toBe(symbolsInFile(root, 'src/a.ts').find((s) => s.tail === 'alpha')!.hash);
  });

  it('the local folder never leaves the machine: .mole/local/ is gitignored (repo .gitignore and in the folder itself)', () => {
    expect(readFileSync(join(repoRoot, '.gitignore'), 'utf8').split('\n').map((l) => l.trim())).toContain('.mole/local/');
    const root = repo();
    appendSeen(root, [{ path: 'src/a.ts', tail: 'alpha', how: 'visible' }]);
    expect(git(root, ['status', '--porcelain', '--untracked-files=all']).trim()).toBe('');
  });

  it('`mole seen --stdin` (the extension\'s sink) records a batch; `mole note add` records a note look', () => {
    const root = repo();
    const batch = [
      { path: 'src/a.ts', tail: 'beta', how: 'visible' },
      { path: 'src/b.ts', tail: 'gamma', how: 'hover' },
    ];
    const r = runCli(['seen', '--stdin', '--root', root], JSON.stringify(batch));
    expect(r.status, r.stderr).toBe(0);
    const n = runCli(['note', 'add', 'src/a.ts#alpha', 'why alpha', '--root', root, '--author', 't']);
    expect(n.status, n.stderr).toBe(0);
    const ev = readSeen(root)!;
    expect(ev.map((e) => [e.symbol, e.how])).toEqual([
      ['src/a.ts#beta', 'visible'],
      ['src/b.ts#gamma', 'hover'],
      ['src/a.ts#alpha', 'note'],
    ]);
  }, 120_000);
});

describe('mole since (done-when 2)', () => {
  it('lists exactly the seen-then-changed symbols with commit, author and Co-authored-by agent; unseen and ws-only never', () => {
    const root = repo();
    appendSeen(root, ['alpha', 'Box.open'].map((tail) => ({ path: 'src/a.ts', tail, how: 'visible' as const })));
    appendSeen(root, [{ path: 'src/b.ts', tail: 'gamma', how: 'visible' }]);
    const c1 = commit(root, { 'src/a.ts': A0.replace('x + 1', 'x + 2').replace('x * 2', 'x * 3') }, 'Alice', '2026-01-02T10:00:00+00:00', 'tweak alpha and beta');
    const c2 = commit(root, { 'src/b.ts': B0.replace('s.trim()', 's.trim().toLowerCase()') }, 'Bob', '2026-01-03T10:00:00+00:00', 'gamma lowercases\n\nCo-authored-by: Codex <codex@openai.com>');
    commit(root, { 'src/a.ts': A0.replace('x + 1', 'x + 2').replace('x * 2', 'x * 3').replace("return 'open';", "return    'open'; // same") }, 'Carol', '2026-01-04T10:00:00+00:00', 'reformat open');
    const r = since(root);
    expect(r.nothingSeen).toBe(false);
    expect(r.seenCount).toBe(3);
    // newest first, grouped by file: b.ts (c2) before a.ts (c1); beta changed but was never seen; Box.open only reformatted
    expect(r.files.map((f) => [f.path, f.symbols.map((s) => s.symbol)])).toEqual([
      ['src/b.ts', ['src/b.ts#gamma']],
      ['src/a.ts', ['src/a.ts#alpha']],
    ]);
    const gamma = r.files[0]!.symbols[0]!;
    expect(gamma.status).toBe('changed');
    expect(gamma.changes).toHaveLength(1);
    expect(gamma.changes[0]).toMatchObject({ commit: c2, author: 'Bob', agent: 'Codex', subject: 'gamma lowercases' });
    const alpha = r.files[1]!.symbols[0]!;
    expect(alpha.changes.map((c) => [c.commit, c.author, c.agent])).toEqual([[c1, 'Alice', undefined]]);
  });

  it('looking again clears an entry (a newer seen event with the current body)', () => {
    const root = repo();
    appendSeen(root, [{ path: 'src/a.ts', tail: 'alpha', how: 'visible' }]);
    commit(root, { 'src/a.ts': A0.replace('x + 1', 'x + 2') }, 'Alice', '2026-01-02T10:00:00+00:00', 'alpha +2');
    expect(listed(root)).toEqual(['src/a.ts#alpha']);
    appendSeen(root, [{ path: 'src/a.ts', tail: 'alpha', how: 'hover' }]);
    expect(listed(root)).toEqual([]);
    commit(root, { 'src/a.ts': A0.replace('x + 1', 'x + 3') }, 'Alice', '2026-01-03T10:00:00+00:00', 'alpha +3');
    const again = since(root).files.flatMap((f) => f.symbols);
    expect(again.map((s) => s.symbol)).toEqual(['src/a.ts#alpha']);
    expect(again[0]!.changes.map((c) => c.subject)).toEqual(['alpha +3']); // only what changed after the latest look
  });

  it('deleted since you looked; moved with the same body is not a change; uncommitted edits are listed as uncommitted', () => {
    const root = repo();
    appendSeen(root, ['alpha', 'beta', 'Box.open'].map((tail) => ({ path: 'src/a.ts', tail, how: 'visible' as const })));
    // beta deleted, Box moves to src/box.ts unchanged
    const a1 = A0.replace(/export function beta[\s\S]*?\n}\n\n/, '').replace(/export class Box[\s\S]*$/, '');
    rmSync(join(root, 'src/a.ts'));
    commit(root, { 'src/a.ts': a1, 'src/box.ts': A0.slice(A0.indexOf('export class Box')) }, 'Dana', '2026-01-02T10:00:00+00:00', 'drop beta, move Box');
    // alpha edited in the working tree, not committed
    write(root, 'src/a.ts', a1.replace('x + 1', 'x - 1'));
    const all = since(root).files.flatMap((f) => f.symbols);
    const by = Object.fromEntries(all.map((s) => [s.symbol, s]));
    expect(Object.keys(by).sort()).toEqual(['src/a.ts#alpha', 'src/a.ts#beta']);
    expect(by['src/a.ts#beta']!.status).toBe('deleted');
    expect(by['src/a.ts#beta']!.changes[0]).toMatchObject({ author: 'Dana', subject: 'drop beta, move Box' });
    expect(by['src/a.ts#alpha']!.status).toBe('changed');
    expect(by['src/a.ts#alpha']!.changes.map((c) => c.commit)).toEqual(['uncommitted']);
  });

  it('`mole since --json` and the text form name the symbol, short sha, author and agent', () => {
    const root = repo();
    appendSeen(root, [{ path: 'src/b.ts', tail: 'gamma', how: 'visible' }]);
    const c = commit(root, { 'src/b.ts': B0.replace('s.trim()', 's.trimEnd()') }, 'Bob', '2026-01-03T10:00:00+00:00', 'gamma trims end\n\nCo-authored-by: Claude <noreply@anthropic.com>');
    const j = runCli(['since', '--json', '--root', root]);
    expect(j.status, j.stderr).toBe(0);
    const parsed = JSON.parse(j.stdout) as { files: Array<{ path: string; symbols: Array<{ symbol: string; changes: Array<{ commit: string; agent?: string }> }> }> };
    expect(parsed.files.map((f) => f.symbols.map((s) => s.symbol))).toEqual([['src/b.ts#gamma']]);
    expect(parsed.files[0]!.symbols[0]!.changes[0]).toMatchObject({ commit: c, agent: 'Claude' });
    const t = runCli(['since', '--root', root]);
    expect(t.status, t.stderr).toBe(0);
    expect(t.stdout).toContain('src/b.ts');
    expect(t.stdout).toContain('gamma');
    expect(t.stdout).toContain(c.slice(0, 7));
    expect(t.stdout).toContain('Bob');
    expect(t.stdout).toContain('Claude');
  }, 120_000);
});

describe('no seen log yet (done-when 4)', () => {
  it('since() says nothing seen; the CLI prints how to start and exits 0 (text and --json)', () => {
    const root = repo();
    const r = since(root);
    expect(r.nothingSeen).toBe(true);
    expect(r.files).toEqual([]);
    expect(readSeen(root)).toBeUndefined();
    expect(existsSync(join(root, '.mole'))).toBe(false);
    const t = runCli(['since', '--root', root]);
    expect(t.status, t.stderr).toBe(0);
    expect(t.stdout).toMatch(/nothing seen yet/i);
    expect(t.stdout).toContain('mole.recordSeen');
    expect(t.stdout).toContain('mole seen');
    const j = runCli(['since', '--json', '--root', root]);
    expect(j.status, j.stderr).toBe(0);
    expect(JSON.parse(j.stdout)).toMatchObject({ nothingSeen: true, files: [] });
  }, 120_000);

  it('a seen log whose symbols all still match prints that nothing changed', () => {
    const root = repo();
    appendSeen(root, [{ path: 'src/a.ts', tail: 'alpha', how: 'visible' }]);
    renameSync(join(root, 'src/b.ts'), join(root, 'src/c.ts'));
    const r = since(root);
    expect(r.nothingSeen).toBe(false);
    expect(r.files).toEqual([]);
  });
});
