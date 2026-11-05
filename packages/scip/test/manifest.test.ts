// Content-hash manifest (T95 review round-2 HIGH-1): unit coverage for stampScip/listSourceFiles/scipCli in
// isolation from the decisions-package integration tests (rules-scip-stale.test.ts covers the `mole rules`
// staleness check end to end, including a real `git clone`).
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { scipCli } from '../src/cli.js';
import { extsOfFiles, listSourceFiles, manifestPath, sha256File, stampScip, type ScipManifest } from '../src/manifest.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = join(here, 'fixtures/counterfixture');

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const c of cleanups.splice(0)) c();
});

describe('extsOfFiles', () => {
  it('collects the distinct extensions of a set of paths', () => {
    expect(extsOfFiles(['a/b.py', 'c.py', 'd.pyi'])).toEqual(new Set(['.py', '.pyi']));
  });
});

describe('listSourceFiles (no git repo): fallback walk skips vendor/build/VCS directories', () => {
  it('skips node_modules, dist, build, .git, .venv, venv, site-packages, __pycache__', () => {
    const root = mkdtempSync(join(tmpdir(), 'mole-scip-walk-'));
    cleanups.push(() => rmSync(root, { recursive: true, force: true }));
    const keep = 'src/keep.py';
    const skip = [
      'node_modules/pkg/skip.py',
      'dist/skip.py',
      'build/skip.py',
      '.git/skip.py',
      '.venv/lib/skip.py',
      'venv/lib/skip.py',
      'site-packages/skip.py',
      '__pycache__/skip.py',
    ];
    for (const f of [keep, ...skip]) {
      mkdirSync(join(root, dirname(f)), { recursive: true });
      writeFileSync(join(root, f), 'x = 1\n');
    }
    const found = listSourceFiles(root, new Set(['.py'])).sort();
    expect(found).toEqual([keep]);
  });
});

describe('stampScip', () => {
  it('hashes the index and every indexed-language source file, and writes the manifest next to the index', () => {
    const root = mkdtempSync(join(tmpdir(), 'mole-scip-stamp-'));
    cleanups.push(() => rmSync(root, { recursive: true, force: true }));
    // a standalone copy (not inside the main repo's git tree): exercises the fallback (non-git) walk
    for (const f of ['pyproject.toml', 'index.scip']) writeFileSync(join(root, f), readFileSync(join(fixture, f)));
    const srcDir = join(root, 'src');
    mkdirSync(srcDir, { recursive: true });
    const manifest = stampScip(root, join(root, 'index.scip'));
    expect(manifest.tool).toContain('scip-python');
    expect(manifest.indexSha256).toBe(sha256File(join(root, 'index.scip')));
    const onDisk = JSON.parse(readFileSync(manifestPath(join(root, 'index.scip')), 'utf8')) as ScipManifest;
    expect(onDisk).toEqual(manifest);
  });
});

describe('scipCli', () => {
  it('`scip stamp` writes a manifest and reports the file count', async () => {
    const root = mkdtempSync(join(tmpdir(), 'mole-scip-cli-'));
    cleanups.push(() => rmSync(root, { recursive: true, force: true }));
    for (const f of ['pyproject.toml', 'index.scip']) writeFileSync(join(root, f), readFileSync(join(fixture, f)));
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...a: unknown[]) => void logs.push(a.join(' '));
    try {
      expect(await scipCli(['stamp'], {}, root)).toBe(0);
    } finally {
      console.log = origLog;
    }
    expect(logs.join('\n')).toMatch(/wrote .*index\.scip\.manifest\.json/);
    expect(JSON.parse(readFileSync(join(root, 'index.scip.manifest.json'), 'utf8'))).toHaveProperty('indexSha256');
  });

  it('`scip stamp --index other.scip` stamps the named index instead of root/index.scip', async () => {
    const root = mkdtempSync(join(tmpdir(), 'mole-scip-cli-named-'));
    cleanups.push(() => rmSync(root, { recursive: true, force: true }));
    writeFileSync(join(root, 'other.scip'), readFileSync(join(fixture, 'index.scip')));
    writeFileSync(join(root, 'pyproject.toml'), readFileSync(join(fixture, 'pyproject.toml')));
    expect(await scipCli(['stamp'], { index: 'other.scip' }, root)).toBe(0);
    expect(JSON.parse(readFileSync(join(root, 'other.scip.manifest.json'), 'utf8'))).toHaveProperty('indexSha256');
  });

  it('an unknown subcommand exits 2 with a clear message', async () => {
    const errs: string[] = [];
    const origErr = console.error;
    console.error = (...a: unknown[]) => void errs.push(a.join(' '));
    try {
      expect(await scipCli(['nope'], {}, '/tmp')).toBe(2);
    } finally {
      console.error = origErr;
    }
    expect(errs.join('\n')).toMatch(/unknown subcommand/);
  });
});
