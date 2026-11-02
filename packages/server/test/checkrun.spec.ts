// T45 red tests: computeCheckRun's live per-push conclusion used to be hardcoded 'success' and never
// called prCheck's governed/content-anchor computation (see context/product-plan/systems/metrics-proof/
// m2-conflict/4 log/mole-capability-and-gap.md). These tests exercise computeCheckRun directly over a
// real temp git repo + a decision record with a `match:` content anchor, with a minimal in-memory fake
// Pool (no real Postgres: computeCheckRun's DB use -- getGoverningDecisions' recursive CTE and the
// outbox insert -- is exercised structurally, not asserted on; the DB-backed assertions already covered
// by test/index.spec.ts and test/outbox.spec.ts stay real-DB-gated as before).
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { computeCheckRun } from '../src/checkrun.js';
import type { Pool } from '../src/db.js';

const git = (root: string, ...args: string[]) =>
  execFileSync('git', ['-C', root, '-c', 'user.name=T', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', ...args], { encoding: 'utf8' }).trim();

function write(root: string, rel: string, text: string) {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), text);
}

/** Minimal fake Pool: enough for getGoverningDecisions (recursive CTE, always 0 rows) and
 *  writeOutboxInTx (an insert) to run without a real Postgres connection. */
function fakePool(): Pool {
  const client = {
    query: async (_sql: string, _params?: unknown[]) => ({ rows: [] as any[] }),
    release: () => undefined,
  };
  return { connect: async () => client } as unknown as Pool;
}

const rec = (id: string, matchPattern: string) =>
  `---\nid: '${id}'\ntitle: Record ${id}\nstatus: accepted\nscope: []\nmatch:\n  - pattern: '${matchPattern}'\n---\n\n## Decision\n\nRecord ${id}.\n`;

describe('computeCheckRun wires prCheck into the live conclusion (T45)', () => {
  let root = '';
  let violatingRef = '';
  let cleanRef = '';

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'mole-checkrun-t45-'));
    git(root, 'init', '-q', '-b', 'main');
    write(root, '.mole/decisions/0001-no-default-export.md', rec('0001', 'export default'));
    write(root, 'src/a.ts', 'export const a = 1;\n');
    git(root, 'add', '-A');
    git(root, 'commit', '-q', '-m', 'base');

    // a clean follow-up push: touches src/, matches nothing
    write(root, 'src/a.ts', 'export const a = 1;\nexport const b = 2;\n');
    git(root, 'add', '-A');
    git(root, 'commit', '-q', '-m', 'clean push');
    cleanRef = git(root, 'rev-parse', 'HEAD');

    // a violating push: adds a line the record's match: pattern governs
    write(root, 'src/a.ts', 'export const a = 1;\nexport const b = 2;\nexport default a;\n');
    git(root, 'add', '-A');
    git(root, 'commit', '-q', '-m', 'violating push');
    violatingRef = git(root, 'rev-parse', 'HEAD');
  });
  afterAll(() => {
    if (root) rmSync(root, { recursive: true, force: true });
  });

  it('is never the old hardcoded success, and carries no annotation when nothing governs the diff', async () => {
    const result = await computeCheckRun(fakePool(), 'org-t45', root, cleanRef, undefined);
    // GitHub checks API conclusion enum (success|failure|neutral|...); Mole's own "flags, not gates"
    // rule means this is always 'neutral', never a hard pass/fail verdict -- but it must be computed,
    // not a hardcoded 'success' regardless of what the diff did.
    expect(result.conclusion).toBe('neutral');
    expect(result.annotations).toEqual([]);
  });

  it('surfaces a real content-anchor match as an annotation instead of discarding it (the T45 gap)', async () => {
    const result = await computeCheckRun(fakePool(), 'org-t45', root, violatingRef, undefined);
    expect(result.conclusion).toBe('neutral'); // flags, not gates: still never a hard failure
    expect(result.annotations.length).toBeGreaterThan(0);
    expect(result.annotations.some((a) => a.message.includes('0001'))).toBe(true);
    expect(result.summary).not.toBe('0 file(s) governed by a decision, 0 not'); // real signal, not the old generic line
  });
});
