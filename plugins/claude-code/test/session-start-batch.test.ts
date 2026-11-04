// T92 review-2 (HIGH): session-start.mjs ran one `git hash-object -w` subprocess per dirty file: 8.2 s for
// 500 dirty files, over the hooks' 2 s budget. Fix: one `git hash-object -w --stdin-paths` call for all files
// (git-hash-object(1): "--stdin-paths  Read file names from the standard input, one per line").
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const plugin = join(dirname(fileURLToPath(import.meta.url)), '..');
const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));
const ENV = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
const git = (root: string, ...a: string[]) => execFileSync('git', ['-C', root, ...a], { encoding: 'utf8', env: ENV }).trim();

function sessionFile(data: string): string {
  const found: string[] = [];
  const walk = (d: string) => readdirSync(d, { withFileTypes: true }).forEach((e) => (e.isDirectory() ? walk(join(d, e.name)) : found.push(join(d, e.name))));
  walk(data);
  const f = found.find((p) => p.includes('sess-many'));
  if (!f) throw new Error(`no session file under ${data}: ${found.join(', ')}`);
  return f;
}

describe('T92 review-2: SessionStart snapshots dirty files in one git call', () => {
  it('500 dirty files: every blob recorded and correct, under 2 s', () => {
    const root = mkdtempSync(join(tmpdir(), 'mole-t92-many-'));
    const data = mkdtempSync(join(tmpdir(), 'mole-t92-many-data-'));
    dirs.push(root, data);
    git(root, 'init', '-q', '-b', 'main');
    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(join(root, 'README.md'), 'x\n');
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'base');
    for (let i = 0; i < 500; i++) writeFileSync(join(root, 'src', `f ${i}.ts`), `export const v${i} = ${i};\n`); // spaces in names on purpose
    const t0 = Date.now();
    execFileSync(process.execPath, [join(plugin, 'scripts', 'session-start.mjs')], {
      input: JSON.stringify({ session_id: 'sess-many', cwd: root }),
      encoding: 'utf8',
      env: { ...process.env, MOLE_BIN: '/nonexistent/mole', CLAUDE_PLUGIN_ROOT: plugin, CLAUDE_PLUGIN_DATA: data },
      timeout: 60_000,
    });
    const ms = Date.now() - t0;
    const sess = JSON.parse(readFileSync(sessionFile(data), 'utf8'));
    const blobs = sess.baselineBlobs ?? {};
    expect(Object.keys(blobs).length).toBe(500);
    expect(blobs['src/f 7.ts']).toBe(git(root, 'hash-object', 'src/f 7.ts'));
    expect(git(root, 'cat-file', '-p', blobs['src/f 499.ts'])).toBe('export const v499 = 499;');
    expect(ms).toBeLessThan(2000);
  });
});
