// T16 done-when 3: scripts/ci/key-guard.mjs fails when a bench key file differs from the commit that first added it (R2),
// unless an approved ruling (tasks/*/4 log/key-ruling-*.md) names that key and the sha256 of its new content.
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const guard = resolve(here, '../../../scripts/ci/key-guard.mjs');
const roots: string[] = [];
afterEach(() => {
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true });
});

function repo(): { root: string; git: (...a: string[]) => string; put: (p: string, t: string) => void } {
  const root = mkdtempSync(join(tmpdir(), 'mole-keyguard-'));
  roots.push(root);
  const git = (...a: string[]) =>
    execFileSync('git', ['-C', root, '-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', ...a], { encoding: 'utf8' });
  const put = (p: string, t: string) => {
    mkdirSync(dirname(join(root, p)), { recursive: true });
    writeFileSync(join(root, p), t);
  };
  git('init', '-q', '-b', 'main');
  put('README.md', 'x\n');
  git('add', '-A');
  git('commit', '-q', '-m', 'init');
  put('packages/a/bench/m9-key.json', '{"written":"2026-10-29","expect":1}\n');
  put('packages/a/bench/keys/m10-key.json', '{"expect":2}\n');
  put('packages/a/test/a.test.ts', '// red\n');
  git('add', '-A');
  git('commit', '-q', '-m', 'T9 checks first (R1): key + red tests');
  put('packages/a/src/index.ts', 'export const a = 1;\n');
  git('add', '-A');
  git('commit', '-q', '-m', 'T9 implement');
  return { root, git, put };
}
const runGuard = (root: string) => spawnSync(process.execPath, [guard, '--root', root], { encoding: 'utf8' });
const sha256 = (p: string) => createHash('sha256').update(readFileSync(p)).digest('hex');

describe('key guard (R2)', () => {
  it('is green when every key equals its checks-first commit, and lists each key with that commit', () => {
    const { root } = repo();
    const r = runGuard(root);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/^ok\s+packages\/a\/bench\/m9-key\.json\b.*T9 checks first/m);
    expect(r.stdout).toMatch(/^ok\s+packages\/a\/bench\/keys\/m10-key\.json\b/m);
  });

  it('is red when a key is edited and committed, and names the key', () => {
    const { root, git, put } = repo();
    put('packages/a/bench/m9-key.json', '{"written":"2026-10-29","expect":2}\n');
    git('commit', '-q', '-am', 'loosen');
    const r = runGuard(root);
    expect(r.status).toBe(1);
    expect(r.stdout + r.stderr).toContain('packages/a/bench/m9-key.json');
  });

  it('is red for an uncommitted edit and for a deleted key', () => {
    const a = repo();
    a.put('packages/a/bench/keys/m10-key.json', '{"expect":3}\n');
    expect(runGuard(a.root).status).toBe(1);
    const b = repo();
    unlinkSync(join(b.root, 'packages/a/bench/m9-key.json'));
    b.git('commit', '-q', '-am', 'drop key');
    const r = runGuard(b.root);
    expect(r.status).toBe(1);
    expect(r.stdout + r.stderr).toContain('packages/a/bench/m9-key.json');
  });

  it('allows a change only with an APPROVE ruling naming the key and the exact sha256 of the new content', () => {
    const { root, git, put } = repo();
    put('packages/a/bench/m9-key.json', '{"written":"2026-10-29","expect":2}\n');
    git('commit', '-q', '-am', 'ruled change');
    const h = sha256(join(root, 'packages/a/bench/m9-key.json'));
    const ruling = 'tasks/T9-x/4 log/key-ruling-1.md';
    put(ruling, `ruling    APPROVE\nallowed key    packages/a/bench/m9-key.json    sha256 ${h}\n`);
    expect(runGuard(root).status).toBe(0);
    put(ruling, `ruling    REJECT\nallowed key    packages/a/bench/m9-key.json    sha256 ${h}\n`);
    expect(runGuard(root).status).toBe(1);
    put(ruling, `ruling    APPROVE\nallowed key    packages/a/bench/m9-key.json    sha256 ${'0'.repeat(64)}\n`);
    expect(runGuard(root).status).toBe(1);
    put(ruling, `ruling    APPROVE\nallowed key    packages/a/bench/keys/m10-key.json    sha256 ${h}\n`);
    expect(runGuard(root).status).toBe(1);
    // a ruling file elsewhere (not tasks/*/4 log/key-ruling-*.md) does not count
    rmSync(join(root, 'tasks'), { recursive: true });
    put('notes/key-ruling-1.md', `ruling    APPROVE\nallowed key    packages/a/bench/m9-key.json    sha256 ${h}\n`);
    expect(runGuard(root).status).toBe(1);
  });

  it('refuses a shallow clone (exit 2): the checks-first commit cannot be found there', () => {
    const { root } = repo();
    const shallow = mkdtempSync(join(tmpdir(), 'mole-keyguard-shallow-'));
    roots.push(shallow);
    execFileSync('git', ['clone', '-q', '--depth', '1', `file://${root}`, join(shallow, 'c')]);
    const r = runGuard(join(shallow, 'c'));
    expect(r.status).toBe(2);
    expect(r.stdout + r.stderr).toMatch(/shallow/i);
  });
});
