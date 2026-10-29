// T13 (after red): dwell spans drop classes that contain listed members; hover picks the innermost symbol.
import { describe, expect, it } from 'vitest';
import { dwellSpans, spanAt } from '../src/seen.js';

const span = (tail: string, startLine: number, endLine: number) => ({ tail, startLine, endLine });
const SPANS = [span('Box', 0, 10), span('Box.open', 2, 4), span('alpha', 12, 15), span('Empty', 17, 18)];

describe('dwellSpans / spanAt', () => {
  it('a class with listed members does not count for the dwell; a memberless class does', () => {
    expect(dwellSpans(SPANS).map((s) => s.tail)).toEqual(['Box.open', 'alpha', 'Empty']);
  });
  it('hover resolves to the innermost symbol on the line', () => {
    expect(spanAt(SPANS, 3)?.tail).toBe('Box.open');
    expect(spanAt(SPANS, 0)?.tail).toBe('Box');
    expect(spanAt(SPANS, 11)).toBeUndefined();
  });
});
