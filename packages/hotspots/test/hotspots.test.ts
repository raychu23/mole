// T70 tests (red before review-1 fixes, see tasks/T70-investment-map/4 log/red.txt): a fixture
// repo where each signal is deliberately shaped so the top rank is predictable and each rank
// carries its own raw inputs, plus review-1's four findings:
//  HIGH 1: score = churn x complexity only (no any-zero->0 gate); volatility/incidents are
//          explanatory columns and `--by hotspot|volatility|fixes` sort keys, never a gate.
//  HIGH 2: non-source files (lockfiles, *.json/*.md/*.yaml, generated dirs, binaries) are excluded
//          by default; `all: true` lifts the extension filter only.
//  MED 3:  renames are merged (churn not split across old/new name).
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
function writeBinary(root: string, file: string, bytes: Buffer): void {
  mkdirSync(dirname(join(root, file)), { recursive: true });
  writeFileSync(join(root, file), bytes);
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
 *    by a second decision -> decision volatility 3 (2 decisions touching it + 1 overrides edge)
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

describe('computeHotspots (T70 done-when: ranking, each rank explained by its raw inputs)', () => {
  it('ranks the file with high churn+complexity above a flat file (review-1 HIGH 1: no any-zero gate)', async () => {
    const { root } = fixtureRepo();
    const r = await computeHotspots(root, { top: 10 });
    expect(r.ranked.length).toBeGreaterThan(0);
    expect(r.ranked[0]!.file).toBe('hot.ts');
    expect(r.ranked[0]!.score).toBeGreaterThan(0);
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
    // review-1 HIGH 1: score is churn x complexity only -- volatility/incidents never gate it
    expect(hot.score).toBeCloseTo(hot.normalized.churn * hot.normalized.complexity, 10);
  });

  it('respects --top / top option', async () => {
    const { root } = fixtureRepo();
    const r = await computeHotspots(root, { top: 1 });
    expect(r.ranked.length).toBe(1);
  });

  it('review-1 HIGH 1: a repo with no decisions and no fix commits still ranks by churn x complexity', async () => {
    const root = tmpRepo();
    write(root, 'hot.ts', HOT_V1);
    commit(root, 'feat: hot, never fixed, no decision');
    write(root, 'hot.ts', HOT_V1 + '  // tweak\n');
    commit(root, 'feat: another touch, still never fixed');
    write(root, 'cold.ts', COLD);
    commit(root, 'feat: cold, one commit only');
    const r = await computeHotspots(root, { top: 10 });
    expect(r.ranked.length).toBe(2);
    // hot.ts has 2 commits + nonzero complexity, cold.ts 1 commit + zero complexity -> hot.ts ranks
    // first purely on churn x complexity, with volatility=0 and incidents=0 for BOTH (not a gate)
    expect(r.ranked[0]!.file).toBe('hot.ts');
    expect(r.ranked[0]!.score).toBeGreaterThan(0);
    expect(r.ranked[0]!.volatility).toBe(0);
    expect(r.ranked[0]!.incidents).toBe(0);
  });

  it('review-1 HIGH 1: --by volatility / --by fixes resort without changing the raw inputs', async () => {
    const { root } = fixtureRepo();
    const byHotspot = await computeHotspots(root, { top: 10, by: 'hotspot' });
    const byVolatility = await computeHotspots(root, { top: 10, by: 'volatility' });
    const byFixes = await computeHotspots(root, { top: 10, by: 'fixes' });
    expect(byHotspot.ranked[0]!.file).toBe('hot.ts');
    expect(byVolatility.ranked[0]!.file).toBe('hot.ts'); // only file with any decision volatility
    expect(byFixes.ranked[0]!.file).toBe('hot.ts'); // only file with any fix commit
  });

  it('review-1 HIGH 2: lockfiles are excluded from the default (source-only) ranking', async () => {
    const root = tmpRepo();
    write(root, 'package-lock.json', JSON.stringify({ a: 1, deps: Array.from({ length: 50 }, (_, i) => i) }, null, 2));
    write(root, 'src.ts', HOT_V1);
    commit(root, 'feat: lockfile + source');
    write(root, 'package-lock.json', JSON.stringify({ a: 2, deps: Array.from({ length: 60 }, (_, i) => i) }, null, 2));
    commit(root, 'chore: bump lockfile');
    const r = await computeHotspots(root, { top: 10 });
    expect(r.ranked.some((h) => h.file === 'package-lock.json')).toBe(false);
    expect(r.ranked.some((h) => h.file === 'src.ts')).toBe(true);
  });

  it('review-1 HIGH 2: *.json/*.md/*.yaml and generated dirs are excluded unless --all', async () => {
    const root = tmpRepo();
    write(root, 'notes.md', '# notes\n\nlots of words here to churn\n');
    write(root, 'config.json', '{"a":1}\n');
    write(root, 'dist/bundle.js', 'console.log(1);\n');
    write(root, 'src.ts', HOT_V1);
    commit(root, 'feat: mixed files');
    const r = await computeHotspots(root, { top: 10 });
    expect(r.ranked.map((h) => h.file)).toEqual(['src.ts']);
    const all = await computeHotspots(root, { top: 10, all: true });
    expect(all.ranked.some((h) => h.file === 'notes.md')).toBe(true);
    expect(all.ranked.some((h) => h.file === 'config.json')).toBe(true);
    // generated dirs stay excluded even with --all (never source to pay down)
    expect(all.ranked.some((h) => h.file === 'dist/bundle.js')).toBe(false);
  });

  it('review-1 HIGH 2: binary files are skipped (never ranked, never crash complexity)', async () => {
    const root = tmpRepo();
    writeBinary(root, 'logo.png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01, 0x02, 0x03, 0x00, 0x00]));
    write(root, 'src.ts', HOT_V1);
    commit(root, 'feat: binary + source');
    writeBinary(root, 'logo.png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x09, 0x08, 0x07, 0x00, 0x00]));
    commit(root, 'chore: update binary');
    const r = await computeHotspots(root, { top: 10, all: true }); // even with --all, binary is skipped
    expect(r.ranked.some((h) => h.file === 'logo.png')).toBe(false);
    expect(r.ranked.some((h) => h.file === 'src.ts')).toBe(true);
  });

  it('review-1 MED 3: a rename merges churn/incidents under the current name, not split across old/new', async () => {
    const root = tmpRepo();
    write(root, 'old-name.ts', HOT_V1);
    commit(root, 'feat: add old-name.ts');
    write(root, 'old-name.ts', HOT_V2);
    commit(root, 'fix: off by one before rename');
    git(root, 'mv', 'old-name.ts', 'new-name.ts');
    commit(root, 'refactor: rename old-name.ts to new-name.ts');
    write(root, 'new-name.ts', HOT_V2.replace('x -= 1', 'x = x - 1'));
    commit(root, 'fix: regression after rename');
    const r = await computeHotspots(root, { top: 10 });
    expect(r.ranked.some((h) => h.file === 'old-name.ts')).toBe(false);
    const merged = r.ranked.find((h) => h.file === 'new-name.ts')!;
    expect(merged).toBeDefined();
    expect(merged.churn).toBe(4); // all 4 commits (2 pre-rename + rename + 1 post-rename) merged
    expect(merged.incidents).toBe(2); // both fix commits merged under the current name
  });

  it('review-1 MED 3: timed on this fixture -- must stay well under the 10s budget', async () => {
    const { root } = fixtureRepo();
    const r = await computeHotspots(root, { top: 10 });
    expect(r.ms).toBeLessThan(10_000);
  });
});
