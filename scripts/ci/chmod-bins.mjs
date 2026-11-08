#!/usr/bin/env node
// T108-ci-green: `tsc -b` writes every package's dist/ output with the default umask mode (0644),
// which drops the executable bit a package.json "bin" entry needs to be exec'd directly (os.execv,
// a shell PATH shim, etc). On `main`'s long-lived checkout this went unnoticed because dist/cli.js
// was chmod +x once (npm install symlinking node_modules/.bin/*) and tsc -b's incremental build
// never rewrote the unchanged file since. A FRESH checkout (exactly what CI does: npm ci + npm run
// build) always produces a non-executable dist/cli.js, so packages/daemon/test/init-pty.test.ts's
// `os.execv(mole_bin, ...)` always threw "PermissionError: [Errno 13] Permission denied" there --
// reproduced from a fresh `git worktree add` + `npm ci` + `npm run check` (tasks/T108-ci-green/4 log).
// Fix: after every `npm run build` (root package.json "postbuild" lifecycle hook), chmod +x every
// "bin" target declared by a workspace package, so dist always matches what package.json promises.
import { chmodSync, existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const packagesDir = join(root, 'packages');

let chmodded = 0;
for (const name of readdirSync(packagesDir)) {
  const pkgDir = join(packagesDir, name);
  const pkgJsonPath = join(pkgDir, 'package.json');
  if (!statSync(pkgDir, { throwIfNoEntry: false })?.isDirectory() || !existsSync(pkgJsonPath)) continue;
  const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));
  if (!pkg.bin) continue;
  const bins = typeof pkg.bin === 'string' ? [pkg.bin] : Object.values(pkg.bin);
  for (const rel of bins) {
    const target = join(pkgDir, rel);
    if (!existsSync(target)) {
      console.warn(`chmod-bins: ${name} declares bin "${rel}" but it does not exist (build order?) -- skipped`);
      continue;
    }
    chmodSync(target, 0o755);
    chmodded++;
  }
}
console.log(`chmod-bins: ${chmodded} bin file(s) made executable`);
