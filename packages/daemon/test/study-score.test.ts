import { describe, expect, it } from 'vitest';
// @ts-expect-error plain .mjs without types
import { scoreOne, summarise } from '../../../study/m15-learner/score.mjs';

const keys = {
  callGraph: { a: ['b'], b: ['c'], c: ['d'] },
  tasks: {
    T05: { type: 'callers', key: { kind: 'set', items: ['src/a.ts', 'src/b.ts', 'src/c.ts', 'src/d.ts'] } },
    T13: { type: 'call-path', key: { kind: 'path', start: 'a', end: 'd', length: 4 } },
  },
};

describe('study scorer', () => {
  it('scores set answers by F1 and ignores a leading ./', () => {
    expect(scoreOne('T05', ['./src/a.ts', 'src/b.ts', 'src/c.ts', 'src/d.ts'], keys)).toBe(1);
    expect(scoreOne('T05', ['src/a.ts', 'src/x.ts'], keys)).toBeCloseTo(0.333, 2);
    expect(scoreOne('T05', [], keys)).toBe(0);
  });
  it('accepts only a path whose every edge exists', () => {
    expect(scoreOne('T13', ['a', 'b', 'c', 'd'], keys)).toBe(1);
    expect(scoreOne('T13', ['a', 'c', 'b', 'd'], keys)).toBe(0);
    expect(scoreOne('T13', ['a', 'b', 'd'], keys)).toBe(0);
  });
  it('pairs by participant, reports differences and warns when n is small', () => {
    const rows = [
      { participant: 'P1', arm: 'mole', task: 'T05', answer: ['src/a.ts', 'src/b.ts', 'src/c.ts', 'src/d.ts'], seconds: 100 },
      { participant: 'P1', arm: 'none', task: 'T05', answer: ['src/a.ts', 'src/b.ts'], seconds: 200 },
      { participant: 'P2', arm: 'mole', task: 'T05', answer: ['src/a.ts', 'src/b.ts'], seconds: 150 },
      { participant: 'P2', arm: 'none', task: 'T05', answer: ['src/a.ts', 'src/b.ts'], seconds: 150 },
    ];
    const s = summarise(rows, keys);
    expect(s.participants).toBe(2);
    expect(s.comparisons['mole - none (during tasks)']).toMatchObject({ n: 2, participantsBetter: 1, participantsWorse: 0, medianSecondsDiff: -50 });
    expect(s.caution).toMatch(/descriptive only/);
  });
});
