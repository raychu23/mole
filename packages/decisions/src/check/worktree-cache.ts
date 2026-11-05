// T102: a cached, reused detached `git worktree` per (repo root, purpose), replacing the unconditional
// `git worktree add` + full checkout + `git worktree remove` that `pr-check.ts` ran on EVERY call.
//
// Profiling (tasks/T102-prcheck-throughput/4 log/profile-before.md) found worktree add+remove to be 86-90% of
// this package's own git subprocess time on real commit ranges of this repo (~400-800ms each, twice per call --
// once for the records-at-merge-base checkout, again for the rules engine's at-head checkout when a decision
// record has a `rules:` item) -- by far the largest lever available without changing what prCheck reads.
//
// Why a real worktree (not `git show`/`git cat-file --batch` into memory, this task's other suggested option):
// anchors.ts's `checkAnchor` (used by flags.ts's computeFlags, which prCheck calls whenever recordsRoot === root)
// does `isFile`/`readFileSync` against `join(root, path)` for an ARBITRARY scope-anchor path anywhere in the
// repository, and rules/check.ts's dependency-cruiser cruise needs a real resolvable module graph on disk -- both
// need the whole tree, not just the record files, so a lazy per-blob read cannot replace it without rewriting
// those two call paths (out of this task's bounded scope; see '2 insights.md'). Reusing one worktree directory
// per (root, purpose) and re-pointing it at the new revision (`git checkout --detach -f`, one call) instead of
// recreating the worktree's administrative metadata every time keeps the exact same on-disk contract those
// readers rely on, at a fraction of the cost (checkout from one revision to a nearby one reuses most of git's
// internal index comparison; add/remove pays the FULL worktree registration + checkout + deregistration cost
// every time regardless of how close the two revisions are).
//
// Concurrency: a cached worktree is one shared directory, so two calls that need DIFFERENT revisions for the
// SAME (root, purpose) must not check out concurrently. `proper-lockfile` (already a dependency of this package;
// see priorities.ts's own header comment for why it was chosen over a hand-rolled mkdir mutex) serializes them;
// calls against different repo roots, or the same root's different purposes (records vs rules-at-head), never
// contend. This does trade same-repo prCheck concurrency for the removal of the per-call worktree cost -- stated
// as a deliberate tradeoff in tasks/T102-prcheck-throughput/2 insights.md, not a hidden one.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { lock as lockFile } from 'proper-lockfile';

const CACHE_ROOT = join(tmpdir(), 'mole-prcheck-worktree-cache');

function slotDir(root: string, purpose: string): string {
  const h = createHash('sha256').update(`${root}\0${purpose}`).digest('hex').slice(0, 20);
  return join(CACHE_ROOT, h);
}

function git(args: string[]): string {
  return timed(args, () => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 512 * 1024 * 1024 }));
}
function gitOrNull(args: string[]): string | null {
  try {
    return git(args);
  } catch {
    return null;
  }
}

// T102 profiling (same convention as pr-check.ts's own profileCalls): when MOLE_PRCHECK_PROFILE=1, every git
// subprocess this module spawns (worktree add/checkout/clean/remove) is timed and appended here.
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

function freshCheckout(root: string, dir: string, rev: string): void {
  rmSync(dir, { recursive: true, force: true });
  git(['-C', root, '-c', 'core.hooksPath=/dev/null', 'worktree', 'add', '--detach', '--force', '--quiet', dir, rev]);
}

/** Re-point an existing cached worktree at `rev`, recreating it from scratch only if the reuse itself fails (the
 *  repo was moved, a previous process's `git worktree remove` raced it, etc. -- recreating keeps prCheck working
 *  rather than failing the whole check over a cache-layer problem). `clean -fdx` after checkout guarantees the
 *  tree is byte-identical to a fresh `worktree add` at `rev`, undoing anything a previous use wrote into it (the
 *  rules-at-head purpose intentionally overwrites its own record paths with the merge base's copy; `checkout -f`
 *  already restores every TRACKED path to match `rev` exactly, `clean -fdx` removes stray untracked leftovers). */
function ensureCheckedOut(root: string, dir: string, rev: string): void {
  if (!existsSync(join(dir, '.git'))) {
    freshCheckout(root, dir, rev);
    return;
  }
  try {
    git(['-C', dir, '-c', 'core.hooksPath=/dev/null', 'checkout', '--detach', '--force', '--quiet', rev]);
    git(['-C', dir, 'clean', '-fdx', '-q']);
  } catch {
    try {
      gitOrNull(['-C', root, 'worktree', 'remove', '--force', dir]);
    } catch {
      // best effort; freshCheckout's rmSync clears the directory either way
    }
    freshCheckout(root, dir, rev);
  }
}

export interface CachedWorktree {
  dir: string;
  /** releases the cross-process lock; the worktree directory itself is kept for the next call (never removed) */
  release: () => Promise<void>;
}

/** Acquire the cached worktree for (root, purpose), checked out detached at `rev`. Caller must call `release()`
 *  (e.g. via prCheck's own `cleanups` array) once it is done reading from `dir`. `purpose` separates independent
 *  cached worktrees for the same repo (e.g. 'records' vs 'rules-head') so they never wait on each other and a
 *  stale revision from one is never read as the other's. */
export async function acquireCachedWorktree(root: string, purpose: string, rev: string): Promise<CachedWorktree> {
  mkdirSync(CACHE_ROOT, { recursive: true });
  const dir = slotDir(root, purpose);
  mkdirSync(dir, { recursive: true });
  const release = await lockFile(dir, { stale: 120_000, retries: { retries: 300, minTimeout: 10, maxTimeout: 150 } });
  try {
    ensureCheckedOut(root, dir, rev);
  } catch (e) {
    await release();
    throw e;
  }
  return { dir: realpathSync(dir), release };
}

/** Test/ops hook: drop every cached worktree under the shared tmp cache root (e.g. between test files that use
 *  different throwaway repos at the same path, or to reclaim disk). Never called by prCheck itself. */
export function clearWorktreeCache(): void {
  rmSync(CACHE_ROOT, { recursive: true, force: true });
}
