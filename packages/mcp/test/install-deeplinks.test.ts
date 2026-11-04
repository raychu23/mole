// T91-distribution-channels review fix (MEDIUM): docs/install-mcp-clients.md's Cursor/VS Code deeplinks must
// decode to real, valid JSON -- this caught a truncated `config=eyJjb2...iXX0=` placeholder slipping into a
// public doc. Exercises scripts/test/check-deeplinks.mjs against the actual doc, not a copy.
import { readFileSync, copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, it } from 'vitest';
import { checkDeeplinks } from '../../../scripts/test/check-deeplinks.mjs';

const DOC = resolve(import.meta.dirname, '../../../docs/install-mcp-clients.md');

it('every Cursor/VS Code install deeplink in docs/install-mcp-clients.md decodes to real JSON', () => {
  const markdown = readFileSync(DOC, 'utf8');
  const found = checkDeeplinks(markdown);
  expect(found.length).toBeGreaterThanOrEqual(2); // at least one Cursor + one VS Code link
  for (const { config } of found) {
    expect(config.command).toBe('npx');
    expect(config.args).toEqual(expect.arrayContaining(['mole-mcp']));
  }
});

it('a truncated placeholder like the one this fixes is rejected, not silently accepted', () => {
  expect(() => checkDeeplinks('[x](cursor://anysphere.cursor-deeplink/mcp/install?name=mole&config=eyJjb2...iXX0=)')).toThrow(/not real base64|placeholder/);
});

// T91 review round 2 fix LOW: the script's `if (import.meta.url === ...)` main-module guard must still fire
// when the script itself sits under a path containing a space (a real path on this machine:
// `.../Desktop/CS Code/Project/...`) -- the old `file://${process.argv[1]}` comparison never matched a
// percent-encoded `import.meta.url` against a raw, unencoded argv[1], so the script silently did nothing
// (exit 0) even when run directly against a broken doc. Reproduces that exact shape in a scratch dir whose
// path contains a space, with a doc that has no valid deeplinks, and asserts the direct run now fails loudly.
it('running the script directly from a path with a space in it exits non-zero on a broken doc', () => {
  const work = mkdtempSync(join(tmpdir(), 'mole deeplinks test '));
  try {
    const scriptDir = join(work, 'scripts', 'test');
    const docsDir = join(work, 'docs');
    mkdirSync(scriptDir, { recursive: true });
    mkdirSync(docsDir, { recursive: true });
    // Same relative layout the real script assumes (../../docs/install-mcp-clients.md from its own dir).
    copyFileSync(resolve(import.meta.dirname, '../../../scripts/test/check-deeplinks.mjs'), join(scriptDir, 'check-deeplinks.mjs'));
    writeFileSync(join(docsDir, 'install-mcp-clients.md'), 'no deeplinks in this broken doc at all\n');

    expect(() => execFileSync('node', [join(scriptDir, 'check-deeplinks.mjs')], { stdio: 'pipe' })).toThrow();
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});
