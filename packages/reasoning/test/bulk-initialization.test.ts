import { describe, expect, it, vi } from 'vitest';
import { evaluate } from '../src/engine.js';
import { IncrementalEvaluator } from '../src/incremental.js';
import type { Framework } from '../src/types.js';

describe('bulk initialization of incremental reasoning', () => {
  it('loads existing edges without replaying per-edit mutation/re-evaluation', () => {
    const framework: Framework = {
      args: Array.from({ length: 80 }, (_, i) => ({ id: `a${i}` })),
      attacks: Array.from({ length: 80 }, (_, i) => [`a${i}`, `a${(i + 1) % 80}`]),
    };
    const addArg = vi.spyOn(IncrementalEvaluator.prototype, 'addArg');
    const addAttack = vi.spyOn(IncrementalEvaluator.prototype, 'addAttack');
    try {
      const evaluator = new IncrementalEvaluator(framework);
      expect(evaluator.evaluate()).toEqual(evaluate(framework));
      expect(addArg).not.toHaveBeenCalled();
      expect(addAttack).not.toHaveBeenCalled();
    } finally {
      addArg.mockRestore();
      addAttack.mockRestore();
    }
  });

  it('preserves value filtering, cycles and raw attacks through edits after bulk load', () => {
    for (let seed = 1; seed <= 64; seed++) {
      const framework: Framework = {
        args: Array.from({ length: 25 }, (_, i) => ({ id: `a${i}`, value: i % 2 ? 'speed' : 'safety' })),
        attacks: Array.from({ length: 180 }, (_, i) => [`a${(i * seed + i) % 25}`, `a${(i * 7 + seed) % 25}`]),
      };
      const audience = seed % 2 ? ['safety', 'speed'] : undefined;
      const evaluator = new IncrementalEvaluator(framework, audience);
      expect(evaluator.evaluate().labels).toEqual(evaluate(framework, audience).labels);
      const [from, to] = framework.attacks[0]!;
      evaluator.removeAttack(from, to);
      const edited: Framework = {
        args: framework.args,
        attacks: framework.attacks.filter(([a, b]) => a !== from || b !== to),
      };
      expect(evaluator.evaluate().labels).toEqual(evaluate(edited, audience).labels);
      evaluator.addAttack(from, to);
      edited.attacks.push([from, to]);
      expect(evaluator.evaluate().labels).toEqual(evaluate(edited, audience).labels);
      evaluator.removeArg('a0');
      expect(evaluator.evaluate().labels).toEqual(evaluate({
        args: edited.args.filter((a) => a.id !== 'a0'),
        attacks: edited.attacks.filter(([a, b]) => a !== 'a0' && b !== 'a0'),
      }, audience).labels);
    }
  });

  it('initializes empty graphs and retains the full evaluator input checks', () => {
    expect(new IncrementalEvaluator().evaluate()).toEqual(evaluate({ args: [], attacks: [] }));
    const invalid: Framework[] = [
      { args: [{ id: '' }], attacks: [] },
      { args: [{ id: 'a' }, { id: 'a' }], attacks: [] },
      { args: [{ id: 'a' }], attacks: [['a', 'missing']] },
    ];
    for (const framework of invalid) {
      expect(() => evaluate(framework)).toThrow();
      expect(() => new IncrementalEvaluator(framework)).toThrow();
    }
  });
});
