// T91 review round 2 fix HIGH: .pre-commit-hooks.yaml's `additional_dependencies: ["mole-code@X.Y.Z"]` pin
// must equal release/mole-code/package.json's own "version" (and server.json's, published alongside it) --
// the actual package `scripts/publish-all.sh` publishes. Round 1 shipped the file with `mole-code@0.5.0`
// while the real package was (and still is) 0.1.0, a drift a reviewer caught only by reading npm directly.
// This test makes that drift a CI failure instead of a second manual review catching it.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const REPO_ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../..');

function packageVersion(relPath: string): string {
  const pkg = JSON.parse(readFileSync(resolve(REPO_ROOT, relPath), 'utf8')) as { version: string };
  return pkg.version;
}

it('.pre-commit-hooks.yaml pins mole-code to release/mole-code/package.json\'s current version', () => {
  const hooksYaml = readFileSync(resolve(REPO_ROOT, '.pre-commit-hooks.yaml'), 'utf8');
  const pinMatch = hooksYaml.match(/additional_dependencies:\s*\["mole-code@([^"]+)"\]/);
  expect(pinMatch, '.pre-commit-hooks.yaml must have an additional_dependencies: ["mole-code@X.Y.Z"] pin').toBeTruthy();
  const pinned = pinMatch![1];
  const published = packageVersion('release/mole-code/package.json');
  expect(pinned).toBe(published);
});

it('server.json\'s published version also matches release/mole-code/package.json (same release, same version everywhere)', () => {
  const serverJsonVersion = packageVersion('server.json');
  const published = packageVersion('release/mole-code/package.json');
  expect(serverJsonVersion).toBe(published);
});
