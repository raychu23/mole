// T102 review fix (FAIL deleg_4f165c05, tasks/T102-prcheck-throughput/4 log/review-1.md): the first cached-worktree
// design was a REAL registered `git worktree` living under `os.tmpdir()`. Findings: (1) CRITICAL -- slots were
// never removed (120 dirs / 55 MB from two test runs) and are orphaned forever if the origin repo is deleted
// (nothing references them back); (2) HIGH -- every slot is a registered worktree, so it shows up in
// `git worktree list` / an IDE's worktree panel forever; (3) MEDIUM -- a killed hook left a 120s-stale lock.
//
// Redesign, two independent parts:
//
// 1. LOCATION: the cache lives inside the repo's OWN git directory -- `git rev-parse --git-common-dir`
//    (git-rev-parse(1): the MAIN repo's `.git` even when `root` is itself a linked worktree, so every worktree of
//    one repo shares one cache) + `/mole/prcheck-cache/<slot>/`. It dies the moment the repo does (`rm -rf <repo>`
//    or `rm -rf .git/mole`), and it is never under a shared top-level temp directory.
// 2. REGISTRATION: `anchors.ts`'s `Git` class and `rules/check.ts`'s dependency-cruiser cruise both run their own
//    `git -C <recordsRoot> ...` (log/diff/show/rev-parse) against whatever directory `prCheck` hands them as the
//    checked-out tree -- they need a REAL, git-functional working directory, not just files on disk (see T102's
//    own `2 insights.md`). `git worktree add` gives that by writing an admin directory under
//    `$GIT_COMMON_DIR/worktrees/<name>/` and pointing the new directory's `.git` file at it -- but it is
//    EXACTLY that `$GIT_COMMON_DIR/worktrees/` registration that makes `git worktree list`/`prune` track it
//    forever (git-worktree(1)). Nothing in git's repository-resolution requires the admin directory to live
//    there, though: a `.git` FILE is just `gitdir: <path>`, and that admin directory just needs its own
//    `gitdir` (back-pointer), `commondir` (relative path to the shared object/ref store) and `HEAD` -- git
//    resolves a repository purely by following that chain (verified empirically: a hand-built admin directory
//    under OUR OWN cache slot, never placed under `$GIT_COMMON_DIR/worktrees/`, supports `checkout`/`log`/`show`/
//    `diff`/`rev-parse` exactly like a normal linked worktree, while `git worktree list` from the real repo never
//    lists it). That is what `ensureLinked` below builds once per slot; `checkoutInto` then reuses the EXACT
//    recipe the original (correctness-proven, only disk/registration-flagged) design used --
//    `checkout --detach --force` + `clean -fdx` -- which already removes every stray file not at `rev` without
//    any custom index bookkeeping.
// 3. LOCK: `proper-lockfile` (already a dependency; see priorities.ts's header) with `stale: 15_000` instead of
//    the old 120_000 -- its README: "the lockfile's mtime is periodically updated [via the `update` option,
//    default `stale/2`] to prevent staleness... allows to effectively check if a lock is stale by checking its
//    mtime against a stale threshold". A live holder's lock is kept fresh by that heartbeat and is never treated
//    as stale mid-checkout; a holder that is KILLED stops heartbeating and the lock is recognized stale (and
//    stolen) after at most ~15s, not 120s.
// 4. TAMPER SAFETY: before any destructive filesystem op on a slot, `assertSafeSlot` lstat+realpath-checks it: a
//    slot directory that has been replaced by a symlink (e.g. pointing at the repo's own worktree) is refused
//    rather than written into or removed through.
// 5. EVICTION: a slot's mtime is refreshed on every successful use; slots untouched for `MAX_PURPOSE_AGE_MS`, or
//    the oldest slots once the whole cache exceeds `MAX_CACHE_BYTES`, are removed before the next acquire -- a
//    size/age cap with no manual cleanup required (see also `clearWorktreeCache` for an explicit wipe, and
//    `docs/pr-check.md` for the `rm -rf .git/mole` escape hatch).
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readdirSync, realpathSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { lock as lockFile } from 'proper-lockfile';

/** Was 120_000 (T102 review finding 3): a killed hook now blocks the next caller for at most ~this long, since
 *  proper-lockfile's `update` heartbeat (default stale/2) keeps a LIVE holder's lock fresh regardless. */
export const STALE_MS = 15_000;
/** A slot unused for this long is evicted on the next acquire against this repo (any slot). */
const MAX_PURPOSE_AGE_MS = 14 * 24 * 60 * 60 * 1000;
/** Soft cap across all slots of one repo's cache; oldest-by-mtime slots are evicted first past this. */
const MAX_CACHE_BYTES = 500 * 1024 * 1024;

function git(args: string[]): string {
  return timed(args, () => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 512 * 1024 * 1024 }));
}

// T102 profiling (same convention as pr-check.ts's own profileCalls): when MOLE_PRCHECK_PROFILE=1, every git
// subprocess this module spawns (checkout/clean/log) is timed and appended here.
const PROFILE = process.env.MOLE_PRCHECK_PROFILE === '1';
export const profileCalls: Array<{ args: string[]; ms: number }> = [];
function timed<T>(args: string[], fn: () => T): T {
  if (!PROFILE) return fn();
  const t0 = performance.now();
  try {
    return fn();
  } finally {
    profileCalls.push({ args, ms: performance.now() - t0 });
  }
}

/** The repo's shared git directory (git-rev-parse(1) --git-common-dir): the MAIN repo's `.git` even when `root`
 *  is itself a linked worktree, so one cache serves every worktree of the same repo. */
function commonDir(root: string): string {
  const out = git(['-C', root, 'rev-parse', '--path-format=absolute', '--git-common-dir']).trim();
  return isAbsolute(out) ? out : resolve(root, out);
}

function cacheRootOf(root: string): string {
  return join(commonDir(root), 'mole', 'prcheck-cache');
}

/** `--git-common-dir` is shared by every LINKED WORKTREE of the same repo, so `purpose` alone ('records' /
 *  'rules-head') is not enough to key a slot -- two DIFFERENT worktrees of the same repo doing prCheck
 *  concurrently at DIFFERENT revisions would otherwise share, and stomp, the same slot. Fold in a short hash of
 *  the CALLING worktree's own real path so slots never collide across worktrees of one repo. */
function slotName(root: string, purpose: string): string {
  const safePurpose = purpose.replace(/[^a-zA-Z0-9_-]/g, '_') || 'default';
  const rootHash = createHash('sha256').update(realpathSync(root)).digest('hex').slice(0, 12);
  return `${safePurpose}-${rootHash}`;
}

/** Refuses to use `dir` as a cache path if it is a symlink, or if its real path escapes the cache root or
 *  resolves to the repository's own worktree root -- called before every destructive op (mkdir into it, checkout
 *  writing into it, rm of it) so a tampered slot can redirect nothing. */
function assertSafeSlot(dir: string, root: string, cacheRootReal: string): void {
  let st;
  try {
    st = lstatSync(dir);
  } catch {
    return; // does not exist yet: nothing to have been tampered with
  }
  if (st.isSymbolicLink()) {
    throw new Error(`mole prCheck cache: refusing ${dir}: it is a symlink, not a real directory`);
  }
  const real = realpathSync(dir);
  const rootReal = realpathSync(root);
  // the ordinary, SAFE location for the cache is under the repo's own .git dir, which is itself normally a
  // subdirectory of `root` -- so "inside root" is expected and not itself a problem. The actual attack this
  // guards against is a slot resolving to `root` ITSELF (or escaping the cache root entirely), which would make
  // checkout/clean/rm operate on the user's real working tree instead of the cache.
  if (real === rootReal) {
    throw new Error(`mole prCheck cache: refusing ${dir}: it resolves to the repository's own worktree root (${rootReal})`);
  }
  if (real !== cacheRootReal && !real.startsWith(cacheRootReal + sep)) {
    throw new Error(`mole prCheck cache: refusing ${dir}: it resolves outside the cache root (${cacheRootReal})`);
  }
}

/** Build the `admin`/`tree` pair that makes `tree` a real, git-functional linked worktree of `root`'s repo --
 *  WITHOUT registering it under `$GIT_COMMON_DIR/worktrees/` (see this file's header for why that is safe and
 *  sufficient). Idempotent: a no-op once both are already linked to the same common dir. */
function ensureLinked(root: string, admin: string, tree: string, rev: string): void {
  const gitFile = join(tree, '.git');
  const commondirFile = join(admin, 'commondir');
  if (existsSync(gitFile) && existsSync(commondirFile)) return; // already linked from a previous call
  rmSync(admin, { recursive: true, force: true });
  rmSync(tree, { recursive: true, force: true });
  mkdirSync(admin, { recursive: true });
  mkdirSync(tree, { recursive: true });
  const gitDirAbs = commonDir(root);
  writeFileSync(join(admin, 'gitdir'), `${tree}${sep}.git\n`);
  writeFileSync(join(admin, 'commondir'), `${relative(admin, gitDirAbs)}\n`);
  writeFileSync(join(admin, 'HEAD'), `${rev}\n`); // bootstrap only; the first checkout below overwrites it properly
  writeFileSync(gitFile, `gitdir: ${admin}\n`);
}

/** Re-point `tree` at `rev`: the SAME recipe the original design used (review-proven correct; only its disk
 *  location and worktree registration were the problem) -- `checkout --detach --force` then `clean -fdx` removes
 *  every file not tracked at `rev`, leaving `tree` byte-identical to a fresh checkout. */
// T102 review r2 CRITICAL: an unregistered attachment's HEAD is not a gc reachability root (gc walks refs, the
// main HEAD/index, reflogs and $GIT_COMMON_DIR/worktrees/*, git-gc(1) + gitrepository-layout(5)), so a checked-out
// commit that no branch reaches (a fetched PR head) could be pruned by `git gc --prune=now`. A plain ref is a root
// with no worktree registration: refs/mole/prcheck/<slot> always points at the slot's commit; eviction deletes it.
const PIN_PREFIX = 'refs/mole/prcheck/';
function pinRef(root: string, slotDir: string, rev: string): void {
  const commit = git(['-C', root, 'rev-parse', '--verify', '--quiet', `${rev}^{commit}`]).trim();
  git(['-C', root, 'update-ref', '-m', 'mole prcheck cache pin', `${PIN_PREFIX}${basename(slotDir)}`, commit]);
}
function unpinRef(root: string, slotName: string): void {
  try {
    git(['-C', root, 'update-ref', '-d', `${PIN_PREFIX}${slotName}`]);
  } catch {
    // already gone
  }
}

function checkoutInto(tree: string, rev: string): void {
  git(['-C', tree, '-c', 'core.hooksPath=/dev/null', 'checkout', '--detach', '--force', '--quiet', rev]);
  git(['-C', tree, 'clean', '-fdx', '-q']);
}

function ensureCheckedOut(root: string, admin: string, tree: string, rev: string): void {
  ensureLinked(root, admin, tree, rev);
  try {
    checkoutInto(tree, rev);
  } catch (e) {
    // the admin/tree pair was corrupted (e.g. a previous process was killed mid-checkout) -- rebuild from
    // scratch and retry once rather than failing the whole check over a cache-layer problem.
    try {
      rmSync(admin, { recursive: true, force: true });
      rmSync(tree, { recursive: true, force: true });
      mkdirSync(admin, { recursive: true });
      mkdirSync(tree, { recursive: true });
      ensureLinked(root, admin, tree, rev);
      checkoutInto(tree, rev);
    } catch {
      throw e;
    }
  }
}

function dirBytes(p: string): number {
  let st;
  try {
    st = lstatSync(p);
  } catch {
    return 0;
  }
  if (st.isSymbolicLink()) return 0;
  if (!st.isDirectory()) return st.size;
  let total = 0;
  for (const name of readdirSync(p)) total += dirBytes(join(p, name));
  return total;
}

/** Age/size-based eviction of other slots under this repo's cache root; never touches `keepSlot` (the one about
 *  to be used). Cheap: a repo normally has 1-2 slots per worktree (`records`, `rules-head`). */
function evict(root: string, cacheRoot: string, keepSlot: string): void {
  let names: string[];
  try {
    names = readdirSync(cacheRoot);
  } catch {
    return;
  }
  const now = Date.now();
  const infos: Array<{ path: string; mtimeMs: number; bytes: number }> = [];
  for (const name of names) {
    const p = join(cacheRoot, name);
    if (p === keepSlot) continue;
    let st;
    try {
      st = lstatSync(p);
    } catch {
      continue;
    }
    if (st.isSymbolicLink()) {
      rmSync(p, { force: true }); // a tampered/legacy entry: remove the link itself, never follow it
      continue;
    }
    if (now - st.mtimeMs > MAX_PURPOSE_AGE_MS) {
      rmSync(p, { recursive: true, force: true });
      unpinRef(root, name);
      continue;
    }
    infos.push({ path: p, mtimeMs: st.mtimeMs, bytes: dirBytes(p) });
  }
  let total = infos.reduce((s, i) => s + i.bytes, 0);
  if (total <= MAX_CACHE_BYTES) return;
  infos.sort((a, b) => a.mtimeMs - b.mtimeMs); // oldest first
  for (const i of infos) {
    if (total <= MAX_CACHE_BYTES) break;
    rmSync(i.path, { recursive: true, force: true });
    unpinRef(root, basename(i.path));
    total -= i.bytes;
  }
}

export interface CachedWorktree {
  dir: string;
  /** releases the cross-process lock; the slot's admin/tree are kept (never removed) for the next call */
  release: () => Promise<void>;
}

/** Acquire the cached slot for (root, purpose), its tree checked out at `rev`. Caller must call `release()`
 *  (e.g. via prCheck's own `cleanups` array) once it is done reading from `dir`. `purpose` separates independent
 *  slots for the same repo (e.g. 'records' vs 'rules-head') so they never wait on each other and a stale
 *  revision from one is never read as the other's. Never registers a `git worktree`: nothing this function does
 *  is visible in `git worktree list`. */
export async function acquireCachedWorktree(root: string, purpose: string, rev: string): Promise<CachedWorktree> {
  const cacheRoot = cacheRootOf(root);
  mkdirSync(cacheRoot, { recursive: true });
  const cacheRootReal = realpathSync(cacheRoot);
  const slot = join(cacheRoot, slotName(root, purpose));
  mkdirSync(slot, { recursive: true });
  assertSafeSlot(slot, root, cacheRootReal);
  evict(root, cacheRoot, slot);

  const admin = join(slot, 'admin');
  const tree = join(slot, 'tree');
  const release = await lockFile(slot, { stale: STALE_MS, update: Math.floor(STALE_MS / 2), retries: { retries: 300, minTimeout: 10, maxTimeout: 150 } });
  try {
    assertSafeSlot(admin, root, cacheRootReal);
    assertSafeSlot(tree, root, cacheRootReal);
    pinRef(root, slot, rev); // before checkout, so a concurrent gc can never prune the commit mid-checkout
    ensureCheckedOut(root, admin, tree, rev);
    utimesSync(slot, new Date(), new Date()); // mark as recently used so eviction leaves it alone
  } catch (e) {
    await release();
    throw e;
  }
  return { dir: realpathSync(tree), release };
}

/** Test/ops hook: drop this repo's whole prcheck cache (every slot, every worktree of this repo). Never called
 *  by prCheck itself; the equivalent from a shell is `rm -rf $(git rev-parse --git-common-dir)/mole` (see
 *  docs/pr-check.md). */
export function clearWorktreeCache(root: string): void {
  rmSync(cacheRootOf(root), { recursive: true, force: true });
  let refs = '';
  try {
    refs = git(['-C', root, 'for-each-ref', '--format=%(refname)', PIN_PREFIX]);
  } catch {
    return;
  }
  for (const ref of refs.split('\n').filter(Boolean)) unpinRef(root, ref.slice(PIN_PREFIX.length));
}
