// T95 review round-2 HIGH-1: `scipStaleness()` used to compare mtimes, which false-positives on every fresh
// `git clone`/CI checkout (checkout writes every file's mtime to "now" regardless of its committed content) --
// a committed `index.scip` always read as stale on a clean clone even with byte-identical content. This now
// compares content hashes against a manifest written by `mole scip stamp`, so a real `git clone` of a repo
// with a committed index + manifest is fresh, and only an actual content change is stale.
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { readScipIndex, stampScip } from '@mole/scip';
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

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' });
}

/** A fresh git repo seeded from the committed counter-fixture (its own committed index.scip + manifest), with a
 * decision rule added, committed as the repo's initial commit. */
function sourceRepo(): string {
  const root = mkdtempSync(join(tmpdir(), 'mole-scip-stale-src-'));
  cleanups.push(() => rmSync(root, { recursive: true, force: true }));
  cpSync(fixture, root, { recursive: true });
  mkdirSync(join(root, '.mole/decisions'), { recursive: true });
  writeFileSync(join(root, '.mole/decisions/0001-no-leaf.md'), RULE);
  git(root, 'init', '-q');
  git(root, 'config', 'user.email', 't@t');
  git(root, 'config', 'user.name', 't');
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'init');
  return root;
}

/** A real `git clone` of `src` -- the actual scenario the review's HIGH-1 is about: checkout writes every
 * file's mtime to "now", so only a content-hash comparison (not mtime) can tell this apart from "stale". */
function cloneRepo(src: string): string {
  const dst = mkdtempSync(join(tmpdir(), 'mole-scip-stale-clone-'));
  cleanups.push(() => rmSync(dst, { recursive: true, force: true }));
  execFileSync('git', ['clone', '-q', src, dst]);
  return dst;
}

const indexOf = (root: string) => readScipIndex(join(root, 'index.scip'));

describe('SCIP staleness detection (T95 review round-2 HIGH-1: content hashes, not mtimes)', () => {
  it('a fresh `git clone` of a repo with a committed index.scip + manifest is not stale', () => {
    const cloned = cloneRepo(sourceRepo());
    expect(scipStaleness(cloned, join(cloned, 'index.scip'), indexOf(cloned))).toEqual({ stale: false, reasons: [] });
  });

  it('editing a source file\'s content makes the index stale', () => {
    const cloned = cloneRepo(sourceRepo());
    const p = join(cloned, 'src/case_plain.py');
    writeFileSync(p, `${readFileSync(p, 'utf8')}\n# edited\n`);
    const r = scipStaleness(cloned, join(cloned, 'index.scip'), indexOf(cloned));
    expect(r.stale).toBe(true);
    expect(r.reasons.some((x) => x.includes('case_plain.py') && x.includes('content changed'))).toBe(true);
  });

  it('touching a file (mtime only, content unchanged) stays fresh -- mtime is not used at all', () => {
    const cloned = cloneRepo(sourceRepo());
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000);
    utimesSync(join(cloned, 'src/case_plain.py'), future, future);
    utimesSync(join(cloned, 'index.scip'), new Date(Date.now() - 24 * 60 * 60 * 1000), new Date(Date.now() - 24 * 60 * 60 * 1000));
    expect(scipStaleness(cloned, join(cloned, 'index.scip'), indexOf(cloned))).toEqual({ stale: false, reasons: [] });
  });

  it('a new source file added since stamping makes the index stale', () => {
    const cloned = cloneRepo(sourceRepo());
    writeFileSync(join(cloned, 'src/case_new.py'), 'from src.pkg.leaf import helper\n\nx = helper()\n');
    const r = scipStaleness(cloned, join(cloned, 'index.scip'), indexOf(cloned));
    expect(r.stale).toBe(true);
    expect(r.reasons.some((x) => x.includes('case_new.py') && x.includes('not in the manifest'))).toBe(true);
  });

  it('removing a source file the manifest covers makes the index stale', () => {
    const cloned = cloneRepo(sourceRepo());
    rmSync(join(cloned, 'src/pkg/other.py'));
    const r = scipStaleness(cloned, join(cloned, 'index.scip'), indexOf(cloned));
    expect(r.stale).toBe(true);
    expect(r.reasons.some((x) => x.includes('other.py') && x.includes('missing on disk'))).toBe(true);
  });

  it('no manifest at all is "stale-unknown": fails loud and names `mole scip stamp`', () => {
    const cloned = cloneRepo(sourceRepo());
    rmSync(join(cloned, 'index.scip.manifest.json'));
    const r = scipStaleness(cloned, join(cloned, 'index.scip'), indexOf(cloned));
    expect(r.stale).toBe(true);
    expect(r.reasons.join('\n')).toMatch(/no manifest/);
    expect(r.reasons.join('\n')).toMatch(/mole scip stamp/);
  });

  it('a manifest whose indexSha256 does not match the current index.scip (re-indexed, not re-stamped) is "stale-unknown"', () => {
    const cloned = cloneRepo(sourceRepo());
    const mPath = join(cloned, 'index.scip.manifest.json');
    const m = JSON.parse(readFileSync(mPath, 'utf8')) as { indexSha256: string };
    m.indexSha256 = 'f'.repeat(64);
    writeFileSync(mPath, JSON.stringify(m));
    const r = scipStaleness(cloned, join(cloned, 'index.scip'), indexOf(cloned));
    expect(r.stale).toBe(true);
    expect(r.reasons.join('\n')).toMatch(/does not match/);
    expect(r.reasons.join('\n')).toMatch(/mole scip stamp/);
  });

  it('checkRules throws StaleScipIndexError (not a silent 0-violation pass) when there is no manifest', () => {
    const cloned = cloneRepo(sourceRepo());
    rmSync(join(cloned, 'index.scip.manifest.json'));
    return expect(checkRules(cloned)).rejects.toThrow(StaleScipIndexError);
  });

  it('rulesCli exits 3 (distinct from 0 clean / 1 violations / 2 rule errors) with a clear message', async () => {
    const cloned = cloneRepo(sourceRepo());
    rmSync(join(cloned, 'index.scip.manifest.json'));
    const errs: string[] = [];
    const origErr = console.error;
    const origLog = console.log;
    console.error = (...a: unknown[]) => void errs.push(a.join(' '));
    console.log = () => {};
    try {
      expect(await rulesCli([], {}, cloned)).toBe(3);
    } finally {
      console.error = origErr;
      console.log = origLog;
    }
    expect(errs.join('\n')).toMatch(/index\.scip is stale/);
    expect(errs.join('\n')).toMatch(/mole scip stamp/);
  });

  it('--allow-stale-scip overrides and still catches the real violation, with no manifest at all', async () => {
    const cloned = cloneRepo(sourceRepo());
    rmSync(join(cloned, 'index.scip.manifest.json'));
    const r = await checkRules(cloned, { allowStaleScip: true });
    expect(r.violations.find((v) => v.file === 'src/case_plain.py' && v.target === 'src/pkg/leaf.py')).toBeTruthy();
  });

  it('a stale index that would otherwise hide a NEW violation fails loudly instead of reporting 0 violations', async () => {
    const cloned = cloneRepo(sourceRepo());
    writeFileSync(join(cloned, 'src/case_new_violation.py'), 'from src.pkg.leaf import helper\n\nx = helper()\n');
    writeFileSync(join(cloned, '.mole/decisions/0001-no-leaf.md'), RULE.replace('src/case_plain.py', 'src/case_new_violation.py'));
    await expect(checkRules(cloned)).rejects.toThrow(/index\.scip is stale/);
    await expect(checkRules(cloned)).rejects.toThrow(/case_new_violation\.py/);
  });

  it('`mole scip stamp` (stampScip) makes a just-indexed-but-never-stamped repo fresh', () => {
    const cloned = cloneRepo(sourceRepo());
    rmSync(join(cloned, 'index.scip.manifest.json'));
    expect(scipStaleness(cloned, join(cloned, 'index.scip'), indexOf(cloned)).stale).toBe(true);
    stampScip(cloned, join(cloned, 'index.scip'));
    expect(scipStaleness(cloned, join(cloned, 'index.scip'), indexOf(cloned))).toEqual({ stale: false, reasons: [] });
  });

  it('5,000 ignored files in .venv do not slow down the staleness check (git respects .gitignore)', () => {
    const src = sourceRepo();
    writeFileSync(join(src, '.gitignore'), '.venv/\n');
    git(src, 'add', '-A');
    git(src, 'commit', '-q', '-m', 'gitignore');
    const cloned = cloneRepo(src);
    mkdirSync(join(cloned, '.venv/pkg'), { recursive: true });
    for (let i = 0; i < 5000; i++) writeFileSync(join(cloned, `.venv/pkg/mod${i}.py`), 'x = 1\n');
    const t0 = Date.now();
    const r = scipStaleness(cloned, join(cloned, 'index.scip'), indexOf(cloned));
    const ms = Date.now() - t0;
    expect(r).toEqual({ stale: false, reasons: [] });
    expect(ms).toBeLessThan(3000);
  });
});
