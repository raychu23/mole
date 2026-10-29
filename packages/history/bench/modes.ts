// T12 added check (loop rule R2 allows new tests; the red-commit checks stay unchanged).
// The red bench's contract item 'dw1 worktree + diff-file modes' expects the fix on a line whose base-side
// version was last written by a later non-fix commit (see tasks/T12-l2-why-and-past-fixes/4 log/key-changes.md).
// This script checks the same three entry points (check() worktree, check() diff file, CLI --worktree / --diff)
// on a regression whose edited line the fix really last wrote. Exit 0 = all pass.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { check, type CheckResult } from '../src/index.js';

const cliPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../../daemon/dist/cli.js');
const ENV = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
const git = (root: string, ...a: string[]) => execFileSync('git', ['-C', root, ...a], { encoding: 'utf8', env: ENV }).trim();
const shas = (r: CheckResult) => r.hunks.flatMap((h) => h.pastFixes.map((f) => f.sha));

async function main(): Promise<number> {
  const tmp = mkdtempSync(join(tmpdir(), 'mole-history-modes-'));
  const fails: string[] = [];
  try {
    const root = join(tmp, 'r');
    mkdirSync(join(root, 'src'), { recursive: true });
    git(root, 'init', '-q', '-b', 'main');
    const put = (t: string) => writeFileSync(join(root, 'src/load.ts'), t);
    put('export function load(x: string | null): string {\n  const v = x;\n  return v.trim();\n}\n');
    git(root, 'add', '-A');
    git(root, 'commit', '-q', '-m', 'feat: loader');
    put("export function load(x: string | null): string {\n  // null input used to crash the loader\n  const v = x ?? '';\n  return v.trim();\n}\n");
    git(root, 'commit', '-q', '-am', 'fix: loader crashed on null input');
    const fix = git(root, 'rev-parse', 'HEAD');
    // the regression: the fixed line goes back to the crashing version, uncommitted
    put('export function load(x: string | null): string {\n  // null input used to crash the loader\n  const v = x;\n  return v.trim();\n}\n');
    const diffFile = join(tmp, 'regression.diff');
    writeFileSync(diffFile, git(root, 'diff', 'HEAD') + '\n');

    const wt = await check(root, { worktree: true });
    if (!shas(wt).includes(fix)) fails.push('check() worktree');
    const cw = spawnSync(process.execPath, [cliPath, 'check', '--worktree', '--root', root], { encoding: 'utf8' });
    if (cw.status !== 0 || !cw.stdout.includes(`source: ${fix} src/load.ts:3`)) fails.push(`CLI --worktree: ${cw.stdout}`);
    git(root, 'checkout', '-q', '--', '.');
    const d = await check(root, { diffFile, base: 'HEAD' });
    if (!shas(d).includes(fix)) fails.push('check() diff file');
    const cd = spawnSync(process.execPath, [cliPath, 'check', '--diff', diffFile, '--base', 'HEAD', '--root', root], { encoding: 'utf8' });
    if (cd.status !== 0 || !cd.stdout.includes(`source: ${fix} src/load.ts:3`)) fails.push(`CLI --diff: ${cd.stdout}`);
    // the read-only promise: worktree and diff modes leave the repo clean
    if (git(root, 'status', '--porcelain') !== '') fails.push('repo left dirty');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  console.log(fails.length ? `modes: FAIL ${fails.join('; ')}` : 'modes: worktree + diff-file (API and CLI) find the fix: pass');
  return fails.length ? 1 : 0;
}

main().then((c) => process.exit(c));
