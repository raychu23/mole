// T12 review P2-1 follow-up: the fix rule matches the commit SUBJECT only, never the body.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { check } from '../src/index.js';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
const git = (root: string, ...a: string[]) =>
  execFileSync('git', ['-C', root, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { encoding: 'utf8' }).trim();

it('a feature commit whose body says "regression tests" is not a past fix; a "fix:" subject is', async () => {
  const root = mkdtempSync(join(tmpdir(), 'mole-fixrule-'));
  dirs.push(root);
  git(root, 'init', '-q', '-b', 'main');
  writeFileSync(join(root, 'a.ts'), 'export const a = 1;\nexport const b = 1;\n');
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'init');
  writeFileSync(join(root, 'a.ts'), 'export const a = 2;\nexport const b = 1;\n');
  git(root, 'commit', '-qam', 'feat: sticky notes', '-m', 'adds regression tests for the toolbar');
  const feat = git(root, 'rev-parse', 'HEAD');
  writeFileSync(join(root, 'a.ts'), 'export const a = 2;\nexport const b = 2;\n');
  git(root, 'commit', '-qam', 'fix: b must be 2');
  const fix = git(root, 'rev-parse', 'HEAD');
  writeFileSync(join(root, 'a.ts'), 'export const a = 3;\nexport const b = 3;\n');
  git(root, 'commit', '-qam', 'tweak both');
  const r = await check(root, { sha: 'HEAD' });
  const shas = r.hunks.flatMap((h) => h.pastFixes.map((f) => f.sha));
  expect(shas).toContain(fix);
  expect(shas).not.toContain(feat);
});
