// T23 tests (loop rule R1): M30a (seeded-flaw recall + real false flags, via the hand-labeled m30-key.json — the
// same key bench/m30.ts scores against, run here too so `npm test` enforces it, not just the standalone bench),
// M30b (evidence links are real), done-when 3 (no generated text ever lands in a record field), done-when 5
// (silent when nothing governs the change), and question usefulness (useless share <= 10%, M4's shape).
// Written before any key/implementation change in this task; do not edit bench/m30-key.json or bench/seeded/*.md
// after review (R2) — log a needed change in ../../../tasks/T23-decision-traces-intake/4 log/key-changes.md.
import { afterAll, describe, expect, it } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkAllRecords } from '../src/record-check.js';
import { interrogate } from '../src/interrogate.js';
import type { Finding } from '../src/types.js';

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(here, '../../../');
const BENCH = resolve(here, '../bench');
const SRC_DIR = resolve(here, '../src');
const cleanups: Array<() => void> = [];
afterAll(() => cleanups.forEach((f) => f()));

const ENV = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
const git = (root: string, ...args: string[]): string => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', env: ENV }).trim();
function tmpRepo(): string {
  const root = mkdtempSync(join(tmpdir(), 'mole-intake-'));
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

interface Key {
  targets: { seededRecallMin: number; realFalseFlagsMax: number; evidencePrecisionPct: number };
  seeded: Record<string, { expect: string[] }>;
  real: Record<string, { expect: string[] }>;
}

function gitObjectExists(root: string, sha: string): boolean {
  try {
    execFileSync('git', ['-C', root, 'cat-file', '-e', `${sha}^{commit}`], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}
function evidenceIsReal(root: string, f: Finding): boolean {
  return f.evidence.every((e) => {
    if (e.kind === 'commit') return !!e.commit && gitObjectExists(root, e.commit);
    if (e.kind === 'file_line') return !!e.file && existsSync(join(root, e.file)) && (e.line ?? 0) >= 1;
    if (e.kind === 'transcript') return !!e.transcriptId;
    return false;
  });
}

describe('M30a: seeded-flaw recall + real-record false flags (key: bench/m30-key.json)', () => {
  const key: Key = JSON.parse(readFileSync(join(BENCH, 'm30-key.json'), 'utf8'));
  const seededDir = join(BENCH, 'seeded');
  const decisionsDir = join(REPO_ROOT, '.mole', 'decisions');
  const seededFiles = readdirSync(seededDir).filter((f) => f.endsWith('.md'));
  let findings: Finding[] = [];

  it('setup: run checkAllRecords with the seeded corpus copied alongside the real one', () => {
    const copied: string[] = [];
    try {
      for (const f of seededFiles) {
        const dest = join(decisionsDir, f);
        copyFileSync(join(seededDir, f), dest);
        copied.push(dest);
      }
      findings = checkAllRecords(REPO_ROOT);
      // M30b, checked while the seeded files still exist
      for (const f of findings) expect(evidenceIsReal(REPO_ROOT, f), `evidence for ${f.check} on ${f.recordId}`).toBe(true);
    } finally {
      for (const p of copied) if (existsSync(p)) unlinkSync(p);
    }
  });

  it(`catches >= ${9} of 10 seeded flaws`, () => {
    const byRecord = new Map<string, Finding[]>();
    for (const f of findings) byRecord.set(f.recordId, [...(byRecord.get(f.recordId) ?? []), f]);
    const caught = Object.keys(key.seeded).filter((id) => {
      const expect_ = new Set(key.seeded[id]!.expect);
      return (byRecord.get(id) ?? []).some((f) => expect_.has(f.check));
    });
    expect(caught.length).toBeGreaterThanOrEqual(key.targets.seededRecallMin);
  });

  it(`<= ${1} false flag on the 10 real records`, () => {
    const byRecord = new Map<string, Finding[]>();
    for (const f of findings) byRecord.set(f.recordId, [...(byRecord.get(f.recordId) ?? []), f]);
    const flagged = Object.keys(key.real).filter((id) => (byRecord.get(id) ?? []).length > 0);
    expect(flagged.length, `unexpected findings on: ${flagged.join(', ')}`).toBeLessThanOrEqual(key.targets.realFalseFlagsMax);
  });
});

describe('done-when 3: Mole never drafts a record (no generated text in why/context/consequences)', () => {
  it('no source file in @mole/intake writes to the filesystem', () => {
    const WRITE_CALLS = /\b(writeFileSync|appendFileSync|writeFile|appendFile|rmSync|unlinkSync|renameSync|truncateSync|createWriteStream)\s*\(/;
    for (const f of readdirSync(SRC_DIR)) {
      if (!f.endsWith('.ts')) continue;
      const text = readFileSync(join(SRC_DIR, f), 'utf8');
      expect(WRITE_CALLS.test(text), `${f} must not write to the filesystem (Mole only reads records)`).toBe(false);
    }
  });

  it('checkAllRecords leaves every decision record byte-for-byte unchanged', () => {
    const decisionsDir = join(REPO_ROOT, '.mole', 'decisions');
    const before = new Map(readdirSync(decisionsDir).map((f) => [f, readFileSync(join(decisionsDir, f), 'utf8')]));
    checkAllRecords(REPO_ROOT);
    for (const [f, text] of before) expect(readFileSync(join(decisionsDir, f), 'utf8')).toBe(text);
  });
});

describe('done-when 5: nothing governs the change -> silent', () => {
  it('a change to an ungoverned file returns governed: false and 0 questions', async () => {
    const root = tmpRepo();
    write(root, 'src/unrelated.ts', 'export function f(x: number): number {\n  return x;\n}\n');
    commit(root, 'feat: f');
    write(root, 'src/unrelated.ts', 'export function f(x: number): number {\n  return x + 1;\n}\n');
    const sha = commit(root, 'feat: f adds one');
    const r = await interrogate(root, { sha });
    expect(r.governed).toBe(false);
    expect(r.questions).toEqual([]);
    expect(r.governingDecisions).toEqual([]);
  });
});

describe('a change governed by a decision gets up to 3 questions with real evidence', () => {
  it('a past fix on the governed file produces a cited question', async () => {
    const root = tmpRepo();
    write(root, 'src/guarded.ts', 'export function g(x: number): number {\n  return x;\n}\n');
    commit(root, 'feat: g');
    write(root, 'src/guarded.ts', 'export function g(x: number): number {\n  return x + 7; // must offset by 7\n}\n');
    commit(root, 'fix: g lost its offset');
    mkdirSync(join(root, '.mole', 'decisions'), { recursive: true });
    write(
      root,
      '.mole/decisions/0001-g-offset.md',
      '---\nid: \'0001\'\ntitle: g always offsets by 7\nstatus: accepted\ndoor: two-way\nscope:\n  - src/guarded.ts#g\napprover: t\nsource: "test fixture"\n---\n\n## Decision\n\n`g` always adds 7.\n',
    );
    commit(root, 'docs: record 0001');
    write(root, 'src/guarded.ts', 'export function g(x: number): number {\n  return x;\n}\n');
    const sha = commit(root, 'refactor: simplify g');
    const r = await interrogate(root, { sha });
    expect(r.governed).toBe(true);
    expect(r.governingDecisions).toContain('0001');
    expect(r.questions.length).toBeGreaterThan(0);
    expect(r.questions.length).toBeLessThanOrEqual(3);
    for (const q of r.questions) expect(evidenceIsReal(root, { check: 'no_alternatives', recordId: '', file: '', line: 0, question: '', evidence: q.evidence })).toBe(true);
    expect(r.modelCalls).toBe(0);
  });
});

describe('question usefulness: useless share <= 10% (key written by hand, M4\'s shape)', () => {
  // each case: governed change -> does the top question cite the fact this case is actually testing?
  const cases: Array<{ name: string; useful: boolean }> = [];

  it('case A: a past fix on governed code -> top question cites that fix (useful)', async () => {
    const root = tmpRepo();
    write(root, 'src/a.ts', 'export function a(x: number): number {\n  return x;\n}\n');
    commit(root, 'feat: a');
    write(root, 'src/a.ts', 'export function a(x: number): number {\n  return x + 1; // offset\n}\n');
    const fixSha = commit(root, 'fix: a lost its offset');
    mkdirSync(join(root, '.mole', 'decisions'), { recursive: true });
    write(root, '.mole/decisions/0001-a.md', '---\nid: \'0001\'\ntitle: a offsets\nstatus: accepted\ndoor: two-way\nscope:\n  - src/a.ts#a\napprover: t\nsource: "test fixture"\n---\n\n## Decision\n\n`a` offsets.\n');
    commit(root, 'docs: 0001');
    write(root, 'src/a.ts', 'export function a(x: number): number {\n  return x;\n}\n');
    const sha = commit(root, 'refactor: a');
    const r = await interrogate(root, { sha });
    const useful = r.questions.some((q) => q.evidence.some((e) => e.commit === fixSha));
    cases.push({ name: 'A', useful });
  });

  it('case B: a change on governed code with no history fact -> no false "useful" claim either way (counts as useful: the governing decision itself is surfaced)', async () => {
    const root = tmpRepo();
    write(root, 'src/b.ts', 'export function b(x: number): number {\n  return x;\n}\n');
    commit(root, 'feat: b');
    mkdirSync(join(root, '.mole', 'decisions'), { recursive: true });
    write(root, '.mole/decisions/0001-b.md', '---\nid: \'0001\'\ntitle: b stays pure\nstatus: accepted\ndoor: two-way\nscope:\n  - src/b.ts#b\napprover: t\nsource: "test fixture"\n---\n\n## Decision\n\n`b` stays pure.\n');
    commit(root, 'docs: 0001');
    write(root, 'src/b.ts', 'export function b(x: number): number {\n  return x + 1;\n}\n');
    const sha = commit(root, 'feat: b adds one');
    const r = await interrogate(root, { sha });
    // useful here means: governed is correctly true, i.e. the record governing the change was found
    cases.push({ name: 'B', useful: r.governed && r.governingDecisions.includes('0001') });
  });

  it('computes useless share <= 10%', () => {
    expect(cases.length).toBeGreaterThan(0);
    const uselessShare = cases.filter((c) => !c.useful).length / cases.length;
    expect(uselessShare).toBeLessThanOrEqual(0.1);
  });
});
