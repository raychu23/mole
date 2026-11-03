// T59: double-loop learning — a lesson record becomes a DRAFT tenet revision on a mole-proposals branch. Tests first.
// Every test uses its own temp git repo; nothing touches a live .mole folder.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { proposeTenetRevision } from '../src/index.js';

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));
const tmp = (p: string) => { const d = mkdtempSync(join(tmpdir(), p)); dirs.push(d); return d; };
const git = (root: string, args: string[]) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
function write(root: string, file: string, text: string) {
  mkdirSync(dirname(join(root, file)), { recursive: true });
  writeFileSync(join(root, file), text);
}

const TENETS = ['# Tenets', '', '## tenet-1 · Prefer boring tech', '', 'Use what the team already runs.', '',
  '## tenet-2 · Ship small', '', 'Small diffs, often.', ''].join('\n');

function repo(lesson: Record<string, string | undefined> = {}): string {
  const root = tmp('mole-t59-');
  git(root, ['init', '-q', '-b', 'main']);
  git(root, ['config', 'user.name', 'T']);
  git(root, ['config', 'user.email', 't@example.com']);
  write(root, '.mole/tenets.md', TENETS);
  write(root, '.mole/decisions/d1.md', ['---', 'id: D1', 'title: Use Postgres', 'status: accepted', 'traces_to: [tenet-1]', '---', ''].join('\n'));
  write(root, '.mole/decisions/d2.md', ['---', 'id: D2', 'title: Weekly releases', 'status: accepted', 'traces_to: [tenet-2]', '---', ''].join('\n'));
  write(root, '.mole/incidents/inc-7.md', ['---', 'id: inc-7', 'title: Postgres could not keep up with vector search', '---', ''].join('\n'));
  const f = { id: 'L1', title: 'Boring tech is not always enough', learned_from: '[inc-7]', revises: 'tenet-1', owner: 'raymond', ...lesson };
  write(root, '.mole/lessons/l1.md', ['---', ...Object.entries(f).filter(([, v]) => v !== undefined).map(([k, v]) => `${k}: ${v}`), '---', '',
    '## Proposed tenet', '', 'Prefer boring tech, unless a measured need says otherwise', '',
    'Use what the team already runs; adopt something new only with a benchmark that shows the need.', ''].join('\n'));
  git(root, ['add', '.']);
  git(root, ['commit', '-qm', 'baseline']);
  return root;
}

describe('mole-proposals lesson (T59)', () => {
  it('drafts the tenet on a proposal branch, lists decisions to re-review, leaves the approved checkout untouched', () => {
    const root = repo();
    const head = git(root, ['rev-parse', 'HEAD']);
    const path = join(tmp('mole-t59-wt-'), 'draft');
    const r = proposeTenetRevision({ repo: root, lesson: 'L1', path });

    expect(r.proposal.branch).toBe('mole/proposal/lesson-l1');
    expect(r.proposal.baselineRevision).toBe(head);
    expect(r.tenet).toEqual({ id: 'tenet-1', before: 'Prefer boring tech', after: 'Prefer boring tech, unless a measured need says otherwise' });
    expect(r.reReview).toEqual([expect.objectContaining({ id: 'D1', kind: 'decision', file: '.mole/decisions/d1.md', line: 5 })]);

    // the draft: one commit on the proposal branch, only the target tenet section changed, naming lesson + incident
    const draft = readFileSync(join(path, '.mole/tenets.md'), 'utf8');
    expect(draft).toContain('## tenet-1 · Prefer boring tech, unless a measured need says otherwise');
    expect(draft).toContain('adopt something new only with a benchmark');
    expect(draft).toMatch(/Draft revision from lesson L1 \(learned from inc-7; owner raymond\)/);
    expect(draft).toContain('## tenet-2 · Ship small\n\nSmall diffs, often.');
    expect(git(path, ['log', '--format=%s', `${head}..HEAD`])).toBe('draft: lesson L1 revises tenet-1 (learned from inc-7)');
    expect(git(path, ['diff', '--name-only', head, 'HEAD'])).toBe('.mole/tenets.md');
    expect(r.commit).toBe(git(path, ['rev-parse', 'HEAD']));

    // approved checkout: same HEAD, clean, tenets unchanged
    expect(git(root, ['rev-parse', 'HEAD'])).toBe(head);
    expect(git(root, ['status', '--porcelain'])).toBe('');
    expect(readFileSync(join(root, '.mole/tenets.md'), 'utf8')).toBe(TENETS);
  });

  it.each([
    ['no owner', { owner: undefined }, /owner/],
    ['no learned_from incident', { learned_from: undefined }, /learned_from/],
    ['an unknown incident', { learned_from: '[inc-404]' }, /inc-404/],
    ['an unknown tenet', { revises: 'tenet-9' }, /tenet-9/],
  ])('refuses a lesson with %s, writing nothing', (_name, fields, msg) => {
    const root = repo(fields);
    const path = join(tmp('mole-t59-wt-'), 'draft');
    expect(() => proposeTenetRevision({ repo: root, lesson: 'L1', path })).toThrow(msg);
    expect(existsSync(path)).toBe(false);
    expect(git(root, ['branch', '--list', 'mole/proposal/*'])).toBe('');
  });

  // review 1 (deleg_6e3ca1c0) HIGH: .mole gitignored -> validation read the working tree, the branch was built from a
  // HEAD without .mole, the tenet write threw ENOENT after the branch + worktree existed
  it('refuses records that are not committed at the baseline (.mole gitignored), leaving no branch or worktree', () => {
    const root = repo();
    git(root, ['rm', '-rq', '--cached', '.mole']);
    write(root, '.gitignore', '.mole/\n');
    git(root, ['add', '.gitignore']);
    git(root, ['commit', '-qm', 'ignore .mole']);
    const path = join(tmp('mole-t59-wt-'), 'draft');
    expect(() => proposeTenetRevision({ repo: root, lesson: 'L1', path })).toThrow(/not committed/);
    expect(existsSync(path)).toBe(false);
    expect(git(root, ['branch', '--list', 'mole/proposal/*'])).toBe('');
    expect(git(root, ['worktree', 'list']).split('\n')).toHaveLength(1);
  });

  // review 2 (deleg_06b5fca1) HIGH: skip-worktree hid a disk edit from `git status`; validation read the disk
  // (tenet not retired) while the draft is pinned to HEAD (tenet retired). Validation now reads HEAD's own records.
  it('validates against the baseline commit, not the working tree (skip-worktree edit to a retired tenet)', () => {
    const root = repo();
    write(root, '.mole/tenets.md', TENETS.replace('## tenet-1 · Prefer boring tech', '## tenet-1 · Prefer boring tech (retired)'));
    git(root, ['commit', '-qam', 'retire tenet-1']);
    git(root, ['update-index', '--skip-worktree', '.mole/tenets.md']);
    write(root, '.mole/tenets.md', TENETS); // disk says not retired; git status stays clean
    expect(git(root, ['status', '--porcelain'])).toBe('');
    const path = join(tmp('mole-t59-wt-'), 'draft');
    expect(() => proposeTenetRevision({ repo: root, lesson: 'L1', path })).toThrow(/retired/);
    expect(existsSync(path)).toBe(false);
    expect(git(root, ['branch', '--list', 'mole/proposal/*'])).toBe('');
  });

  it('refuses an uncommitted lesson (the draft must come from the pinned baseline)', () => {
    const root = repo();
    write(root, '.mole/lessons/l1.md', readFileSync(join(root, '.mole/lessons/l1.md'), 'utf8').replace('owner: raymond', 'owner: someone'));
    expect(() => proposeTenetRevision({ repo: root, lesson: 'L1', path: join(tmp('mole-t59-wt-'), 'd') })).toThrow(/commit/i);
  });

  it('refuses a lesson with no Proposed tenet section, and an unknown lesson id', () => {
    const root = repo();
    write(root, '.mole/lessons/l2.md', ['---', 'id: L2', 'title: x', 'learned_from: [inc-7]', 'revises: tenet-2', 'owner: r', '---', '', 'no section', ''].join('\n'));
    git(root, ['add', '.']);
    git(root, ['commit', '-qm', 'l2']);
    expect(() => proposeTenetRevision({ repo: root, lesson: 'L2', path: join(tmp('w-'), 'a') })).toThrow(/Proposed tenet/);
    expect(() => proposeTenetRevision({ repo: root, lesson: 'L9', path: join(tmp('w-'), 'b') })).toThrow(/L9/);
  });
});
