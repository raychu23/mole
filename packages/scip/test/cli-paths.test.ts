import { describe, expect, it } from 'vitest';
import { cpSync, mkdtempSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { scipCli } from '../src/cli.js';

const fixture = join(fileURLToPath(new URL('.', import.meta.url)), 'fixtures/counterfixture');

// Round-4 fix: `mole scip stamp --root R --index R/index.scip` from another directory joined R twice.
describe('mole scip stamp path handling', () => {
  it('uses the dispatcher-resolved root once (no doubled --root) and an absolute --index as given', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'scip-cli-'));
    try {
      cpSync(fixture, join(dir, 'repo'), { recursive: true });
      rmSync(join(dir, 'repo', 'index.scip.manifest.json'));
      const code = await scipCli(['stamp'], { root: 'repo', index: 'index.scip' } /* as typed from `dir`; the dispatcher already resolved it */, join(dir, 'repo'));
      expect(code).toBe(0);
      expect(existsSync(join(dir, 'repo', 'index.scip.manifest.json'))).toBe(true);
      const m = JSON.parse(readFileSync(join(dir, 'repo', 'index.scip.manifest.json'), 'utf8'));
      expect(Object.keys(m.files).length).toBeGreaterThan(10); // a doubled root silently hashed 0 files
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
