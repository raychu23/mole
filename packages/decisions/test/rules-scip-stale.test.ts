// T95 review follow-up HIGH-1: a stale `index.scip` must never silently pass `mole rules` with 0 violations.
// Uses the counter-fixture (real scip-python 0.6.8 index, see fixtures/counterfixture/HOW-PRODUCED.md) with a
// rule that forbids importing src/pkg/leaf.py; mtimes are set explicitly (not left to cpSync) so "fresh" vs
// "stale" is deterministic regardless of filesystem timing.
import { cpSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { readScipIndex } from '@mole/scip';
import { checkRules, rulesCli, scipStaleness, StaleScipIndexError } from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = join(here, '../../scip/test/fixtures/counterfixture');

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const c of cleanups.splice(0)) c();
});

const RULE = [
  '---',
  'id: D-STALE',
  'title: Nothing outside pkg imports leaf directly',
  'status: accepted',
  'rules:',
  '  - forbid: import',
  "    from: 'src/case_plain.py'",
  '    to: src/pkg/leaf.py',
  '---',
  '',
].join('\n');

/** A fresh copy of the counter-fixture with index.scip's mtime pinned relative to the source tree's, so the
 * staleness check is deterministic instead of racing cpSync's copy order. */
function repo(indexAge: 'fresh' | 'stale', opts: { touchNewFile?: boolean } = {}): string {
  const root = mkdtempSync(join(tmpdir(), 'mole-rules-scip-stale-'));
  cleanups.push(() => rmSync(root, { recursive: true, force: true }));
  cpSync(fixture, root, { recursive: true });
  mkdirSync(join(root, '.mole/decisions'), { recursive: true });
  writeFileSync(join(root, '.mole/decisions/0001-no-leaf.md'), RULE);
  const indexPath = join(root, 'index.scip');
  if (indexAge === 'fresh') {
    // index newer than every source file: touch it into the future
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000);
    utimesSync(indexPath, future, future);
  } else {
    // index older than the source tree: push it into the past instead of touching sources, which keeps the
    // index's own "do the indexed files/targets still exist" semantics intact for the non-staleness assertions
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000);
    utimesSync(indexPath, past, past);
  }
  if (opts.touchNewFile) writeFileSync(join(root, 'src/case_new_violation.py'), 'from src.pkg.leaf import helper\n\nx = helper()\n');
  return root;
}

describe('SCIP staleness detection (T95 review HIGH-1)', () => {
  it('scipStaleness: a fresh index (newer than every source file) is not stale', () => {
    const root = repo('fresh');
    const idx = readScipIndex(join(root, 'index.scip'));
    expect(scipStaleness(root, join(root, 'index.scip'), idx)).toEqual({ stale: false, reasons: [] });
  });

  it('scipStaleness: an index older than a modified source file is stale', () => {
    const root = repo('stale');
    const idx = readScipIndex(join(root, 'index.scip'));
    const r = scipStaleness(root, join(root, 'index.scip'), idx);
    expect(r.stale).toBe(true);
    expect(r.reasons.some((x: string) => x.includes('modified after index.scip'))).toBe(true);
  });

  it('scipStaleness: a file added after indexing (not in the index at all) is stale', () => {
    const root = repo('fresh', { touchNewFile: true });
    const idx = readScipIndex(join(root, 'index.scip'));
    const r = scipStaleness(root, join(root, 'index.scip'), idx);
    expect(r.stale).toBe(true);
    expect(r.reasons.some((x: string) => x.includes('case_new_violation.py') && x.includes('not in index.scip'))).toBe(true);
  });

  it('checkRules throws StaleScipIndexError (not a silent 0-violation pass) when the index is stale', async () => {
    const root = repo('stale');
    await expect(checkRules(root)).rejects.toThrow(StaleScipIndexError);
  });

  it('rulesCli exits 3 (distinct from 0 clean / 1 violations / 2 rule errors) on a stale index, with a clear message', async () => {
    const root = repo('stale');
    const errs: string[] = [];
    const origErr = console.error;
    const origLog = console.log;
    console.error = (...a: unknown[]) => void errs.push(a.join(' '));
    console.log = () => {};
    try {
      const code = await rulesCli([], {}, root);
      expect(code).toBe(3);
    } finally {
      console.error = origErr;
      console.log = origLog;
    }
    expect(errs.join('\n')).toMatch(/index\.scip is stale/);
    expect(errs.join('\n')).toMatch(/re-run scip-python index/);
  });

  it('--allow-stale-scip runs the check anyway and still catches the real violation', async () => {
    const root = repo('stale');
    const r = await checkRules(root, { allowStaleScip: true });
    expect(r.violations.find((v) => v.file === 'src/case_plain.py' && v.target === 'src/pkg/leaf.py')).toBeTruthy();
  });

  it('a stale index that would otherwise hide a NEW violation fails loudly instead of reporting 0 violations', async () => {
    // the review's exact scenario: a file introducing a forbidden import lands in the repo after the index was
    // built. --allow-stale-scip cannot retroactively see a file the index never indexed (there is no site data
    // for it at all) -- that is the whole point of the check: without it, this would read as "0 violations, all
    // clean" instead of "the index cannot be trusted for this repo state right now".
    const root = repo('fresh', { touchNewFile: true });
    writeFileSync(
      join(root, '.mole/decisions/0001-no-leaf.md'),
      RULE.replace('src/case_plain.py', 'src/case_new_violation.py'),
    );
    await expect(checkRules(root)).rejects.toThrow(/index\.scip is stale/);
    await expect(checkRules(root)).rejects.toThrow(/case_new_violation\.py/);
  });
});
