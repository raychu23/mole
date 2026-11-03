// T65: the working tree (tracked edits, staged changes, untracked files) as a commit object, so the cascade -- which
// diffs two commits -- can check work that is not committed yet. Built with a TEMPORARY index file
// (GIT_INDEX_FILE), so the user's index, refs, HEAD and files are never touched; the only write is unreferenced
// objects in the object store (pruned by git gc like any dangling object). `.mole/` is left out: records are the
// rules, not the code under check. Prior art: `git stash create` builds the same kind of unreferenced commit.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface WorktreeSnapshot {
  /** HEAD at snapshot time */
  base: string;
  /** a commit whose tree is the working tree (minus .mole/); === base when nothing changed */
  head: string;
}

export function snapshotWorktree(root: string): WorktreeSnapshot {
  const run = (args: string[], env: NodeJS.ProcessEnv = process.env) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', env, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const base = run(['rev-parse', '--verify', 'HEAD']);
  const dir = mkdtempSync(join(tmpdir(), 'mole-snap-'));
  try {
    const env = { ...process.env, GIT_INDEX_FILE: join(dir, 'index') };
    run(['read-tree', base], env);
    run(['add', '-A', '--', '.', ':(exclude).mole'], env);
    const tree = run(['write-tree'], env);
    const baseTree = run(['rev-parse', `${base}^{tree}`]);
    if (tree === baseTree) return { base, head: base };
    const cenv = { ...env, GIT_AUTHOR_NAME: 'mole', GIT_AUTHOR_EMAIL: 'mole@localhost', GIT_COMMITTER_NAME: 'mole', GIT_COMMITTER_EMAIL: 'mole@localhost' };
    const head = execFileSync('git', ['-C', root, 'commit-tree', tree, '-p', base, '-m', 'mole worktree snapshot'], { encoding: 'utf8', env: cenv }).trim();
    return { base, head };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
