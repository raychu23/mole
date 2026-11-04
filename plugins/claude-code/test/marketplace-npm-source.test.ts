// T86/D97: a marketplace-clone test. `git clone` the committed worktree tree into a temp dir (no uncommitted
// files, no dist/ -- a real clone only has what git tracked) and check .claude-plugin/marketplace.json
// parses and names the npm package per the documented npm plugin source
// (https://code.claude.com/docs/en/plugins/marketplace-reference, fetched 2026-11-03), and that nothing
// under dist/ is required to exist for the marketplace file itself to be valid (the whole point of the npm
// source: Claude Code fetches mole-code from npm, not from this git tree's dist/).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
let clone = '';

beforeAll(() => {
  clone = mkdtempSync(join(tmpdir(), 'mole-marketplace-clone-'));
  // clone HEAD only, from the local worktree's own .git -- what a marketplace consumer actually fetches is
  // the committed tree, not this worktree's untracked/ignored files (dist/, node_modules/, .tgz, ...)
  execFileSync('git', ['clone', '--quiet', '--depth', '1', repoRoot, clone], { encoding: 'utf8' });
});

afterAll(() => {
  if (clone) rmSync(clone, { recursive: true, force: true });
});

describe('T86/D97: marketplace.json in a fresh git clone (no dist/, no build step)', () => {
  it('git clone succeeded and dist/ is absent (it is gitignored, never committed)', () => {
    expect(existsSync(join(clone, '.claude-plugin/marketplace.json'))).toBe(true);
    expect(existsSync(join(clone, 'release/mole-code/dist'))).toBe(false);
    expect(existsSync(join(clone, 'plugins/claude-code/dist'))).toBe(false);
  });

  it('marketplace.json parses and names mole-code via the documented npm plugin source', () => {
    const marketplace = JSON.parse(readFileSync(join(clone, '.claude-plugin/marketplace.json'), 'utf8'));
    expect(marketplace.name).toBeTruthy();
    expect(Array.isArray(marketplace.plugins)).toBe(true);
    const entry = marketplace.plugins.find((p: { name: string }) => p.name === 'mole');
    expect(entry).toBeTruthy();
    // npm plugin source shape per code.claude.com/docs/en/plugins/marketplace-reference (fetched 2026-11-03):
    // { "source": "npm", "package": "<name>" } -- NOT a relative path, NOT a bare string
    expect(entry.source).toEqual(expect.objectContaining({ source: 'npm', package: 'mole-code' }));
    // D97: drop the undocumented author/license keys this entry used to carry at the marketplace level
    // (plugin.json, which release/mole-code/tools/build.mjs copies from plugins/claude-code, is the
    // authoritative source for those -- see marketplace-reference's "How an entry combines with plugin.json")
    expect(entry.author).toBeUndefined();
    expect(entry.license).toBeUndefined();
  });

  it('release/mole-code is a real, independently npm-installable package (outside the packages/* glob)', () => {
    const pkg = JSON.parse(readFileSync(join(clone, 'release/mole-code/package.json'), 'utf8'));
    expect(pkg.name).toBe('mole-code');
    const root = JSON.parse(readFileSync(join(clone, 'package.json'), 'utf8'));
    expect(root.workspaces).not.toContain('release/*');
    expect(root.workspaces.some((g: string) => g.startsWith('release'))).toBe(false);
  });
});
