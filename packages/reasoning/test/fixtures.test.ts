import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluate } from '../src/engine.js';
import type { Framework } from '../src/types.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(here, '..', 'fixtures');

function load(name: string): { framework: Framework; audience?: string[] } {
  return JSON.parse(readFileSync(join(fixturesDir, `${name}.json`), 'utf8'));
}

describe('grounded fixtures (oracle-gated, see tasks/T42-reasoning-engine/4 log/runs.jsonl)', () => {
  it('Nixon diamond: symmetric mutual rebuttal -> both undecided, no explanation path', () => {
    const { framework } = load('nixon-diamond');
    const { labels, why } = evaluate(framework);
    expect(labels).toEqual({ B1: 'undecided', B2: 'undecided' });
    expect(why).toEqual({});
  });

  it('chain A1->A2->A3: alternating in/out/in with defense paths', () => {
    const { framework } = load('chain');
    const { labels, why } = evaluate(framework);
    expect(labels).toEqual({ A1: 'in', A2: 'out', A3: 'in' });
    expect(why.A1).toEqual({ defendedBy: [] });
    expect(why.A2).toEqual({ defeatedBy: 'A1' });
    expect(why.A3).toEqual({ defendedBy: ['A1'] });
  });

  it('odd cycle C1->C2->C3->C1: no base case, all undecided', () => {
    const { framework } = load('odd-cycle');
    const { labels, why } = evaluate(framework);
    expect(labels).toEqual({ C1: 'undecided', C2: 'undecided', C3: 'undecided' });
    expect(why).toEqual({});
  });

  it('even cycle D1->D2->D3->D4->D1: no base case either, all undecided', () => {
    const { framework } = load('even-cycle');
    const { labels, why } = evaluate(framework);
    expect(labels).toEqual({ D1: 'undecided', D2: 'undecided', D3: 'undecided', D4: 'undecided' });
    expect(why).toEqual({});
  });

  it('self-attack S1->S1 (and S1->S2): S1 can never resolve, so S2 cannot either', () => {
    const { framework } = load('self-attack');
    const { labels, why } = evaluate(framework);
    expect(labels).toEqual({ S1: 'undecided', S2: 'undecided' });
    expect(why).toEqual({});
  });

  it('defended diamond: unattacked C defeats B2, freeing B1', () => {
    const { framework } = load('defended-diamond');
    const { labels, why } = evaluate(framework);
    expect(labels).toEqual({ B1: 'in', B2: 'out', C: 'in' });
    expect(why.C).toEqual({ defendedBy: [] });
    expect(why.B2).toEqual({ defeatedBy: 'C' });
    expect(why.B1).toEqual({ defendedBy: ['C'] });
  });

  it('Bench-Capon audience: liberty-preferring audience keeps B1 attack off (VAF, no plain-Dung oracle covers this -- memo.md section 1/8 gap, hand-verified)', () => {
    const { framework, audience } = load('audience-nixon');
    // B1 promotes "liberty", B2 promotes "security"; audience prefers liberty first.
    // B2 -> B1 fails (liberty preferred to security), so B1 has no live attacker -> in.
    // B1 -> B2 succeeds (security is not preferred to liberty) -> B2 out.
    const { labels, why } = evaluate(framework, audience);
    expect(labels).toEqual({ B1: 'in', B2: 'out' });
    expect(why.B1).toEqual({ defendedBy: [] });
    expect(why.B2).toEqual({ defeatedBy: 'B1' });
  });

  it('no audience given == plain Dung AF (values ignored)', () => {
    const { framework } = load('audience-nixon');
    const { labels } = evaluate(framework);
    expect(labels).toEqual({ B1: 'undecided', B2: 'undecided' });
  });

  it('rejects duplicate argument ids', () => {
    expect(() => evaluate({ args: [{ id: 'x' }, { id: 'x' }], attacks: [] })).toThrow(/duplicate/);
  });

  it('rejects attacks referencing unknown ids', () => {
    expect(() => evaluate({ args: [{ id: 'x' }], attacks: [['x', 'y']] })).toThrow(/unknown/);
  });
});
