// T102 identical-output proof: run OLD prCheck (main's compiled dist, pre-T102) and NEW prCheck (this branch's
// compiled dist) on (a) the repo's own pr-check test fixture scenarios and (b) 20 real commit ranges of this very
// repo, and diff the JSON (minus the `ms` wall-clock field, which is a timing measurement, not a decided result).
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { strict as assert } from 'node:assert';
import { fileURLToPath } from 'node:url';

const OLD_MODULE = '/Users/a1/Desktop/CS Code/Project/Mole/packages/decisions/dist/src/check/pr-check.js';
const NEW_MODULE = fileURLToPath(new URL('../../../packages/decisions/dist/src/check/pr-check.js', import.meta.url));
const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url)).replace(/\/$/, '');

const { prCheck: prCheckOld } = await import(OLD_MODULE);
const { prCheck: prCheckNew } = await import(NEW_MODULE);

function strip(r) {
  const { ms, ...rest } = r;
  return JSON.stringify(rest);
}

const results = { fixture: [], real: [] };
let mismatches = 0;

async function compare(label, opts) {
  let a, b, err;
  try {
    [a, b] = await Promise.all([prCheckOld(opts), prCheckNew(opts)]);
  } catch (e) {
    err = String(e);
  }
  const identical = !err && strip(a) === strip(b);
  if (!identical) mismatches++;
  const entry = { label, opts: { ...opts }, identical, error: err ?? null };
  if (!identical && !err) {
    entry.oldJson = strip(a);
    entry.newJson = strip(b);
  }
  return entry;
}

// ---- (a) the existing pr-check.test.ts fixture scenarios, rebuilt identically here
const git = (root, ...args) => execFileSync('git', ['-C', root, '-c', 'user.name=T', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', ...args], { encoding: 'utf8' }).trim();
function write(root, rel, text) {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), text);
}
const A_TS = `export function foo(x: number): number {\n  const y = x + 1;\n  return y * 2;\n}\n\nexport function bar(s: string): string {\n  return s.trim();\n}\n`;
const OLD_TS = `// old helper\nexport const one = 1;\nexport const two = 2;\nexport const three = 3;\nexport const four = 4;\n`;
const rec = (id, status, scope) => `---\nid: '${id}'\ntitle: Record ${id}\nstatus: ${status}\nscope:\n${scope.map((s) => `  - ${s}`).join('\n')}\n---\n\n## Decision\n\nRecord ${id}.\n`;

const fixRoot = mkdtempSync(join(tmpdir(), 'mole-t102-fixture-'));
try {
  git(fixRoot, 'init', '-q', '-b', 'main');
  write(fixRoot, '.github/CODEOWNERS', ['* @team/all', '/src/ @team/src', 'src/a.ts', 'docs/ @team/docs', '**/*.md @team/md', ''].join('\n'));
  write(fixRoot, 'src/a.ts', A_TS);
  write(fixRoot, 'src/b.ts', 'export const b = 1;\n');
  write(fixRoot, 'lib/old.ts', OLD_TS);
  write(fixRoot, 'docs/x.md', '# X\n\nSome text.\n');
  write(fixRoot, 'pkg/c.ts', 'export const c = 3;\n');
  write(fixRoot, '.mole/decisions/0001-foo.md', rec('0001', 'accepted', ['src/a.ts#foo']));
  write(fixRoot, '.mole/decisions/0002-lib.md', rec('0002', 'accepted', ['lib/old.ts']));
  write(fixRoot, '.mole/decisions/0003-docs.md', rec('0003', 'superseded', ['docs/x.md']));
  write(fixRoot, '.mole/decisions/0004-pkg.md', rec('0004', 'accepted', ['pkg/']));
  git(fixRoot, 'add', '-A');
  git(fixRoot, 'commit', '-q', '-m', 'base');
  const base = git(fixRoot, 'rev-parse', 'HEAD');
  const pr = (name, edit) => {
    git(fixRoot, 'checkout', '-q', '-b', name, base);
    edit();
    git(fixRoot, 'add', '-A');
    git(fixRoot, 'commit', '-q', '-m', name);
    const sha = git(fixRoot, 'rev-parse', 'HEAD');
    git(fixRoot, 'checkout', '-q', base);
    return sha;
  };
  const heads = {
    foo: pr('edit-foo', () => {
      write(fixRoot, 'src/a.ts', A_TS.replace('x + 1', 'x + 2'));
      write(fixRoot, 'src/b.ts', 'export const b = 2;\n');
    }),
    bar: pr('edit-bar', () => write(fixRoot, 'src/a.ts', A_TS.replace('s.trim()', 's.trim().toLowerCase()'))),
    docs: pr('edit-docs', () => write(fixRoot, 'docs/x.md', '# X\n\nOther text.\n')),
    rename: pr('rename-lib', () => {
      git(fixRoot, 'mv', 'lib/old.ts', 'lib/new.ts');
      write(fixRoot, 'lib/new.ts', OLD_TS.replace('// old helper', '// new helper'));
    }),
    pkg: pr('add-pkg', () => write(fixRoot, 'pkg/new.ts', 'export const n = 1;\n')),
    dropFoo: pr('drop-foo', () => write(fixRoot, 'src/a.ts', A_TS.split('\n').slice(5).join('\n'))),
  };
  for (const [name, head] of Object.entries(heads)) {
    results.fixture.push(await compare(`fixture:${name}`, { root: fixRoot, base, head, history: true }));
  }
} finally {
  rmSync(fixRoot, { recursive: true, force: true });
}

// ---- (b) 20 real commit ranges of this repo
const log = git(REPO_ROOT, 'log', '--format=%H', '-n', '400');
const shas = log.split('\n').filter(Boolean);
const ranges = [];
for (let i = 2; i < shas.length && ranges.length < 20; i += Math.floor(shas.length / 20) || 1) {
  ranges.push({ head: shas[0], base: shas[i] });
}
for (const r of ranges) {
  results.real.push(await compare(`real:${r.base.slice(0, 7)}..${r.head.slice(0, 7)}`, { root: REPO_ROOT, base: r.base, head: r.head, history: true }));
}

const outPath = new URL('./identical-output-results.json', import.meta.url);
writeFileSync(outPath, JSON.stringify(results, null, 2));

const total = results.fixture.length + results.real.length;
console.log(`=== T102 identical-output check: ${total} comparisons (fixture ${results.fixture.length}, real ${results.real.length}) ===`);
for (const r of [...results.fixture, ...results.real]) console.log(`  ${r.identical ? 'OK  ' : 'DIFF'} ${r.label}${r.error ? ` (error: ${r.error})` : ''}`);
console.log(`\nmismatches: ${mismatches} / ${total}`);
console.log(`full results: ${outPath.pathname}`);
assert.equal(mismatches, 0, `${mismatches} of ${total} comparisons differ between old and new prCheck`);
console.log('PASS: old and new prCheck produce IDENTICAL results on every comparison.');
