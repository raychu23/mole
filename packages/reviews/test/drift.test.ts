// T40 key: Swimm-style drift split. 10 before/after fixtures, labeled trivial (implementation-only, same
// signature: auto-synced silently) vs real (deleted/renamed/signature-changed: escalated, never auto-synced).
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { classifyDrift } from '../src/drift.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(here, '..', 'bench', 'fixtures', 'drift');
const key = JSON.parse(readFileSync(join(here, '..', 'bench', 'fixtures', 'drift-key.json'), 'utf8')) as {
  cases: Array<{ dir: string; tail: string; expected: 'trivial' | 'real' }>;
};

describe('classifyDrift (M34 part 3: Swimm-style trivial-vs-real split)', () => {
  it('agrees with the labeled key on >= 90% of cases, and 0 real drifts are classified trivial (never silently auto-synced)', () => {
    let agree = 0;
    let realMisclassifiedTrivial = 0;
    for (const c of key.cases) {
      const beforeText = readFileSync(join(fixturesDir, c.dir, 'before.ts'), 'utf8');
      const afterText = readFileSync(join(fixturesDir, c.dir, 'after.ts'), 'utf8');
      const result = classifyDrift('case.ts', beforeText, afterText, c.tail);
      if (result.status === c.expected) agree++;
      if (c.expected === 'real' && result.status === 'trivial') realMisclassifiedTrivial++;
    }
    expect(realMisclassifiedTrivial).toBe(0);
    expect(agree / key.cases.length).toBeGreaterThanOrEqual(0.9);
  });
});
