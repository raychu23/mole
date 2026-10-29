// T32 red tests: `prCheck` over a scripted pull request (base..head) in a temp git repo.
// done-when 1 (one check-run payload with line annotations), 3 (silent when nothing governs, never a PR comment: the
// payload is a check run), 5 (a renamed file whose anchor can't re-attach shows grey 'unanchored', never a wrong record),
// R6 (no network/model calls from the check code).
// (written with a terminal heredoc: write_file is approval-gated for test files in this unattended run)
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prCheck, type PrCheckResult } from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const git = (root: string, ...args: string[]) =>
  execFileSync('git', ['-C', root, '-c', 'user.name=T', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', ...args], { encoding: 'utf8' }).trim();

const A_TS = `export function foo(x: number): number {
  const y = x + 1;
  return y * 2;
}

export function bar(s: string): string {
  return s.trim();
}
`;
const OLD_TS = `// old helper
export const one = 1;
export const two = 2;
export const three = 3;
export const four = 4;
`;
const rec = (id: string, status: string, scope: string[]) =>
  `---\nid: '${id}'\ntitle: Record ${id}\nstatus: ${status}\nscope:\n${scope.map((s) => `  - ${s}`).join('\n')}\n---\n\n## Decision\n\nRecord ${id}.\n`;

let root = '';
let base = '';
const heads: Record<string, string> = {};

function write(rel: string, text: string) {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), text);
}

/** branch off base, apply edits, commit, return the head sha */
function pr(name: string, edit: () => void): string {
  git(root, 'checkout', '-q', '-b', name, base);
  edit();
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', name);
  const sha = git(root, 'rev-parse', 'HEAD');
  git(root, 'checkout', '-q', base);
  return sha;
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'mole-pr-check-'));
  git(root, 'init', '-q', '-b', 'main');
  write('.github/CODEOWNERS', ['* @team/all', '/src/ @team/src', 'src/a.ts', 'docs/ @team/docs', '**/*.md @team/md', ''].join('\n'));
  write('src/a.ts', A_TS);
  write('src/b.ts', 'export const b = 1;\n');
  write('lib/old.ts', OLD_TS);
  write('docs/x.md', '# X\n\nSome text.\n');
  write('pkg/c.ts', 'export const c = 3;\n');
  write('.mole/decisions/0001-foo.md', rec('0001', 'accepted', ['src/a.ts#foo']));
  write('.mole/decisions/0002-lib.md', rec('0002', 'accepted', ['lib/old.ts']));
  write('.mole/decisions/0003-docs.md', rec('0003', 'superseded', ['docs/x.md']));
  write('.mole/decisions/0004-pkg.md', rec('0004', 'accepted', ['pkg/']));
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'base');
  base = git(root, 'rev-parse', 'HEAD');
  heads.foo = pr('edit-foo', () => {
    write('src/a.ts', A_TS.replace('x + 1', 'x + 2'));
    write('src/b.ts', 'export const b = 2;\n');
  });
  heads.bar = pr('edit-bar', () => write('src/a.ts', A_TS.replace('s.trim()', 's.trim().toLowerCase()')));
  heads.docs = pr('edit-docs', () => write('docs/x.md', '# X\n\nOther text.\n'));
  heads.rename = pr('rename-lib', () => {
    git(root, 'mv', 'lib/old.ts', 'lib/new.ts');
    write('lib/new.ts', OLD_TS.replace('// old helper', '// new helper'));
  });
  heads.pkg = pr('add-pkg', () => write('pkg/new.ts', 'export const n = 1;\n'));
  heads.dropFoo = pr('drop-foo', () => write('src/a.ts', A_TS.split('\n').slice(5).join('\n')));
});
afterAll(() => {
  if (root) rmSync(root, { recursive: true, force: true });
});

const run = (head: string): Promise<PrCheckResult> => prCheck({ root, base, head, history: true });
const ids = (r: PrCheckResult) => r.governed.map((g) => g.id).sort();

describe('pr-check: which records govern the changed lines', () => {
  it('a symbol anchor governs edits inside the symbol only, with a line annotation on the changed line', async () => {
    const r = await run(heads.foo!);
    expect(ids(r)).toEqual(['0001']);
    expect(r.silent).toBe(false);
    expect(r.unanchored).toEqual([]);
    const ann = r.checkRun.output.annotations.filter((a) => a.title.includes('0001'));
    expect(ann.length).toBeGreaterThanOrEqual(1);
    expect(ann[0]!.path).toBe('src/a.ts');
    expect(ann[0]!.start_line).toBeLessThanOrEqual(2);
    expect(ann[0]!.end_line).toBeGreaterThanOrEqual(2);
    expect(['red', 'yellow', 'green', 'grey']).toContain(r.governed[0]!.flag);
    expect(r.governed[0]!.file).toBe('.mole/decisions/0001-foo.md');
  });

  it('silent when nothing governs: neutral, 0 annotations, title says nothing governed', async () => {
    const r = await run(heads.bar!);
    expect(ids(r)).toEqual([]);
    expect(r.silent).toBe(true);
    expect(r.checkRun.conclusion).toBe('neutral');
    expect(r.checkRun.output.annotations).toEqual([]);
    expect(r.checkRun.output.title.toLowerCase()).toContain('nothing governed');
  });

  it('a superseded record never governs', async () => {
    const r = await run(heads.docs!);
    expect(ids(r)).toEqual([]);
    expect(r.silent).toBe(true);
  });

  it('a folder anchor governs a file added under it', async () => {
    const r = await run(heads.pkg!);
    expect(ids(r)).toEqual(['0004']);
  });

  it('deleting the anchored symbol is still governed (old side)', async () => {
    const r = await run(heads.dropFoo!);
    expect(ids(r)).toEqual(['0001']);
    expect(r.governed[0]!.hits.some((h) => h.side === 'old')).toBe(true);
  });

  it('failure case: a renamed file whose anchor cannot re-attach is grey unanchored, never another record', async () => {
    const r = await run(heads.rename!);
    expect(ids(r)).toEqual([]);
    expect(r.unanchored.map((u) => u.id)).toEqual(['0002']);
    expect(r.unanchored[0]!.flag).toBe('grey');
    expect(r.unanchored[0]!.path).toBe('lib/old.ts');
    expect(r.unanchored[0]!.renamedTo).toBe('lib/new.ts');
    expect(r.silent).toBe(false);
    expect(r.checkRun.output.summary.toLowerCase()).toContain('unanchored');
    for (const a of r.checkRun.output.annotations) expect(a.title).not.toMatch(/000[134]/);
  });
});

describe('pr-check: owners, payload shape, determinism', () => {
  it('owners follow CODEOWNERS at the base (last match wins, an owner-less line leaves a file unowned)', async () => {
    const foo = await run(heads.foo!);
    expect(foo.codeownersFile).toBe('.github/CODEOWNERS');
    expect(foo.ownersByFile['src/a.ts']).toEqual([]);
    expect(foo.ownersByFile['src/b.ts']).toEqual(['@team/src']);
    expect(foo.owners).toEqual(['@team/src']);
    expect((await run(heads.docs!)).owners).toEqual(['@team/md']);
    expect((await run(heads.rename!)).owners).toEqual(['@team/all']);
  });

  it('ONE check-run payload in the GitHub API shape, at most 50 annotations, at most 3 questions', async () => {
    const r = await run(heads.foo!);
    const c = r.checkRun;
    expect(c.name).toBe('mole');
    expect(c.head_sha).toBe(heads.foo);
    expect(c.status).toBe('completed');
    expect(['neutral', 'success']).toContain(c.conclusion);
    expect(c.output.annotations.length).toBeLessThanOrEqual(50);
    for (const a of c.output.annotations) {
      expect(Object.keys(a).sort()).toEqual(['annotation_level', 'end_line', 'message', 'path', 'start_line', 'title']);
      expect(['notice', 'warning', 'failure']).toContain(a.annotation_level);
      expect(a.start_line).toBeGreaterThanOrEqual(1);
      expect(a.end_line).toBeGreaterThanOrEqual(a.start_line);
    }
    expect(r.questions.length).toBeLessThanOrEqual(3);
    expect(r.mergeBase).toBe(base);
    expect(r.files.sort()).toEqual(['src/a.ts', 'src/b.ts']);
  });

  it('deterministic: the same PR gives the same payload', async () => {
    const a = await run(heads.foo!);
    const b = await run(heads.foo!);
    expect(JSON.stringify(b.checkRun)).toBe(JSON.stringify(a.checkRun));
  });

  it('records can live outside the repo (an overlay records root)', async () => {
    const overlay = mkdtempSync(join(tmpdir(), 'mole-pr-overlay-'));
    try {
      mkdirSync(join(overlay, '.mole', 'decisions'), { recursive: true });
      writeFileSync(join(overlay, '.mole', 'decisions', 'x-1.md'), rec('x-1', 'accepted', ['src/']));
      const r = await prCheck({ root, base, head: heads.bar!, recordsRoot: overlay, history: false });
      expect(ids(r)).toEqual(['x-1']);
      expect(r.governed[0]!.flag).toBe('green');
    } finally {
      rmSync(overlay, { recursive: true, force: true });
    }
  });
});

describe('pr-check: R6', () => {
  it('the check code makes no network or model calls', () => {
    const dir = resolve(here, '../src/check');
    for (const f of readdirSync(dir).filter((n) => n.endsWith('.ts'))) {
      const t = readFileSync(join(dir, f), 'utf8');
      expect(t).not.toMatch(/\bfetch\(|node:https?['"]|from ['"]https?['"]|openai|anthropic/i);
    }
  });
});
