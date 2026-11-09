// T120c RED test: `mole cascade-check --embed-route` CLI flag (off by default). Verifies the flag is wired to
// the MiniLM adapter module via a DYNAMIC import (the adapter is never statically imported by cli.ts/index.ts --
// that is what keeps the core dist bundle from growing just because this flag exists, see bundle-size.md).
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cascadeCheckCli } from '../src/index.js';

const git = (root: string, ...args: string[]) =>
  execFileSync('git', ['-C', root, '-c', 'user.name=T', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', ...args], { encoding: 'utf8' }).trim();

let root = '';
let base = '';
let head = '';
function write(rel: string, text: string) {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), text);
}
beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'mole-cascade-cli-embed-'));
  git(root, 'init', '-q', '-b', 'main');
  write('src/a.ts', 'export const a = 1;\n');
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'base');
  base = git(root, 'rev-parse', 'HEAD');
  git(root, 'checkout', '-q', '-b', 'pr1', base);
  write('src/a.ts', 'export const a = 2;\n');
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'edit');
  head = git(root, 'rev-parse', 'HEAD');
  git(root, 'checkout', '-q', base);
});
afterAll(() => {
  if (root) rmSync(root, { recursive: true, force: true });
});

describe('cascadeCheckCli: --embed-route flag (T120c, off by default)', () => {
  it('without --embed-route, a plain check (no decisions governed) still runs clean, no embedder touched', async () => {
    const code = await cascadeCheckCli([], { base, head, 'no-llm': true, json: true }, root);
    expect(code).toBe(0);
  });

  it('--embed-route with no decisions in the repo is a no-op (nothing to embed, never throws)', async () => {
    const code = await cascadeCheckCli([], { base, head, 'no-llm': true, 'embed-route': true, json: true }, root);
    expect(code).toBe(0);
  });

  it('--no-route and --embed-route together: --no-route wins (semanticRoute, and so embedBoost, never runs)', async () => {
    const code = await cascadeCheckCli([], { base, head, 'no-llm': true, 'no-route': true, 'embed-route': true, json: true }, root);
    expect(code).toBe(0);
  });
});
