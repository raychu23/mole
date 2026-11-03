// T79 red test (D52): the committed scoreboard.json (tasks/T41-head-to-head-benchmarks/4 log/scoreboard.json,
// written by packages/bench/h2h.ts) must never describe a "run all" baseline's selection size as more than
// 100% "of the suite" -- running the whole suite IS the suite, by construction (standard RTS definition,
// Rothermel & Harrold 1996 / Ekstazi / STARTS; see 4 log/prior-art.md). D52 found H2's row says "1347.5% of
// the suite" for run-all, which is impossible under that definition: this test pins the invariant down so a
// future regression in the bench's math/prose cannot silently reintroduce it.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();

describe('T79 D52: H2 scoreboard row never claims a baseline runs >100% of the suite', () => {
  it('scoreboard.json H2 row text contains no "of the suite" percentage over 100%', () => {
    const scoreboardPath = join(root, 'tasks/T41-head-to-head-benchmarks/4 log/scoreboard.json');
    const board = JSON.parse(readFileSync(scoreboardPath, 'utf8'));
    const h2 = board.rows.find((r: { claim: string }) => r.claim.startsWith('H2'));
    expect(h2, 'H2 row must exist in scoreboard.json').toBeTruthy();
    const text = JSON.stringify(h2);
    const matches = [...text.matchAll(/([\d.]+)%\s*of the suite/g)];
    for (const m of matches) {
      const value = Number(m[1]);
      expect(value, `"${m[0]}" in H2 row: a run/selection can never be more than 100% of the suite it is drawn from`).toBeLessThanOrEqual(100);
    }
  });
});
