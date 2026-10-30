// T30 red test: the M22 key is well formed (5 questions, each with an ADR id that exists in the backstage corpus and 2-3 key phrases)
// and the overlay records load without problems. (terminal heredoc: write_file may be approval-gated for tests)
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadGraph } from '../src/index.js';

const bench = resolve(dirname(fileURLToPath(import.meta.url)), '../bench');
const key = JSON.parse(readFileSync(join(bench, 'm22-key.json'), 'utf8'));

describe('M22 key', () => {
  it('5 questions, expected ADRs exist in the backstage corpus, 2-3 phrases each, dated', () => {
    expect(key.written).toMatch(/^2026-10-29T/);
    expect(key.questions).toHaveLength(5);
    const adrs = readdirSync(join(bench, 'corpora/backstage-3ecfb121859/child/docs/architecture-decisions'));
    for (const q of key.questions) {
      expect(adrs.some((f: string) => f.startsWith(`${q.expect}-`))).toBe(true);
      expect(q.phrases.length).toBeGreaterThanOrEqual(2);
      expect(q.phrases.length).toBeLessThanOrEqual(3);
      expect(q.text).not.toMatch(new RegExp(q.expect, 'i')); // the question never names its answer
    }
  });

  it('the overlay records load with no problems and every expected ADR has a record', () => {
    const g = loadGraph(join(bench, 'm22/overlay'));
    expect(g.problems).toEqual([]);
    const ids = new Set(g.nodes.map((n) => n.id));
    for (const q of key.questions) expect(ids.has(q.expect)).toBe(true);
    expect(existsSync(join(bench, 'm22/prompt-task.md'))).toBe(true);
  });
});
