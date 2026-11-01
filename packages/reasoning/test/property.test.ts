import { describe, expect, it } from 'vitest';
import { evaluate } from '../src/engine.js';
import { IncrementalEvaluator } from '../src/incremental.js';
import type { ArgumentSpec, Framework } from '../src/types.js';

// Deterministic xorshift32 PRNG so a failing seed is reproducible without a
// third-party dependency.
function makeRng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 0xffffffff;
  };
}

type Op =
  | { kind: 'addArg'; id: string; value?: string }
  | { kind: 'removeArg'; id: string }
  | { kind: 'addAttack'; from: string; to: string }
  | { kind: 'removeAttack'; from: string; to: string };

const VALUES = ['v1', 'v2', 'v3'];

function randomSequence(rng: () => number, nOps: number, nIds: number): Op[] {
  const ids = Array.from({ length: nIds }, (_, i) => `n${i}`);
  const live = new Set<string>();
  const attacks = new Set<string>();
  const ops: Op[] = [];
  for (let i = 0; i < nOps; i++) {
    const r = rng();
    const pickLive = (): string | undefined => {
      const arr = [...live];
      return arr.length ? arr[Math.floor(rng() * arr.length)] : undefined;
    };
    if (r < 0.25 || live.size === 0) {
      const id = ids[Math.floor(rng() * ids.length)]!;
      if (!live.has(id)) {
        live.add(id);
        ops.push({ kind: 'addArg', id, value: rng() < 0.5 ? VALUES[Math.floor(rng() * VALUES.length)] : undefined });
      }
    } else if (r < 0.4) {
      const id = pickLive();
      if (id) {
        live.delete(id);
        for (const k of [...attacks]) {
          const [f, t] = k.split('\u0000');
          if (f === id || t === id) attacks.delete(k);
        }
        ops.push({ kind: 'removeArg', id });
      }
    } else if (r < 0.75) {
      const from = pickLive();
      const to = pickLive();
      if (from && to) {
        const k = `${from}\u0000${to}`;
        if (!attacks.has(k)) {
          attacks.add(k);
          ops.push({ kind: 'addAttack', from, to });
        }
      }
    } else {
      const from = pickLive();
      const to = pickLive();
      if (from && to) {
        const k = `${from}\u0000${to}`;
        if (attacks.has(k)) {
          attacks.delete(k);
          ops.push({ kind: 'removeAttack', from, to });
        }
      }
    }
  }
  return ops;
}

function applyOpsToIncremental(ev: IncrementalEvaluator, ops: Op[]): void {
  for (const op of ops) {
    if (op.kind === 'addArg') ev.addArg({ id: op.id, value: op.value });
    else if (op.kind === 'removeArg') ev.removeArg(op.id);
    else if (op.kind === 'addAttack') ev.addAttack(op.from, op.to);
    else ev.removeAttack(op.from, op.to);
  }
}

function applyOpsToFramework(ops: Op[]): Framework {
  const args = new Map<string, ArgumentSpec>();
  const attacks = new Set<string>();
  for (const op of ops) {
    if (op.kind === 'addArg') args.set(op.id, { id: op.id, value: op.value });
    else if (op.kind === 'removeArg') {
      args.delete(op.id);
      for (const k of [...attacks]) {
        const [f, t] = k.split('\u0000');
        if (f === op.id || t === op.id) attacks.delete(k);
      }
    } else if (op.kind === 'addAttack') attacks.add(`${op.from}\u0000${op.to}`);
    else attacks.delete(`${op.from}\u0000${op.to}`);
  }
  return {
    args: [...args.values()],
    attacks: [...attacks].map((k) => k.split('\u0000') as [string, string]),
  };
}

describe('incremental == full recomputation (T42 property test)', () => {
  it('matches full evaluate() after every prefix of 500+ random edit sequences', () => {
    const SEQUENCES = 520;
    for (let seed = 1; seed <= SEQUENCES; seed++) {
      const rng = makeRng(seed * 2654435761);
      const nOps = 5 + (seed % 20);
      const nIds = 3 + (seed % 8);
      const ops = randomSequence(rng, nOps, nIds);
      const audience = seed % 3 === 0 ? VALUES : undefined;

      const incremental = new IncrementalEvaluator(undefined, audience);
      for (const op of ops) {
        if (op.kind === 'addArg') incremental.addArg({ id: op.id, value: op.value });
        else if (op.kind === 'removeArg') incremental.removeArg(op.id);
        else if (op.kind === 'addAttack') incremental.addAttack(op.from, op.to);
        else incremental.removeAttack(op.from, op.to);

        // Check after EVERY op, not just the end: the incremental state must
        // equal a from-scratch full evaluation of everything applied so far.
        const prefix = ops.slice(0, ops.indexOf(op) + 1);
        const framework = applyOpsToFramework(prefix);
        const full = evaluate(framework, audience);
        const got = incremental.evaluate();
        expect(got.labels, `seed=${seed} op=${JSON.stringify(op)}`).toEqual(full.labels);
      }
    }
  });

  it('matches full recomputation on a larger fixed scenario with mixed edits', () => {
    const ev = new IncrementalEvaluator();
    const ids = Array.from({ length: 40 }, (_, i) => `x${i}`);
    for (const id of ids) ev.addArg({ id });
    for (let i = 0; i < ids.length; i++) {
      ev.addAttack(ids[i]!, ids[(i + 1) % ids.length]!); // one big 40-cycle
    }
    // Break the cycle by removing one attack -> should resolve to a long chain.
    ev.removeAttack(ids[39]!, ids[0]!);
    const framework: Framework = {
      args: ids.map((id) => ({ id })),
      attacks: ids.slice(0, 39).map((id, i) => [id, ids[i + 1]!] as [string, string]),
    };
    expect(ev.evaluate().labels).toEqual(evaluate(framework).labels);
  });
});
