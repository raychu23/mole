// T14 review round 1 regression tests (tasks/T14-l3-questions/4 log/review-1.md): P1-1 guard-test rule too wide +
// ranking, P2-1 snapshots named as tests, P2-4 questions on non-code lines, P2-2 the "why" clip. Each failed on
// 54647b0 and passes after the round-2 fix. Created with a terminal heredoc (test-write gate, see 2 insights.md).
import { afterAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { questions } from '../src/index.js';

const cleanups: Array<() => void> = [];
afterAll(() => cleanups.forEach((f) => f()));
const ENV = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
const git = (root: string, ...args: string[]): string => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', env: ENV }).trim();
function tmpRepo(): string {
  const root = mkdtempSync(join(tmpdir(), 'mole-qfix-'));
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
const editorTest = (trims: string, extra = '') =>
  `describe('Editor', () => {\n  it('trims', () => {\n    expect(trim(' a ')).toBe('${trims}');\n  });\n${extra}});\n`;
const nullIt = (v: string) => `  it('null is empty', () => {\n    expect(trim(null)).toBe('${v}');\n  });\n`;

describe('P1-1: a guard-test question needs a test the fix wrote, not a file-wide describe it sat in', () => {
  it('editing an it() the fix never touched, inside a describe the fix added a test to, asks nothing', async () => {
    const root = tmpRepo();
    write(root, 'src/e.ts', fn('trim', 'return x;'));
    write(root, 'test/e.test.ts', editorTest('a'));
    commit(root, 'feat: editor');
    write(root, 'src/e.ts', fn('trim', 'return x ?? 0;'));
    write(root, 'test/e.test.ts', editorTest('a', nullIt('')));
    commit(root, 'fix: null crash');
    write(root, 'test/e.test.ts', editorTest('b', nullIt('')));
    const change = commit(root, 'test: tweak trims');
    const r = await questions(root, { sha: change });
    expect(r.facts.guards).toEqual([]);
    expect(r.questions.filter((q) => q.kind === 'guard-test')).toEqual([]);
  }, 30000);

  it('editing lines inside an it() whose title line the fix added still asks (lines later rewritten by a non-fix)', async () => {
    const root = tmpRepo();
    write(root, 'src/e.ts', fn('trim', 'return x;'));
    write(root, 'test/e.test.ts', editorTest('a'));
    commit(root, 'feat: editor');
    write(root, 'src/e.ts', fn('trim', 'return x ?? 0;'));
    write(root, 'test/e.test.ts', editorTest('a', nullIt('')));
    const fix = commit(root, 'fix: null crash');
    write(root, 'test/e.test.ts', editorTest('a', nullIt('0')));
    commit(root, 'test: tidy');
    write(root, 'test/e.test.ts', editorTest('a', nullIt('1')));
    const change = commit(root, 'test: loosen');
    const r = await questions(root, { sha: change });
    const g = r.questions.filter((q) => q.kind === 'guard-test');
    expect(g.length).toBe(1);
    expect(g[0]!.cites.sha).toBe(fix);
    expect(g[0]!.text).toContain('null is empty');
    expect(g[0]!.text).not.toContain('"Editor"');
  }, 30000);

  it('a guard on a fix already asked about is merged into that past-fix question; it never evicts a past fix', async () => {
    const root = tmpRepo();
    const names = ['f1', 'f2', 'f3'];
    const bodies = names.map(() => 'return x;');
    const src = () => names.map((m, j) => fn(m, bodies[j]!)).join('\n');
    write(root, 'src/a.ts', src());
    write(root, 'test/a.test.ts', "describe('a', () => {\n  it('base', () => {});\n});\n");
    commit(root, 'feat: three functions');
    const fixes: string[] = [];
    names.forEach((n, i) => {
      bodies[i] = `return x + ${i + 1};`;
      write(root, 'src/a.ts', src());
      if (i === 0) write(root, 'test/a.test.ts', "describe('a', () => {\n  it('base', () => {});\n  it('f1 offset', () => {\n    expect(f1(1)).toBe(2);\n  });\n});\n");
      fixes.push(commit(root, `fix: ${n} lost its offset`));
    });
    names.forEach((_, i) => (bodies[i] = 'return 0;'));
    write(root, 'src/a.ts', src());
    write(root, 'test/a.test.ts', "describe('a', () => {\n  it('base', () => {});\n  it('f1 offset', () => {\n    expect(f1(1)).toBe(0);\n  });\n});\n");
    const change = commit(root, 'feat: zero, and the f1 test follows');
    const r = await questions(root, { sha: change });
    expect(r.questions.map((q) => q.kind)).toEqual(['past-fix', 'past-fix', 'past-fix']);
    expect(new Set(r.questions.map((q) => q.cites.sha))).toEqual(new Set(fixes));
    const f1 = r.questions.find((q) => q.cites.sha === fixes[0])!;
    expect(f1.text).toContain('test/a.test.ts');
    expect(f1.text).toContain('f1 offset');
    expect(r.facts.guards.some((g) => g.fix.sha === fixes[0])).toBe(true);
  }, 30000);
});

describe('P2-1: snapshots are never named as guarding tests', () => {
  it('a fix that only added a .snap has "no test"; editing the .snap lines it wrote asks no guard question', async () => {
    const root = tmpRepo();
    write(root, 'src/s.ts', fn('s', 'return x;'));
    commit(root, 'feat: s');
    write(root, 'src/s.ts', fn('s', 'return x * 2;'));
    write(root, 'test/__snapshots__/s.test.ts.snap', 'exports[`s 1`] = `2`;\n');
    const fix = commit(root, 'fix: s must double');
    write(root, 'src/s.ts', fn('s', 'return x * 3;'));
    write(root, 'test/__snapshots__/s.test.ts.snap', 'exports[`s 1`] = `3`;\n');
    const change = commit(root, 'feat: s triples');
    const r = await questions(root, { sha: change });
    expect(r.questions.length).toBe(1);
    expect(r.questions[0]!.kind).toBe('past-fix');
    expect(r.questions[0]!.cites.sha).toBe(fix);
    expect(r.questions[0]!.text).not.toContain('.snap');
    expect(r.facts.guards).toEqual([]);
  }, 30000);
});

describe('P2-4: no questions on non-code lines (the past fixes stay in the facts)', () => {
  it('editing a CHANGELOG.md line a fix wrote asks nothing, but T12 still reports the past fix', async () => {
    const root = tmpRepo();
    write(root, 'src/c.ts', fn('c', 'return x;'));
    write(root, 'CHANGELOG.md', '# Changelog\n\n- first\n');
    commit(root, 'feat: c');
    write(root, 'src/c.ts', fn('c', 'return x + 1;'));
    write(root, 'CHANGELOG.md', '# Changelog\n\n- fixed c\n');
    commit(root, 'fix: c off by one');
    write(root, 'CHANGELOG.md', '# Changelog\n\n- fixed c (see #1)\n');
    const change = commit(root, 'docs: changelog');
    const r = await questions(root, { sha: change });
    expect(r.facts.hunks.some((h) => h.pastFixes.length > 0)).toBe(true);
    expect(r.questions).toEqual([]);
  }, 30000);
});

describe('P2-2: the "why" is the fix\'s own reason, not a nearby comment or a squash list', () => {
  it('a bullet-list body and a comment far from the blamed lines give no "why"', async () => {
    const root = tmpRepo();
    const filler = Array.from({ length: 30 }, (_, i) => `export const k${i} = ${i};`);
    write(root, 'src/w.ts', [fn('w', 'return x;'), ...filler].join('\n') + '\n');
    commit(root, 'feat: w');
    const far = [...filler];
    far[25] = `// helper constants for the table layout\n${far[25]}`;
    write(root, 'src/w.ts', [fn('w', 'return x - 1;'), ...far].join('\n') + '\n');
    commit(root, 'fix: w off by one\n\n* fix: w off by one\n* fix: schedule things in the owner window\n* chore: bump');
    write(root, 'src/w.ts', [fn('w', 'return x - 2;'), ...far].join('\n') + '\n');
    const change = commit(root, 'feat: w by two');
    const r = await questions(root, { sha: change });
    expect(r.questions.length).toBe(1);
    expect(r.questions[0]!.text).not.toContain('helper constants');
    expect(r.questions[0]!.text).not.toMatch(/why: \*/);
  }, 30000);

  it('the first body sentence is used and a long one is clipped on a word boundary', async () => {
    const root = tmpRepo();
    write(root, 'src/l.ts', fn('l', 'return x;'));
    commit(root, 'feat: l');
    write(root, 'src/l.ts', fn('l', 'return x || 0;'));
    const sentence =
      'The loader read a null config value and passed it straight into trim which crashed every single start for users whose configuration file had an empty key somewhere deep inside it.';
    commit(root, `fix: loader crashed on null\n\n${sentence} Second sentence here.`);
    write(root, 'src/l.ts', fn('l', 'return x || 1;'));
    const change = commit(root, 'feat: default 1');
    const r = await questions(root, { sha: change });
    const m = /\(why: ([^)]*)\)/.exec(r.questions[0]!.text);
    expect(m).not.toBeNull();
    expect(m![1]!.startsWith('The loader read a null config value')).toBe(true);
    expect(m![1]).not.toContain('Second sentence');
    const words = new Set(sentence.replace(/[.,]/g, '').split(' '));
    const shown = m![1]!.replace(/…$/, '').replace(/[.,]$/, '').split(' ');
    expect(words.has(shown.at(-1)!)).toBe(true);
  }, 30000);
});

describe('P1-1 (blame form): fix-written lines outside every describe/it are not a guarding test', () => {
  it('editing an import line a fix last wrote in a test file asks no guard question', async () => {
    const root = tmpRepo();
    const t = (imp: string) => `${imp}\n\ndescribe('a', () => {\n  it('works', () => {\n    expect(a(1)).toBe(1);\n  });\n});\n`;
    write(root, 'src/a.ts', fn('a', 'return x;'));
    write(root, 'test/i.test.ts', t("import { a } from '../src/a';"));
    commit(root, 'feat: a');
    write(root, 'src/a.ts', fn('a', 'return x;') + fn('b', 'return x;'));
    write(root, 'test/i.test.ts', t("import { a, b } from '../src/a';"));
    commit(root, 'fix: export b');
    write(root, 'test/i.test.ts', t("import { a, b } from '../src/a.js';"));
    const change = commit(root, 'chore: esm import paths');
    const r = await questions(root, { sha: change });
    expect(r.facts.guards).toEqual([]);
    expect(r.questions).toEqual([]);
  }, 30000);
});
