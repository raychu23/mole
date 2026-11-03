// T70 red tests (written before packages/hotspots/src/*): a fixture repo where each of the four
// inputs is deliberately shaped (one file with high churn+fixes+complexity+decision volatility,
// one with none) so the top rank is predictable and each rank carries its own four inputs.
import { afterAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { computeHotspots, indentComplexity } from '../src/index.js';

const cleanups: Array<() => void> = [];
afterAll(() => cleanups.forEach((f) => f()));

const ENV = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
const git = (root: string, ...args: string[]): string => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', env: ENV }).trim();

function tmpRepo(): string {
  const root = mkdtempSync(join(tmpdir(), 'mole-hotspots-'));
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

const HOT_V1 = ['function run(x) {', '  if (x) {', '    while (x > 0) {', '      x -= 1;', '    }', '  }', '  return x;', '}', ''].join('\n');
const HOT_V2 = HOT_V1.replace('x -= 1;', 'x -= 1; // off-by-one fixed here');
const COLD = ['export const flat = 1;', ''].join('\n');

/**
 * repo with two files:
 *  - hot.ts: 3 commits (1 base + 2 fixes matching the fix rule), deeply indented -> high churn,
 *    high complexity, high incident density; a decision in .mole/decisions scopes it, overridden
 *    by a second decision -> decision volatility 2 (1 decision touching it + 1 overrides edge... in
 *    this fixture both decisions touch it, so volatility = 2 decisions + 1 overrides edge = 3)
 *  - cold.ts: 1 commit, flat, no decision, no fix -> every input at or near its minimum
 */
function fixtureRepo(): { root: string } {
  const root = tmpRepo();
  write(root, 'hot.ts', HOT_V1);
  write(root, 'cold.ts', COLD);
  commit(root, 'feat: initial');
  write(root, 'hot.ts', HOT_V2);
  commit(root, 'fix: off by one in run()');
  write(root, 'hot.ts', HOT_V2.replace('x -= 1', 'x = x - 1'));
  commit(root, 'fix: regression in run() decrement');
  mkdirSync(join(root, '.mole', 'decisions'), { recursive: true });
  write(
    root,
    '.mole/decisions/0001-run-loop.md',
    "---\nid: '0001'\ntitle: run() loops down to zero\nstatus: accepted\ndoor: two-way\nscope:\n  - hot.ts\noverridden_by: ['0002']\napprover: t\n---\n\n## Decision\n\nrun() counts down.\n",
  );
  write(
    root,
    '.mole/decisions/0002-run-loop-v2.md',
    "---\nid: '0002'\ntitle: run() loops down to zero, revised\nstatus: accepted\ndoor: two-way\nscope:\n  - hot.ts\noverrides: ['0001']\napprover: t\n---\n\n## Decision\n\nrun() still counts down, revised wording.\n",
  );
  commit(root, 'docs: record the run() decision and its revision');
  return { root };
}

describe('indentComplexity (T70: Tornhill indentation-based complexity)', () => {
  it('sums logical-indent depth over non-blank lines, ignoring blank lines', async () => {
    const root = tmpRepo();
    write(root, 'a.ts', HOT_V1);
    commit(root, 'feat: a');
    const c = await indentComplexity(root, 'a.ts', 2);
    // lines (2-space indent unit): 0,1,2,3,2,1,1,0 (blank line ignored) -> sum = 10
    expect(c).toBe(10);
  });

  it('flat code has near-zero complexity', async () => {
    const root = tmpRepo();
    write(root, 'b.ts', COLD);
    commit(root, 'feat: b');
    expect(await indentComplexity(root, 'b.ts', 2)).toBe(0);
  });
});

describe('computeHotspots (T70 done-when: ranking, each rank explained by its four inputs)', () => {
  it('ranks the file with high churn+complexity+volatility+incidents above a flat untouched-by-decisions file', async () => {
    const { root } = fixtureRepo();
    const r = await computeHotspots(root, { top: 10 });
    expect(r.ranked.length).toBeGreaterThan(0);
    expect(r.ranked[0]!.file).toBe('hot.ts');
    expect(r.ranked[0]!.score).toBeGreaterThan(0);
    // cold.ts has no decision and no fix commit -> its product is 0, so it is either absent or last with score 0
    const cold = r.ranked.find((h) => h.file === 'cold.ts');
    if (cold) expect(cold.score).toBe(0);
  });

  it('every rank carries its own four raw inputs and their normalized [0,1] scores (never a bare score)', async () => {
    const { root } = fixtureRepo();
    const r = await computeHotspots(root, { top: 10 });
    const hot = r.ranked.find((h) => h.file === 'hot.ts')!;
    expect(hot.churn).toBe(3); // 3 commits touched hot.ts
    expect(hot.incidents).toBe(2); // 2 of those 3 subjects match the default fix rule ("fix: ...")
    expect(hot.complexity).toBeGreaterThan(0);
    expect(hot.volatility).toBe(3); // 2 decisions scope hot.ts + 1 overrides edge between them
    for (const k of ['churn', 'complexity', 'volatility', 'incidents'] as const) {
      expect(hot.normalized[k]).toBeGreaterThanOrEqual(0);
      expect(hot.normalized[k]).toBeLessThanOrEqual(1);
    }
    expect(hot.score).toBeCloseTo(hot.normalized.churn * hot.normalized.complexity * hot.normalized.volatility * hot.normalized.incidents, 10);
  });

  it('respects --top / top option', async () => {
    const { root } = fixtureRepo();
    const r = await computeHotspots(root, { top: 1 });
    expect(r.ranked.length).toBe(1);
  });

  it('a repo with no fix commits and no decisions ranks nothing (STOP: no ranking without all four inputs)', async () => {
    const root = tmpRepo();
    write(root, 'only.ts', HOT_V1);
    commit(root, 'feat: only file, never fixed, no decision');
    const r = await computeHotspots(root, { top: 10 });
    expect(r.ranked.every((h) => h.score === 0)).toBe(true);
  });
});
