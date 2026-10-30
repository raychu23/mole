// T31 M23: the bench's own evaluate() against the FROZEN key (>= 20 real questions, 4 log/prior-art.md).
// Red against the src stub (always 0 matches); green once the real matcher replaces the stub (R1/R2: this
// file and the key are never edited between those two states).
import { describe, expect, it } from 'vitest';
import { evaluate, loadKey, loadRecords, TARGET_PRECISION, TARGET_RECALL } from '../bench/m23-code.js';

describe('M23 code-half bench against the frozen key', () => {
  it('the key has at least 20 real, dated questions, each with an expected record', () => {
    const key = loadKey();
    expect(key.length).toBeGreaterThanOrEqual(20);
    for (const k of key) {
      expect(typeof k.text).toBe('string');
      expect(k.text.length).toBeGreaterThan(10);
      expect(typeof k.folder).toBe('string');
      expect(typeof k.record).toBe('string');
      expect(typeof k.date).toBe('string');
    }
  });

  it('meets the measured precision/recall target with 0 model calls', () => {
    const key = loadKey();
    const records = loadRecords();
    const result = evaluate(key, records);
    expect(result.precision).toBeGreaterThanOrEqual(TARGET_PRECISION);
    expect(result.recall).toBeGreaterThanOrEqual(TARGET_RECALL);
  });
});
