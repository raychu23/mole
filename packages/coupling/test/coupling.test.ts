// T77 tests (red before implementation, see tasks/T77-co-change-view/4 log/red.txt): a fixture repo
// with a CODEOWNERS file, shaped so:
//  - a.ts/b.ts co-change in every commit, owned by DIFFERENT teams (@team-a / @team-b) -- the
//    cross-team pair that must sort first and carry full evidence (shared commits + sample shas +
//    both owners + the decision scoping both).
//  - c.ts/d.ts co-change too, but owned by the SAME team (@team-a) -- same-team pair, sorts after.
//  - e.ts changes alongside a.ts only once (below min-shared-revs) -- must never appear as a pair.
import { afterAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { computeCoupling, formatCoupling } from '../src/index.js';

const cleanups: Array<() => void> = [];
afterAll(() => cleanups.forEach((f) => f()));

const ENV = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
const git = (root: string, ...args: string[]): string => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', env: ENV }).trim();

function tmpRepo(): string {
  const root = mkdtempSync(join(tmpdir(), 'mole-coupling-'));
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

/** 8 commits touching a.ts+b.ts together (cross-team, owned @team-a / @team-b), 6 commits touching
 * c.ts+d.ts together (same-team, both @team-a), 1 commit touching a.ts+e.ts (below min-shared-revs),
 * plus a CODEOWNERS file and a decision scoping both a.ts and b.ts. */
function fixtureRepo(): { root: string } {
  const root = tmpRepo();
  write(root, 'CODEOWNERS', ['a.ts  @team-a', 'b.ts  @team-b', 'c.ts  @team-a', 'd.ts  @team-a', 'e.ts  @team-c', ''].join('\n'));
  write(root, 'a.ts', 'export const a = 1;\n');
  write(root, 'b.ts', 'export const b = 1;\n');
  write(root, 'c.ts', 'export const c = 1;\n');
  write(root, 'd.ts', 'export const d = 1;\n');
  write(root, 'e.ts', 'export const e = 1;\n');
  commit(root, 'feat: seed files');
  for (let i = 0; i < 8; i++) {
    write(root, 'a.ts', `export const a = ${i};\n`);
    write(root, 'b.ts', `export const b = ${i};\n`);
    commit(root, `feat: touch a+b ${i}`);
  }
  for (let i = 0; i < 6; i++) {
    write(root, 'c.ts', `export const c = ${i};\n`);
    write(root, 'd.ts', `export const d = ${i};\n`);
    commit(root, `feat: touch c+d ${i}`);
  }
  write(root, 'a.ts', 'export const a = 99;\n');
  write(root, 'e.ts', 'export const e = 99;\n');
  commit(root, 'feat: touch a+e once');
  mkdirSync(join(root, '.mole', 'decisions'), { recursive: true });
  write(root, '.mole/decisions/0001-ab.md', "---\nid: '0001'\ntitle: a.ts and b.ts are coupled on purpose\nstatus: accepted\ndoor: two-way\nscope:\n  - a.ts\n  - b.ts\napprover: t\n---\n\n## Decision\n\na.ts and b.ts change together.\n");
  commit(root, 'docs: record the a+b coupling decision');
  return { root };
}

describe('computeCoupling (T77 done-when: co-change pairs, each explained by shared commits + owners + decisions)', () => {
  it('finds the a.ts/b.ts pair with its shared-commit evidence', async () => {
    const { root } = fixtureRepo();
    const r = await computeCoupling(root, { top: 10 });
    const ab = r.pairs.find((p) => (p.fileA === 'a.ts' && p.fileB === 'b.ts') || (p.fileA === 'b.ts' && p.fileB === 'a.ts'));
    expect(ab).toBeDefined();
    expect(ab!.sharedRevs).toBe(9); // 8 touch-loop commits + the initial seed commit (writes every file)
    expect(ab!.sampleShas.length).toBeGreaterThan(0);
    expect(ab!.sampleShas.length).toBeLessThanOrEqual(5);
  });

  it('never returns a pair below min-shared-revs (a.ts/e.ts co-changed only once)', async () => {
    const { root } = fixtureRepo();
    const r = await computeCoupling(root, { top: 20 });
    expect(r.pairs.some((p) => [p.fileA, p.fileB].includes('e.ts'))).toBe(false);
  });

  it('maps CODEOWNERS teams and flags the cross-team pair (a/b: @team-a vs @team-b)', async () => {
    const { root } = fixtureRepo();
    const r = await computeCoupling(root, { top: 10 });
    const ab = r.pairs.find((p) => [p.fileA, p.fileB].sort().join() === ['a.ts', 'b.ts'].sort().join())!;
    expect(ab.ownersA.length + ab.ownersB.length).toBeGreaterThan(0);
    expect(ab.crossTeam).toBe(true);
    const cd = r.pairs.find((p) => [p.fileA, p.fileB].sort().join() === ['c.ts', 'd.ts'].sort().join())!;
    expect(cd).toBeDefined();
    expect(cd.crossTeam).toBe(false); // both @team-a
  });

  it('sorts cross-team pairs first (Cataldo & Herbsleb: surface the under-coordinated coupling)', async () => {
    const { root } = fixtureRepo();
    const r = await computeCoupling(root, { top: 10 });
    const firstCrossTeamIdx = r.pairs.findIndex((p) => p.crossTeam);
    const lastSameTeamIdx = r.pairs.reduce((last, p, i) => (!p.crossTeam ? i : last), -1);
    expect(firstCrossTeamIdx).toBeGreaterThanOrEqual(0);
    expect(firstCrossTeamIdx).toBeLessThan(lastSameTeamIdx === -1 ? Infinity : r.pairs.findIndex((p) => !p.crossTeam));
  });

  it('attaches the decision whose scope covers both a.ts and b.ts, not c.ts/d.ts', async () => {
    const { root } = fixtureRepo();
    const r = await computeCoupling(root, { top: 10 });
    const ab = r.pairs.find((p) => [p.fileA, p.fileB].sort().join() === ['a.ts', 'b.ts'].sort().join())!;
    expect(ab.decisions.map((d) => d.id)).toContain('0001');
    const cd = r.pairs.find((p) => [p.fileA, p.fileB].sort().join() === ['c.ts', 'd.ts'].sort().join())!;
    expect(cd.decisions.length).toBe(0);
  });

  it('respects --top', async () => {
    const { root } = fixtureRepo();
    const r = await computeCoupling(root, { top: 1 });
    expect(r.pairs.length).toBe(1);
  });

  it('STOP clause: every returned pair carries non-empty shared-commit evidence (never a bare pair)', async () => {
    const { root } = fixtureRepo();
    const r = await computeCoupling(root, { top: 20 });
    expect(r.pairs.length).toBeGreaterThan(0);
    for (const p of r.pairs) {
      expect(p.sharedRevs).toBeGreaterThan(0);
      expect(p.sampleShas.length).toBeGreaterThan(0);
      expect(Array.isArray(p.ownersA)).toBe(true);
      expect(Array.isArray(p.ownersB)).toBe(true);
      expect(Array.isArray(p.decisions)).toBe(true);
    }
  });

  it('reports the CODEOWNERS path found at HEAD', async () => {
    const { root } = fixtureRepo();
    const r = await computeCoupling(root, { top: 10 });
    expect(r.codeownersPath).toBe('CODEOWNERS');
  });

  it('a repo with no CODEOWNERS still returns pairs, honestly with empty owner arrays (never fabricated)', async () => {
    const root = tmpRepo();
    for (let i = 0; i < 6; i++) {
      write(root, 'x.ts', `export const x = ${i};\n`);
      write(root, 'y.ts', `export const y = ${i};\n`);
      commit(root, `feat: touch x+y ${i}`);
    }
    const r = await computeCoupling(root, { top: 10 });
    expect(r.codeownersPath).toBeNull();
    expect(r.pairs.length).toBeGreaterThan(0);
    for (const p of r.pairs) {
      expect(p.ownersA).toEqual([]);
      expect(p.ownersB).toEqual([]);
      expect(p.crossTeam).toBe(false);
    }
  });

  it('formatCoupling renders a human-readable summary that names the evidence', async () => {
    const { root } = fixtureRepo();
    const r = await computeCoupling(root, { top: 10 });
    const text = formatCoupling(r);
    expect(text).toContain('shared=');
    expect(text).toContain('sample shas');
  });

  it('timed on this fixture -- well under a 10s budget', async () => {
    const { root } = fixtureRepo();
    const r = await computeCoupling(root, { top: 10 });
    expect(r.ms).toBeLessThan(10_000);
  });
});

/** touch `file` alone `n` times (n separate commits), each writing a distinct content so the commit
 * is non-empty. */
function touchAlone(root: string, file: string, n: number, label: string): void {
  for (let i = 0; i < n; i++) {
    write(root, file, `export const v = '${label}-${i}';\n`);
    commit(root, `feat: touch ${file} alone ${label}-${i}`);
  }
}
/** touch both files together, `n` times. */
function touchBoth(root: string, fileA: string, fileB: string, n: number, label: string): void {
  for (let i = 0; i < n; i++) {
    write(root, fileA, `export const v = '${label}-${i}';\n`);
    write(root, fileB, `export const v = '${label}-${i}';\n`);
    commit(root, `feat: touch ${fileA}+${fileB} ${label}-${i}`);
  }
}

describe('T77 review-1 HIGH: degree from the RAW average, not the ceiled one (code-maat logical_coupling.clj)', () => {
  it('revsA=17 revsB=24 shared=12 -> degree 58 (58.54% raw truncated), not 57 (ceil-average would give 57.14 -> 57)', async () => {
    const root = tmpRepo();
    // 12 shared commits: revsA += 12, revsB += 12, shared = 12.
    touchBoth(root, 'a.ts', 'b.ts', 12, 'shared');
    // 5 more commits touching a.ts alone: revsA = 17.
    touchAlone(root, 'a.ts', 5, 'a-alone');
    // 12 more commits touching b.ts alone: revsB = 24.
    touchAlone(root, 'b.ts', 12, 'b-alone');
    const r = await computeCoupling(root, { top: 10, minRevs: 1, minSharedRevs: 1, minCoupling: 0 });
    const ab = r.pairs.find((p) => [p.fileA, p.fileB].sort().join() === ['a.ts', 'b.ts'].sort().join())!;
    expect(ab).toBeDefined();
    expect(ab.revsA).toBe(17);
    expect(ab.revsB).toBe(24);
    expect(ab.sharedRevs).toBe(12);
    expect(ab.averageRevs).toBe(21); // ceil(20.5) -- the emitted column, NOT what degree is based on
    expect(ab.degreeExact).toBeCloseTo(58.536585, 4);
    expect(ab.degree).toBe(58); // code-maat's own (int coupling); NOT 57 (100*12/ceil(20.5))
  });
});

describe('T77 review-1 HIGH: max-coupling filters floor(coupling) <= max (code-maat coupling_algos.clj within-threshold?)', () => {
  it('raw coupling 52.63% (floor 52): kept at --max-coupling 52, dropped at --max-coupling 51', async () => {
    const root = tmpRepo();
    // 5 shared commits: revsA += 5, revsB += 5, shared = 5.
    touchBoth(root, 'a.ts', 'b.ts', 5, 'shared');
    // 4 more alone for a.ts (revsA = 9), 5 more alone for b.ts (revsB = 10).
    touchAlone(root, 'a.ts', 4, 'a-alone');
    touchAlone(root, 'b.ts', 5, 'b-alone');
    // average-revs raw = (9+10)/2 = 9.5; coupling = 100*5/9.5 = 52.6315...%; floor = 52.
    const findAB = (r: Awaited<ReturnType<typeof computeCoupling>>) =>
      r.pairs.find((p) => [p.fileA, p.fileB].sort().join() === ['a.ts', 'b.ts'].sort().join());

    const kept = await computeCoupling(root, { top: 10, minRevs: 1, minSharedRevs: 1, minCoupling: 0, maxCoupling: 52 });
    const ab = findAB(kept);
    expect(ab).toBeDefined();
    expect(ab!.degreeExact).toBeCloseTo(52.631578, 4);
    expect(ab!.degree).toBe(52);

    const dropped = await computeCoupling(root, { top: 10, minRevs: 1, minSharedRevs: 1, minCoupling: 0, maxCoupling: 51 });
    expect(findAB(dropped)).toBeUndefined(); // naive `degree > max` (52.63 > 51) would ALSO drop at
    // max-coupling=52, which is the bug this test guards against: code-maat only drops here, at 51.
  });
});

describe('T77 review-1 MED: min-revs filters the PAIR\'s average-revs after pairing, not per-file before (code-maat coupling_algos.clj within-threshold?)', () => {
  it('--min-revs 10 --min-shared-revs 5: pair revsA=6 revsB=20 shared=6 is KEPT (average-revs=13 >= 10) even though file A alone has only 6 revisions', async () => {
    const root = tmpRepo();
    // 6 shared commits: revsA = 6, revsB += 6, shared = 6 (every revision of a.ts is shared with b.ts).
    touchBoth(root, 'a.ts', 'b.ts', 6, 'shared');
    // 14 more commits touching b.ts alone: revsB = 20.
    touchAlone(root, 'b.ts', 14, 'b-alone');
    const r = await computeCoupling(root, { top: 10, minRevs: 10, minSharedRevs: 5 });
    const ab = r.pairs.find((p) => [p.fileA, p.fileB].sort().join() === ['a.ts', 'b.ts'].sort().join());
    expect(ab).toBeDefined(); // a per-file --min-revs pre-filter (old behaviour) would have dropped
    // a.ts (6 revs < 10) before pairing and this pair would never have formed.
    expect(ab!.revsA).toBe(6);
    expect(ab!.revsB).toBe(20);
    expect(ab!.sharedRevs).toBe(6);
  });
});

describe('T77 review-1 MED: max-changeset-size drops an oversized commit entirely, not only from pairing', () => {
  it('a 31-file commit (> default max-changeset-size=30) must not manufacture coupling between any of its files', async () => {
    const root = tmpRepo();
    const bigFiles = Array.from({ length: 31 }, (_, i) => `g${i}.ts`);
    // Repeat the all-31-files commit 6 times: without the filter every pair among g0..g30 would have
    // revsA=revsB=sharedRevs=6, degree=100% -- comfortably past every default threshold.
    for (let i = 0; i < 6; i++) {
      for (const f of bigFiles) write(root, f, `export const v = ${i};\n`);
      commit(root, `feat: touch all ${bigFiles.length} files together ${i}`);
    }
    const r = await computeCoupling(root); // default max-changeset-size=30
    expect(r.pairs.every((p) => !p.fileA.startsWith('g') && !p.fileB.startsWith('g'))).toBe(true);
    expect(r.pairs.some((p) => bigFiles.includes(p.fileA) || bigFiles.includes(p.fileB))).toBe(false);
  });
});
