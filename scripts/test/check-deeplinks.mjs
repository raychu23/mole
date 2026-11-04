#!/usr/bin/env node
// T91-distribution-channels review fix (MEDIUM): every MCP install deeplink in docs/install-mcp-clients.md
// must decode to valid, correctly-shaped JSON, not a placeholder -- this is what caught the truncated
// Cursor `config=eyJjb2...iXX0=` placeholder in the first place. Run directly: `node
// scripts/test/check-deeplinks.mjs` (also called from the vitest suite, see test/check-deeplinks.test.ts).
import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DOC = fileURLToPath(new URL('../../docs/install-mcp-clients.md', import.meta.url));

/** Every `config=` query param on a Cursor or VS Code deeplink in the doc, decoded + parsed. Throws with
 * the offending link on any failure (missing config, undecodable base64/URL-encoding, or non-JSON-object
 * result). Returns the list of { url, config } pairs found, so a caller can assert on count too (a doc that
 * silently lost its only deeplink would otherwise pass an empty loop). */
export function checkDeeplinks(markdown) {
  const found = [];
  // Cursor: cursor://anysphere.cursor-deeplink/mcp/install?name=...&config=<base64 JSON>
  for (const m of markdown.matchAll(/cursor:\/\/anysphere\.cursor-deeplink\/mcp\/install\?[^\s)`]+/g)) {
    const url = m[0];
    if (url.includes('$')) continue; // a `format: ...$NAME&config=$BASE64_CONFIG` description line, not a real link
    const configMatch = url.match(/[?&]config=([^&\s)`]+)/);
    if (!configMatch) throw new Error(`Cursor deeplink has no config param: ${url}`);
    const b64 = configMatch[1];
    if (!/^[A-Za-z0-9+/]+=*$/.test(b64) || b64.length < 20) throw new Error(`Cursor deeplink config is not real base64 (placeholder?): ${url}`);
    let decoded;
    try {
      decoded = Buffer.from(b64, 'base64').toString('utf8');
    } catch (e) {
      throw new Error(`Cursor deeplink config is not valid base64: ${url}: ${e.message}`);
    }
    const parsed = JSON.parse(decoded); // throws on non-JSON, which is exactly a truncated/garbled placeholder
    if (typeof parsed !== 'object' || parsed === null || !parsed.command) throw new Error(`Cursor deeplink config decodes but isn't a {command, args} object: ${url} -> ${decoded}`);
    found.push({ url, config: parsed });
  }
  // VS Code: https://insiders.vscode.dev/redirect/mcp/install?name=...&config=<URL-encoded JSON>
  for (const m of markdown.matchAll(/https:\/\/insiders\.vscode\.dev\/redirect\/mcp\/install\?[^\s)`]+/g)) {
    const url = m[0];
    if (url.includes('$')) continue; // a format-description line, not a real link
    const configMatch = url.match(/[?&]config=([^&\s)`]+)/);
    if (!configMatch) throw new Error(`VS Code deeplink has no config param: ${url}`);
    const decoded = decodeURIComponent(configMatch[1]);
    const parsed = JSON.parse(decoded);
    if (typeof parsed !== 'object' || parsed === null || !parsed.command) throw new Error(`VS Code deeplink config decodes but isn't a {command, args} object: ${url} -> ${decoded}`);
    found.push({ url, config: parsed });
  }
  return found;
}

// T91 review round 2 fix LOW: `file://${process.argv[1]}` breaks on any path containing a space (or other
// character requiring percent-encoding) because `import.meta.url` IS percent-encoded (`%20`) while a raw
// string-concatenated `argv[1]` is not -- the two never compare equal, so this script silently did nothing
// when run directly from a path like this repo's own `Desktop/CS Code/Project/...` (a real path on this
// machine). Comparing realpath'd filesystem paths instead of raw URLs sidesteps BOTH that encoding mismatch
// AND a second, unrelated mismatch on macOS where `/tmp` is itself a symlink to `/private/tmp` -- `argv[1]`
// keeps whichever form the shell invoked it with, `import.meta.url` always resolves through the symlink, so
// even a correctly-encoded string compare would still fail for a script run from under `/tmp`.
if (realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])) {
  const markdown = readFileSync(DOC, 'utf8');
  const found = checkDeeplinks(markdown);
  if (found.length === 0) throw new Error(`no deeplinks found in ${DOC} -- did the doc lose its install links?`);
  for (const { url, config } of found) console.log(`ok: ${url.slice(0, 60)}... -> ${JSON.stringify(config)}`);
  console.log(`${found.length} deeplink(s) decode to valid JSON`);
}
