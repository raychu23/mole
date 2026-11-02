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
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
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
    const result = await computeCheckRun(fakePool(), 'org-t45', root, cleanRef, undefined, undefined);
    // GitHub checks API conclusion enum (success|failure|neutral|...); Mole's own "flags, not gates"
    // rule means this is always 'neutral', never a hard pass/fail verdict -- but it must be computed,
    // not a hardcoded 'success' regardless of what the diff did.
    expect(result.conclusion).toBe('neutral');
    expect(result.annotations).toEqual([]);
  });

  it('surfaces a real content-anchor match as an annotation instead of discarding it (the T45 gap)', async () => {
    const result = await computeCheckRun(fakePool(), 'org-t45', root, violatingRef, undefined, undefined);
    expect(result.conclusion).toBe('neutral'); // flags, not gates: still never a hard failure
    expect(result.annotations.length).toBeGreaterThan(0);
    expect(result.annotations.some((a) => a.message.includes('0001'))).toBe(true);
    expect(result.summary).not.toBe('0 file(s) governed by a decision, 0 not'); // real signal, not the old generic line
  });
});

// Review round 2 P1: baseOf() always used ref^ as prCheck's base, i.e. only the diff of the
// SINGLE last commit. A multi-commit push (GitHub batches every commit pushed in one go into
// one push event, with `before`/`after` spanning the whole range) with the violation in an
// earlier commit of the same push was invisible: ref^ only sees the final commit's own diff.
// GitHub's push event payload carries `before` precisely so a consumer can diff the whole
// range (https://docs.github.com/.../webhooks-and-events/events/github-event-types#pushevent);
// this is also how reviewdog/Danger pick a base, rather than always using HEAD^.
describe('computeCheckRun uses the push range base, not just the last commit (T45 review 2 P1)', () => {
  let root = '';
  let before = '';
  let after = '';

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'mole-checkrun-t45-range-'));
    git(root, 'init', '-q', '-b', 'main');
    write(root, '.mole/decisions/0001-no-default-export.md', rec('0001', 'export default'));
    write(root, 'src/a.ts', 'export const a = 1;\n');
    git(root, 'add', '-A');
    git(root, 'commit', '-q', '-m', 'base');
    before = git(root, 'rev-parse', 'HEAD'); // the GitHub push event's `before`

    // first commit of the push: violates the record
    write(root, 'src/a.ts', 'export const a = 1;\nexport default a;\n');
    git(root, 'add', '-A');
    git(root, 'commit', '-q', '-m', 'violating commit 1 of push');

    // second commit of the SAME push: an unrelated clean follow-up
    write(root, 'README.md', 'notes\n');
    git(root, 'add', '-A');
    git(root, 'commit', '-q', '-m', 'clean commit 2 of push');
    after = git(root, 'rev-parse', 'HEAD'); // the GitHub push event's `after` / webhook ref
  });
  afterAll(() => {
    if (root) rmSync(root, { recursive: true, force: true });
  });

  it('without `before`, falls back to ref^ and misses the violation buried earlier in the push (documents the old gap)', async () => {
    const result = await computeCheckRun(fakePool(), 'org-t45', root, after, undefined, undefined);
    expect(result.annotations.length).toBe(0);
  });

  it('with `before`, diffs the whole push range and catches the violation in the first commit', async () => {
    const result = await computeCheckRun(fakePool(), 'org-t45', root, after, before, undefined);
    expect(result.annotations.length).toBeGreaterThan(0);
    expect(result.annotations.some((a) => a.message.includes('0001'))).toBe(true);
  });

  it('falls back to ref^ when `before` is all-zero (GitHub\'s new-branch sentinel)', async () => {
    const result = await computeCheckRun(fakePool(), 'org-t45', root, after, '0'.repeat(40), undefined);
    expect(result.annotations.length).toBe(0);
  });

  it('falls back to ref^ when `before` is not an ancestor of ref (a force push rewrote history)', async () => {
    const unrelatedRoot = mkdtempSync(join(tmpdir(), 'mole-checkrun-t45-unrelated-'));
    git(unrelatedRoot, 'init', '-q', '-b', 'main');
    write(unrelatedRoot, 'x.txt', 'x\n');
    git(unrelatedRoot, 'add', '-A');
    git(unrelatedRoot, 'commit', '-q', '-m', 'unrelated history');
    const unrelatedSha = git(unrelatedRoot, 'rev-parse', 'HEAD');
    rmSync(unrelatedRoot, { recursive: true, force: true });

    // unrelatedSha does not exist as an object in `root` at all, let alone as an ancestor of
    // `after` -- the same shape a force push produces (old `before` no longer reachable).
    const result = await computeCheckRun(fakePool(), 'org-t45', root, after, unrelatedSha, undefined);
    expect(result.annotations.length).toBe(0);
  });
});

// Review round 2 P2: the catch around prCheck used to swallow every error with a bare `catch {}`
// -- no telemetry, no log, nothing. A real prCheck failure (bad ref, records-root bug, etc.)
// degraded silently to the file-count-only title with no way to ever notice it happened.
describe('computeCheckRun records a prCheck failure instead of swallowing it silently (T45 review 2 P2)', () => {
  it('logs the error (this server\'s own console.error "logger", matching index.ts/queue.ts/m25.ts) and still falls back', async () => {
    const root = mkdtempSync(join(tmpdir(), 'mole-checkrun-t45-p2-'));
    git(root, 'init', '-q', '-b', 'main');
    write(root, 'src/a.ts', 'export const a = 1;\n');
    git(root, 'add', '-A');
    git(root, 'commit', '-q', '-m', 'base');

    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      // an unresolvable ref makes prCheck throw inside computeCheckRun's try/catch
      const result = await computeCheckRun(fakePool(), 'org-t45', root, 'not-a-real-commit-sha', undefined, undefined);

      // the fallback still ran: a real result, never a thrown error / lost notification
      expect(result.conclusion).toBe('neutral');
      expect(result.annotations).toEqual([]);

      expect(errSpy).toHaveBeenCalled();
      const loggedArgs = errSpy.mock.calls.map((c) => JSON.stringify(c));
      expect(loggedArgs.some((s) => s.includes('org-t45') && s.includes('not-a-real-commit-sha'))).toBe(true);
    } finally {
      errSpy.mockRestore();
      rmSync(root, { recursive: true, force: true });
    }
  });
});
