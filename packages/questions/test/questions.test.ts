// T14 red tests (loop rule R1): done-when 1 (<= 3 questions, each citing its fact with a clickable source),
// 2 (0 questions on a change touching nothing known), 3 (a question when the change edits or deletes a guarding
// test of a past fix, read from the test diff) and 5 (works with no model configured; a model only rewords).
// Written before the implementation; created with a terminal heredoc (test-write gate, see 2 insights.md).
import { afterAll, describe, expect, it } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { addNote } from '@mole/memory';
import { MAX_QUESTIONS, questions, type Question } from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const CLI = resolve(here, '../../daemon/dist/cli.js');
const cleanups: Array<() => void> = [];
afterAll(() => cleanups.forEach((f) => f()));

const ENV = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
const git = (root: string, ...args: string[]): string => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', env: ENV }).trim();
function tmpRepo(): string {
  const root = mkdtempSync(join(tmpdir(), 'mole-questions-'));
  cleanups.push(() => rmSync(root, { recursive: true, force: true }));
  git(root, 'init', '-q', '-b', 'main');
  return root;
}
function write(root: string, file: string, text: string): void {
  mkdirSync(dirname(join(root, file)), { recursive: true });
  writeFileSync(join(root, file), text);
}
function commit(root: string, msg: string): string {
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', msg);
  return git(root, 'rev-parse', 'HEAD');
}
const fn = (name: string, body: string) => `export function ${name}(x: number): number {\n  ${body}\n}\n`;
const clickable = (q: Question) => q.source.file.length > 0 && Number.isInteger(q.source.line) && q.source.line > 0;
const cli = (...args: string[]) => spawnSync(process.execPath, [CLI, 'check', ...args], { encoding: 'utf8' });

/** a.ts with 5 functions, each last written by its own fix commit; returns the fix shas */
function fiveFixes(root: string): string[] {
  const names = ['f1', 'f2', 'f3', 'f4', 'f5'];
  write(root, 'src/a.ts', names.map((n) => fn(n, 'return x;')).join('\n'));
  commit(root, 'feat: five functions');
  const fixes: string[] = [];
  const bodies = names.map(() => 'return x;');
  names.forEach((n, i) => {
    bodies[i] = `return x + ${i + 1}; // ${n} must offset by ${i + 1}`;
    write(root, 'src/a.ts', names.map((m, j) => fn(m, bodies[j]!)).join('\n'));
    fixes.push(commit(root, `fix: ${n} lost its offset`));
  });
  return fixes;
}

describe('done-when 1: at most 3 questions, each citing its fact with a clickable source', () => {
  it('a change over 5 past fixes gets 3 past-fix questions, one per fix sha, each with sha + file:line', async () => {
    const root = tmpRepo();
    const fixes = fiveFixes(root);
    write(root, 'src/a.ts', ['f1', 'f2', 'f3', 'f4', 'f5'].map((n) => fn(n, 'return 0;')).join('\n'));
    const change = commit(root, 'feat: everything returns 0');
    const r = await questions(root, { sha: change });
    expect(MAX_QUESTIONS).toBe(3);
    expect(r.questions.length).toBe(3);
    expect(r.questions.map((q) => q.rank)).toEqual([1, 2, 3]);
    const shas = r.questions.map((q) => q.cites.sha);
    expect(new Set(shas).size).toBe(3);
    for (const q of r.questions) {
      expect(q.kind).toBe('past-fix');
      expect(fixes).toContain(q.cites.sha);
      expect(q.source.sha).toBe(q.cites.sha);
      expect(q.source.file).toBe('src/a.ts');
      expect(clickable(q)).toBe(true);
      expect(q.text).toContain(q.cites.sha!.slice(0, 7));
      expect(q.text).toContain(`src/a.ts:${q.source.line}`);
    }
    expect(r.facts.hunks.length).toBeGreaterThan(0);
    expect(r.modelCalls).toBe(0);
  }, 30000);

  it('mole check prints a "questions (n):" block after the past fixes and puts them under "questions" in --json', () => {
    const root = tmpRepo();
    fiveFixes(root);
    write(root, 'src/a.ts', ['f1', 'f2', 'f3', 'f4', 'f5'].map((n) => fn(n, 'return 0;')).join('\n'));
    const change = commit(root, 'feat: everything returns 0');
    const t = cli(change, '--root', root);
    expect(t.status).toBe(0);
    const at = t.stdout.indexOf('questions (3):');
    expect(at).toBeGreaterThan(0);
    expect(t.stdout.indexOf('source:')).toBeLessThan(at); // T12's per-hunk past fixes come first
    const j = cli(change, '--root', root, '--json');
    expect(j.status).toBe(0);
    const parsed = JSON.parse(j.stdout) as { hunks: unknown[]; noPastFixes: boolean; questions: Question[] };
    expect(parsed.noPastFixes).toBe(false);
    expect(parsed.hunks.length).toBeGreaterThan(0);
    expect(parsed.questions.length).toBe(3);
    expect(parsed.questions.every(clickable)).toBe(true);
  }, 30000);
});

describe('done-when 2: 0 questions on a change touching nothing known', () => {
  it('edits of lines no fix wrote, with no notes, get no questions (library and CLI)', async () => {
    const root = tmpRepo();
    write(root, 'src/b.ts', fn('g', 'return x;'));
    commit(root, 'feat: g');
    write(root, 'src/b.ts', fn('g', 'return x * 2;'));
    const change = commit(root, 'feat: g doubles');
    const r = await questions(root, { sha: change });
    expect(r.questions).toEqual([]);
    const t = cli(change, '--root', root);
    expect(t.status).toBe(0);
    expect(t.stdout).not.toContain('questions (');
    const j = JSON.parse(cli(change, '--root', root, '--json').stdout) as { questions: Question[] };
    expect(j.questions).toEqual([]);
  }, 30000);

  it('a change that only adds new files gets no questions', async () => {
    const root = tmpRepo();
    fiveFixes(root);
    write(root, 'src/new.ts', fn('h', 'return 1;'));
    const change = commit(root, 'feat: new file');
    expect((await questions(root, { sha: change })).questions).toEqual([]);
  }, 30000);
});

const LOADER = "export function load(x: string | null): string {\n  // null input used to crash the loader\n  const v = x ?? '';\n  return v.trim();\n}\n";
const GUARD = "describe('load (null input)', () => {\n  it('treats null as empty', () => {\n    expect(load(null)).toBe('');\n  });\n});\n";
/** feat adds loader + an unrelated test; the fix rewrites the loader and adds the guarding test 'load (null input)' */
function guarded(root: string): string {
  write(root, 'src/load.ts', 'export function load(x: string | null): string {\n  const v = x;\n  return v!.trim();\n}\n');
  write(root, 'test/load.test.ts', "describe('load (basics)', () => {\n  it('trims', () => {\n    expect(load(' a ')).toBe('a');\n  });\n});\n");
  commit(root, 'feat: loader');
  write(root, 'src/load.ts', LOADER);
  write(root, 'test/load.test.ts', "describe('load (basics)', () => {\n  it('trims', () => {\n    expect(load(' a ')).toBe('a');\n  });\n});\n" + GUARD);
  return commit(root, 'fix: loader crashed on null input\n\nA null config value reached trim().');
}

describe('done-when 3: a question when the change edits or deletes a guarding test of a past fix', () => {
  it('deleting the test the fix added asks about it, citing the test file and the fix', async () => {
    const root = tmpRepo();
    const fix = guarded(root);
    write(root, 'test/load.test.ts', "describe('load (basics)', () => {\n  it('trims', () => {\n    expect(load(' a ')).toBe('a');\n  });\n});\n");
    const change = commit(root, 'chore: drop a test');
    const r = await questions(root, { sha: change });
    const g = r.questions.filter((q) => q.kind === 'guard-test');
    expect(g.length).toBe(1);
    expect(g[0]!.cites.testFile).toBe('test/load.test.ts');
    expect(g[0]!.cites.sha).toBe(fix);
    expect(g[0]!.text).toContain('load (null input)');
    expect(g[0]!.text).toContain(fix.slice(0, 7));
    expect(clickable(g[0]!)).toBe(true);
    expect(r.facts.guards.some((f) => f.action === 'deletes' && f.testFile === 'test/load.test.ts')).toBe(true);
  }, 30000);

  it('editing a line inside the guarding test asks too; only adding a new test to the same file does not', async () => {
    const root = tmpRepo();
    guarded(root);
    const base = git(root, 'rev-parse', 'HEAD');
    write(root, 'test/load.test.ts', "describe('load (basics)', () => {\n  it('trims', () => {\n    expect(load(' a ')).toBe('a');\n  });\n});\n" + GUARD.replace("toBe('')", "toBe('x')"));
    const edit = commit(root, 'test: loosen');
    const e = await questions(root, { sha: edit });
    expect(e.questions.some((q) => q.kind === 'guard-test' && q.cites.testFile === 'test/load.test.ts')).toBe(true);
    git(root, 'reset', '-q', '--hard', base);
    write(root, 'test/load.test.ts', "describe('load (basics)', () => {\n  it('trims', () => {\n    expect(load(' a ')).toBe('a');\n  });\n});\n" + GUARD + "describe('load (more)', () => {\n  it('keeps inner spaces', () => {});\n});\n");
    const add = commit(root, 'test: add one');
    const a = await questions(root, { sha: add });
    expect(a.questions.filter((q) => q.kind === 'guard-test')).toEqual([]);
  }, 30000);

  it('ranks past fix > note > guard-test, and a guard-test edit keeps a slot under the cap of 3', async () => {
    const root = tmpRepo();
    fiveFixes(root);
    guarded(root);
    addNote(root, 'src/a.ts#f1', 'f1 offsets on purpose: callers subtract 1 later', { author: 'me' });
    commit(root, 'docs: note on f1');
    write(root, 'src/a.ts', ['f1', 'f2', 'f3', 'f4', 'f5'].map((n) => fn(n, 'return 0;')).join('\n'));
    write(root, 'test/load.test.ts', "describe('load (basics)', () => {\n  it('trims', () => {\n    expect(load(' a ')).toBe('a');\n  });\n});\n");
    const change = commit(root, 'feat: zero everything, drop the null test');
    const r = await questions(root, { sha: change });
    expect(r.questions.length).toBe(3);
    expect(r.questions[0]!.kind).toBe('past-fix');
    expect(r.questions.at(-1)!.kind).toBe('guard-test');
    expect(r.facts.notes.some((n) => n.symbol === 'src/a.ts#f1')).toBe(true);
  }, 30000);

  it('a note on an edited symbol is asked after the past fixes, citing the note file', async () => {
    const root = tmpRepo();
    write(root, 'src/c.ts', fn('k', 'return x;') + '\n' + fn('m', 'return x;'));
    commit(root, 'feat: k and m');
    const n = addNote(root, 'src/c.ts#k', 'k must stay pure: the cache keys on its result', { author: 'me' });
    commit(root, 'docs: note on k');
    write(root, 'src/c.ts', fn('k', 'return x + Date.now();') + '\n' + fn('m', 'return x;'));
    const change = commit(root, 'feat: k is time-dependent');
    const r = await questions(root, { sha: change });
    expect(r.questions.length).toBe(1);
    const q = r.questions[0]!;
    expect(q.kind).toBe('note');
    expect(q.cites.note).toBe(n.file);
    expect(q.source.file).toBe(n.file);
    expect(clickable(q)).toBe(true);
    expect(q.text).toContain('k must stay pure');
  }, 30000);
});

describe('done-when 5: works with no model configured', () => {
  it('--reword with no model is a no-op plus a notice; 0 model calls; same questions', async () => {
    const root = tmpRepo();
    fiveFixes(root);
    write(root, 'src/a.ts', ['f1', 'f2', 'f3', 'f4', 'f5'].map((n) => fn(n, 'return 0;')).join('\n'));
    const change = commit(root, 'feat: everything returns 0');
    const plain = await questions(root, { sha: change });
    const rw = await questions(root, { sha: change }, { reword: true });
    expect(rw.modelCalls).toBe(0);
    expect(rw.notices.some((n) => /no model/i.test(n))).toBe(true);
    expect(rw.questions).toEqual(plain.questions);
    const t = cli(change, '--root', root, '--reword');
    expect(t.status).toBe(0);
    expect(t.stdout + t.stderr).toMatch(/no model/i);
    expect(t.stdout).toContain('questions (3):');
  }, 30000);

  it('a model only rewords: kinds, order, cites and sources stay; a reply that drops the cited sha is discarded', async () => {
    const root = tmpRepo();
    fiveFixes(root);
    write(root, 'src/a.ts', ['f1', 'f2', 'f3', 'f4', 'f5'].map((n) => fn(n, 'return 0;')).join('\n'));
    const change = commit(root, 'feat: everything returns 0');
    const plain = await questions(root, { sha: change });
    let calls = 0;
    const rw = await questions(root, { sha: change }, { reword: true, model: async (t) => (calls++ === 0 ? 'something vague' : `Reworded: ${t}`) });
    expect(rw.modelCalls).toBe(calls);
    expect(rw.questions.map(({ text: _t, ...rest }) => rest)).toEqual(plain.questions.map(({ text: _t, ...rest }) => rest));
    expect(rw.questions[0]!.text).toBe(plain.questions[0]!.text);
    expect(rw.questions[1]!.text.startsWith('Reworded: ')).toBe(true);
  }, 30000);
});
