// T102 review fix (FAIL deleg_4f165c05): worktree-cache.ts no longer registers a `git worktree` or lives under
// os.tmpdir() -- these tests prove the redesign's specific claims, one per review finding.
import { execFileSync, fork } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { prCheck } from '../src/index.js';
import { acquireCachedWorktree, clearWorktreeCache, STALE_MS } from '../src/check/worktree-cache.js';

const require = createRequire(import.meta.url);

const git = (root: string, ...args: string[]) =>
  execFileSync('git', ['-C', root, '-c', 'user.name=T', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', ...args], { encoding: 'utf8' }).trim();
const write = (root: string, rel: string, text: string) => {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), text);
};
const rec = (id: string, scope: string[]) => `---\nid: '${id}'\ntitle: Record ${id}\nstatus: accepted\nscope:\n${scope.map((s) => `  - ${s}`).join('\n')}\n---\n\n## Decision\n\nRecord ${id}.\n`;

function makeRepo(): { root: string; base: string; head: string } {
  const root = mkdtempSync(join(tmpdir(), 'mole-worktree-cache-test-'));
  git(root, 'init', '-q', '-b', 'main');
  write(root, 'src/a.ts', 'export const a = 1;\n');
  write(root, '.mole/decisions/0001-a.md', rec('0001', ['src/a.ts']));
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'base');
  const base = git(root, 'rev-parse', 'HEAD');
  write(root, 'src/a.ts', 'export const a = 2;\n');
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'edit');
  const head = git(root, 'rev-parse', 'HEAD');
  return { root, base, head };
}

const tmpSnapshot = () => new Set(readdirSync(tmpdir()));

let repos: string[] = [];
afterEach(() => {
  for (const r of repos.splice(0)) rmSync(r, { recursive: true, force: true });
});

describe('T102 review fix: cache location and worktree registration', () => {
  it('never registers a git worktree (finding 2)', async () => {
    const { root, base, head } = makeRepo();
    repos.push(root);
    const countNow = () => execFileSync('git', ['-C', root, 'worktree', 'list'], { encoding: 'utf8' }).trim().split('\n').length;
    expect(countNow()).toBe(1);
    await prCheck({ root, base, head, history: false });
    await prCheck({ root, base, head, history: false });
    expect(countNow()).toBe(1);
  });

  it('creates nothing under os.tmpdir() (finding 1): transient dirs it does create are gone by the time it returns', async () => {
    const { root, base, head } = makeRepo();
    repos.push(root);
    const before = tmpSnapshot();
    await prCheck({ root, base, head, history: true }); // also exercises the (separately cleaned-up) mkdtemp'd diff/history dir
    // tolerate OTHER concurrently-running test files' own transient `mole-pr-check-*`/`mole-pr-records-*` dirs
    // (same shared os.tmpdir(), different process/call) by polling briefly for them to settle -- a genuine leak
    // from THIS call would persist indefinitely, a concurrent file's own in-flight temp dir resolves in ms.
    const prefixes = ['mole-pr-check-', 'mole-pr-records-', 'mole-prcheck-worktree-cache']; // the last is the OLD leaky name (finding 1)
    const deadline = Date.now() + 2_000;
    let leaked: string[] = [];
    do {
      const after = tmpSnapshot();
      leaked = [...after].filter((x) => !before.has(x) && prefixes.some((p) => x.startsWith(p)));
      if (leaked.length === 0) break;
      await new Promise((r) => setTimeout(r, 50));
    } while (Date.now() < deadline);
    expect(leaked).toEqual([]);
    expect(existsSync(join(tmpdir(), 'mole-prcheck-worktree-cache'))).toBe(false); // the old leak path must never exist at all
  });

  it('lives inside the repo\'s own .git dir and dies with the repo (finding 1)', async () => {
    const { root, base, head } = makeRepo();
    const gitCommonDir = git(root, 'rev-parse', '--path-format=absolute', '--git-common-dir');
    await prCheck({ root, base, head, history: false });
    const cache = join(gitCommonDir, 'mole', 'prcheck-cache');
    expect(existsSync(cache)).toBe(true);
    expect(readdirSync(cache).length).toBeGreaterThan(0);
    rmSync(root, { recursive: true, force: true }); // "deleting the repo"
    expect(existsSync(cache)).toBe(false); // nothing left behind outside the deleted repo
  });

  it('clearWorktreeCache(root) removes only this repo\'s cache', async () => {
    const { root, base, head } = makeRepo();
    repos.push(root);
    await prCheck({ root, base, head, history: false });
    const gitCommonDir = git(root, 'rev-parse', '--path-format=absolute', '--git-common-dir');
    const cache = join(gitCommonDir, 'mole', 'prcheck-cache');
    expect(existsSync(cache)).toBe(true);
    clearWorktreeCache(root);
    expect(existsSync(cache)).toBe(false);
  });
});

describe('T102 review fix: symlink tamper refusal', () => {
  it('refuses a slot tampered into a symlink pointing at the main worktree', async () => {
    const { root, base, head } = makeRepo();
    repos.push(root);
    await prCheck({ root, base, head, history: false }); // populate the 'records' slot normally first
    const gitCommonDir = git(root, 'rev-parse', '--path-format=absolute', '--git-common-dir');
    const cacheDir = join(gitCommonDir, 'mole', 'prcheck-cache');
    const slotDirName = readdirSync(cacheDir).find((n) => n.startsWith('records-'));
    if (!slotDirName) throw new Error(`no 'records-*' slot found in ${cacheDir}`);
    const slot = join(cacheDir, slotDirName);
    const treeDir = join(slot, 'tree');
    rmSync(treeDir, { recursive: true, force: true });
    symlinkSync(root, treeDir); // tamper: point the cached "tree" at the repo's real worktree
    const before = readdirSync(root).sort();
    await expect(acquireCachedWorktree(root, 'records', head)).rejects.toThrow(/symlink/);
    // refusing happened before any destructive op: the real worktree is untouched
    expect(readdirSync(root).sort()).toEqual(before);
  });
});

describe('T102 review fix: lock stale window (finding 3)', () => {
  it('a lock left by a killed process recovers within STALE_MS, not the old 120s', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mole-lock-test-'));
    repos.push(dir);
    const slot = join(dir, 'slot');
    mkdirSync(slot, { recursive: true });
    const childScript = `
      const { lock } = require(${JSON.stringify(require.resolve('proper-lockfile'))});
      lock(process.argv[2], { stale: ${STALE_MS}, update: ${Math.floor(STALE_MS / 2)}, retries: 0 }).then(() => {
        process.send('locked');
        setInterval(() => {}, 1000); // hold the lock until killed; never releases
      }).catch((e) => { process.send('error:' + e); process.exit(1); });
    `;
    const scriptPath = join(dir, 'child.cjs');
    writeFileSync(scriptPath, childScript);
    const child = fork(scriptPath, [slot], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
    const msg: string = await new Promise((resolve) => child.once('message', (m) => resolve(String(m))));
    expect(msg).toBe('locked');
    const killedAt = Date.now();
    child.kill('SIGKILL');
    const { lock } = await import('proper-lockfile');
    const release = await lock(slot, { stale: STALE_MS, update: Math.floor(STALE_MS / 2), retries: { retries: 200, minTimeout: 50, maxTimeout: 200 } });
    const elapsedMs = Date.now() - killedAt;
    expect(elapsedMs).toBeLessThan(STALE_MS + 3_000); // recovered within the stale window + retry slack, not 120s
    await release();
  }, 25_000);
});
