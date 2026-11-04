// T91-distribution-channels review fix (MEDIUM): docs/install-mcp-clients.md's Cursor/VS Code deeplinks must
// decode to real, valid JSON -- this caught a truncated `config=eyJjb2...iXX0=` placeholder slipping into a
// public doc. Exercises scripts/test/check-deeplinks.mjs against the actual doc, not a copy.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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
