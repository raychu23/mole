// Copied from the red-commit draft (8297d8a: tasks/T12-l2-why-and-past-fixes/proposed-tests/history.test.ts.txt) with only
// the two edits key ruling 1 allowed (4 log/key-ruling-1.md). The draft stayed outside test/ because of a test-write gate.
//
// T12 red tests: done-when 1 (per-hunk past fixes with reason + tests + source, sha/diff/worktree modes, CLI text and --json),
// 3 (planted regression B3 against the real Mole object store at bdeff14, read-only) and 6 (empty cases print
// 'no past fixes on these lines', exit 0). Written before the implementation (loop rule R1/R2).
import { afterAll, describe, expect, it } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { check, formatCheck, modelCalls, NO_PAST_FIXES, type CheckResult, type PastFix } from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const CLI = resolve(here, '../../daemon/dist/cli.js');
const PLANTED = resolve(here, '../bench/fixtures/planted-m8.diff');
const cleanups: Array<() => void> = [];
afterAll(() => cleanups.forEach((f) => f()));

const ENV = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
const git = (root: string, ...args: string[]): string => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', env: ENV }).trim();

function tmpRepo(): string {
  const root = mkdtempSync(join(tmpdir(), 'mole-history-'));
  cleanups.push(() => rmSync(root, { recursive: true, force: true }));
  git(root, 'init', '-q', '-b', 'main');
  return root;
}
function write(root: string, file: string, text: string): void {
  mkdirSync(dirname(join(root, file)), { recursive: true });
  writeFileSync(join(root, file), text);
}
function commit(root: string, msg: string): string {
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', msg);
  return git(root, 'rev-parse', 'HEAD');
}

const BASE = ['export function load(x: string | null): string {', '  const v = x;', '  return v.trim();', '}', 'export const other = 1;', ''].join('\n');
const FIXED = ['export function load(x: string | null): string {', '  // null input used to crash the loader: treat it as empty', "  const v = x ?? '';", '  return v.trim();', '}', 'export const other = 1;', ''].join('\n');

/** repo: base commit, a fix commit (with body + a test it adds), then a feature commit that edits the fixed line */
function fixtureRepo(): { root: string; base: string; fix: string; feat: string } {
  const root = tmpRepo();
  write(root, 'src/load.ts', BASE);
  write(root, 'README.md', 'demo\n');
  const base = commit(root, 'feat: loader');
  write(root, 'src/load.ts', FIXED);
  write(root, 'test/load.test.ts', "import { describe, it } from 'vitest';\ndescribe('load (null input)', () => {\n  it('treats null as empty', () => {});\n});\n");
  const fix = commit(root, 'fix: loader crashed on null input\n\nA null config value reached trim() and threw.\n\nSigned-off-by: t <t@t>');
  write(root, 'src/load.ts', FIXED.replace("x ?? ''", "x ?? 'default'"));
  const feat = commit(root, 'feat: default value for the loader');
  return { root, base, fix, feat };
}

const allFixes = (r: CheckResult): PastFix[] => r.hunks.flatMap((h) => h.pastFixes);

describe('mole check: past fixes per hunk (T12 done-when 1)', () => {
  it('sha mode: names the fix that last wrote the edited line, with reason, guarding test and a clickable source', async () => {
    const { root, fix, feat } = fixtureRepo();
    const r = await check(root, { sha: feat });
    expect(r.noPastFixes).toBe(false);
    expect(r.hunks).toHaveLength(1);
    const h = r.hunks[0]!;
    expect(h.file).toBe('src/load.ts');
    expect(h.oldStart).toBe(3);
    expect(h.oldLines).toBe(1);
    const f = h.pastFixes[0]!;
    expect(f.sha).toBe(fix);
    expect(f.shortSha).toBe(fix.slice(0, 7));
    expect(f.subject).toBe('fix: loader crashed on null input');
    expect(f.reason).toContain('loader crashed on null input');
    expect(f.reason).toContain('A null config value reached trim() and threw.');
    expect(f.reason).not.toContain('Signed-off-by');
    // the comment the fix added next to the line is part of the why
    expect(f.reason).toContain('null input used to crash the loader');
    expect(f.tests.map((t) => t.file)).toContain('test/load.test.ts');
    expect(f.tests.find((t) => t.file === 'test/load.test.ts')?.names ?? []).toContain('load (null input)');
    expect(f.source).toEqual({ sha: fix, file: 'src/load.ts', line: 3 });
    expect(f.lines).toEqual([3]);
    expect(modelCalls.count).toBe(0);
  });

  it('text output: per hunk file:range, then each fix with why, tests and source', async () => {
    const { root, fix, feat } = fixtureRepo();
    const out = formatCheck(await check(root, { sha: feat }));
    expect(out).toContain('src/load.ts:3');
    expect(out).toContain(`${fix.slice(0, 7)} fix: loader crashed on null input`);
    expect(out).toMatch(/why: .*loader crashed on null input/);
    expect(out).toMatch(/tests: .*test\/load\.test\.ts/);
    expect(out).toContain(`source: ${fix} src/load.ts:3`);
  });

  it('diff-file mode against a base, and working-tree mode, find the same fix', async () => {
    const { root, fix } = fixtureRepo();
    git(root, 'checkout', '-q', fix); // key ruling 1 (4 log/key-ruling-1.md): regress a line the fix last wrote
    // revert the fixed line in the working tree (a regression)
    write(root, 'src/load.ts', FIXED.replace("x ?? ''", 'x'));
    const wt = await check(root, { worktree: true });
    expect(wt.change.kind).toBe('worktree');
    expect(allFixes(wt).map((f) => f.sha)).toContain(fix);
    const diffFile = `${root}.diff`;
    writeFileSync(diffFile, git(root, 'diff', 'HEAD') + '\n');
    cleanups.push(() => rmSync(diffFile, { force: true }));
    git(root, 'checkout', '-q', '--', '.');
    const d = await check(root, { diffFile, base: 'HEAD' });
    expect(d.change.kind).toBe('diff');
    expect(allFixes(d).map((f) => f.sha)).toContain(fix);
  });

  it('the fix rule is configurable (option and .mole/config.json)', async () => {
    const root = tmpRepo();
    write(root, 'a.ts', 'export const a = 1;\n');
    commit(root, 'init');
    write(root, 'a.ts', 'export const a = 2;\n');
    const hot = commit(root, 'hotpatch: a must be 2 for the billing job');
    write(root, 'a.ts', 'export const a = 3;\n');
    const change = commit(root, 'tweak a');
    expect((await check(root, { sha: change })).noPastFixes).toBe(true);
    expect(allFixes(await check(root, { sha: change }, { fixRule: '^hotpatch' })).map((f) => f.sha)).toEqual([hot]);
    write(root, '.mole/config.json', JSON.stringify({ fixRule: 'billing' }));
    expect(allFixes(await check(root, { sha: change })).map((f) => f.sha)).toEqual([hot]);
  });

  it('a .mole note that names the fix sha is a reason source', async () => {
    const { root, fix, feat } = fixtureRepo();
    write(root, '.mole/notes/loader.md', `# loader\n${fix.slice(0, 7)}: keep the null guard, the CLI passes null when the flag is absent\n`);
    const f = allFixes(await check(root, { sha: feat }))[0]!;
    expect(f.reasonSources.some((s) => s.kind === 'note' && s.path === '.mole/notes/loader.md')).toBe(true);
    expect(f.reason).toContain('the CLI passes null when the flag is absent');
  });

  it('CLI: mole check <sha> prints the fix; --json returns the same structure; exit 0', () => {
    const { root, fix, feat } = fixtureRepo();
    const text = spawnSync(process.execPath, [CLI, 'check', feat, '--root', root], { encoding: 'utf8' });
    expect(text.status).toBe(0);
    expect(text.stdout).toContain(fix.slice(0, 7));
    expect(text.stdout).toContain(`source: ${fix} src/load.ts:3`);
    const json = spawnSync(process.execPath, [CLI, 'check', feat, '--root', root, '--json'], { encoding: 'utf8' });
    expect(json.status).toBe(0);
    const r = JSON.parse(json.stdout) as CheckResult;
    expect(r.hunks[0]!.pastFixes[0]!.sha).toBe(fix);
    const custom = spawnSync(process.execPath, [CLI, 'check', feat, '--root', root, '--fix-rule', '^nomatch$'], { encoding: 'utf8' });
    expect(custom.status).toBe(0);
    expect(custom.stdout).toContain(NO_PAST_FIXES);
  });
});

describe('mole check: empty cases (T12 done-when 6)', () => {
  it('brand-new lines (a new file, lines appended) have no past fixes; exit 0', async () => {
    const { root } = fixtureRepo();
    write(root, 'src/new.ts', 'export const fresh = true;\n');
    write(root, 'src/load.ts', FIXED.replace("x ?? ''", "x ?? 'default'") + 'export const appended = 2;\n');
    const change = commit(root, 'feat: new file');
    const r = await check(root, { sha: change });
    expect(r.noPastFixes).toBe(true);
    expect(formatCheck(r)).toContain(NO_PAST_FIXES);
    const cli = spawnSync(process.execPath, [CLI, 'check', change, '--root', root], { encoding: 'utf8' });
    expect(cli.status).toBe(0);
    expect(cli.stdout).toContain(NO_PAST_FIXES);
  });

  it('a repo with no fix commits has no past fixes; exit 0 (also via --worktree)', async () => {
    const root = tmpRepo();
    write(root, 'a.ts', 'export const a = 1;\nexport const b = 2;\n');
    commit(root, 'init');
    write(root, 'a.ts', 'export const a = 5;\nexport const b = 2;\n');
    const change = commit(root, 'change a');
    const r = await check(root, { sha: change });
    expect(r.hunks.length).toBe(1);
    expect(r.noPastFixes).toBe(true);
    write(root, 'a.ts', 'export const a = 6;\nexport const b = 2;\n');
    const cli = spawnSync(process.execPath, [CLI, 'check', '--worktree', '--root', root], { encoding: 'utf8' });
    expect(cli.status).toBe(0);
    expect(cli.stdout).toContain(NO_PAST_FIXES);
  });

  it('a root commit (nothing before it) has no past fixes', async () => {
    const root = tmpRepo();
    write(root, 'a.ts', 'export const a = 1;\n');
    const first = commit(root, 'fix: first');
    expect((await check(root, { sha: first })).noPastFixes).toBe(true);
  });
});

describe('planted regression B3 on Mole (T12 done-when 3)', () => {
  it('names 9e19c51, its reason (editing counts as use; running index never idle) and the daemon idle test', async () => {
    const moleRoot = execFileSync('git', ['-C', here, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
    const r = await check(moleRoot, { diffFile: PLANTED, base: 'bdeff14' });
    expect(r.noPastFixes).toBe(false);
    const f = allFixes(r).find((x) => x.sha.startsWith('9e19c51'));
    expect(f).toBeDefined();
    expect(f!.subject).toContain('T9 review fixes');
    expect(f!.reason).toContain('editing counts as use');
    expect(f!.reason).toMatch(/never idle|running index/);
    // the subject names task T9: its task file is a linked reason source
    expect(f!.reasonSources.some((s) => s.kind === 'task' && (s.path ?? '').startsWith('tasks/T9-'))).toBe(true);
    const t = f!.tests.find((x) => x.file === 'packages/daemon/test/daemon.test.ts');
    expect(t).toBeDefined();
    expect(t!.names ?? []).toContain('idle shutdown (T9)');
    expect(f!.source.file).toBe('packages/daemon/src/server.ts');
    expect(f!.source.line).toBeGreaterThanOrEqual(211);
    expect(f!.source.line).toBeLessThanOrEqual(217);
    const out = formatCheck(r);
    expect(out).toContain('9e19c51');
    expect(out).toMatch(/source: 9e19c51[0-9a-f]* packages\/daemon\/src\/server\.ts:21\d/);
    expect(modelCalls.count).toBe(0);
  });
});
