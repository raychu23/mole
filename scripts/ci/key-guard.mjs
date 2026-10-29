#!/usr/bin/env node
// Key guard (T16, loop rule R2): every frozen bench key must equal its content in the commit that first added it
// (the task's checks-first commit). A changed or deleted key passes only with an approved ruling:
//   a file tasks/<T>/4 log/key-ruling-<n>.md that contains the word APPROVE and one line naming the key path
//   and the sha256 of its new content (for a deletion: the word "deleted").
// Keys = git-tracked files matching packages/*/bench/*-key.json, packages/*/bench/keys/*.json, apps/*/bench/*-key.json,
// plus any such path ever added in history (so a deleted key is caught).
// usage: node scripts/ci/key-guard.mjs [--root DIR]   exit 0 green, 1 a key changed without a ruling, 2 cannot check
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const i = process.argv.indexOf('--root');
const root = resolve(i >= 0 ? process.argv[i + 1] : process.cwd());
const PATHSPECS = [':(glob)packages/*/bench/*-key.json', ':(glob)packages/*/bench/keys/*.json', ':(glob)apps/*/bench/*-key.json'];

const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

function fail(code, msg) {
  console.error(`key guard: ${msg}`);
  process.exit(code);
}

try {
  git('rev-parse', '--git-dir');
} catch {
  fail(2, `${root} is not a git repository`);
}
if (git('rev-parse', '--is-shallow-repository').trim() === 'true') fail(2, 'shallow clone: the checks-first commits are not in history (CI: actions/checkout fetch-depth: 0)');

const tracked = git('ls-files', '-z', '--', ...PATHSPECS).split('\0').filter(Boolean);
const everAdded = git('log', '--diff-filter=A', '--name-only', '--format=', '--', ...PATHSPECS).split('\n').filter(Boolean);
const keys = [...new Set([...tracked, ...everAdded])].sort();

/** approved rulings: tasks/*\/4 log/key-ruling-*.md that say APPROVE */
const rulings = [];
const tasksDir = join(root, 'tasks');
if (existsSync(tasksDir)) {
  for (const t of readdirSync(tasksDir)) {
    const log = join(tasksDir, t, '4 log');
    if (!existsSync(log)) continue;
    for (const f of readdirSync(log)) {
      if (!/^key-ruling-[\w.-]*\.md$/.test(f)) continue;
      const text = readFileSync(join(log, f), 'utf8');
      if (/\bAPPROVE\b/.test(text)) rulings.push({ file: `tasks/${t}/4 log/${f}`, lines: text.split('\n') });
    }
  }
}
const ruledBy = (path, token) => rulings.find((r) => r.lines.some((l) => l.includes(path) && new RegExp(`(^|[^0-9a-f])${token}([^0-9a-f]|$)`).test(l)))?.file;

let bad = 0;
for (const path of keys) {
  // the first commit that added this path = its checks-first commit (oldest last)
  const first = git('log', '--diff-filter=A', '--format=%H', '--', path).trim().split('\n').filter(Boolean).at(-1);
  if (!first) {
    console.log(`ok       ${path}  (new, uncommitted)`);
    continue;
  }
  const subject = git('log', '-1', '--format=%s', first).trim();
  const frozen = execFileSync('git', ['-C', root, 'show', `${first}:${path}`], { maxBuffer: 256 * 1024 * 1024 });
  const where = `(checks-first ${first.slice(0, 7)} "${subject}")`;
  const file = join(root, path);
  if (!existsSync(file)) {
    const r = ruledBy(path, 'deleted');
    if (r) console.log(`ruled    ${path}  deleted, approved by ${r}  ${where}`);
    else {
      bad++;
      console.log(`DELETED  ${path}  ${where}: no approved ruling names it as deleted`);
    }
    continue;
  }
  const now = readFileSync(file);
  if (now.equals(frozen)) {
    console.log(`ok       ${path}  ${where}`);
    continue;
  }
  const h = sha256(now);
  const r = ruledBy(path, h);
  if (r) console.log(`ruled    ${path}  sha256 ${h} approved by ${r}  ${where}`);
  else {
    bad++;
    console.log(`CHANGED  ${path}  sha256 ${h} differs from ${where}; needs tasks/<T>/4 log/key-ruling-<n>.md with APPROVE and a line naming this path + sha256 (R2)`);
  }
}
console.log(`key guard: ${keys.length} keys, ${bad} changed without a ruling, ${rulings.length} approved ruling file(s)`);
process.exit(bad ? 1 : 0);
