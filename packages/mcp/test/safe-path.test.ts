// T91-distribution-channels review fix HIGH 2: tool-supplied path args (root, diff, notesRoot, testReport,
// adrDir, records, from, questionsFile) must stay inside the server root in both transports. This file
// exercises the shared confineToRoot/confineAllToRoot helper (packages/mcp/src/safe-path.ts) directly, plus
// one end-to-end check through a real tool call (mole_check root) so the helper is proven wired in, not
// just unit-tested in isolation.
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { confineToRoot, PathEscapeError } from '../src/safe-path.js';
import { createServer } from '../src/server.js';

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const c of cleanups.splice(0).reverse()) c();
});

// realpathSync, so this matches confineToRoot's own realpath'd return value on platforms (macOS) where
// $TMPDIR is itself a symlink (/var -> /private/var).
function freshRoot(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'mole-mcp-safe-path-')));
  cleanups.push(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

it('undefined input resolves to the root itself', () => {
  const root = freshRoot();
  expect(confineToRoot(root, undefined, 'root')).toBe(root);
});

it('an absolute path argument is rejected outright, even "/"', () => {
  const root = freshRoot();
  expect(() => confineToRoot(root, '/', 'root')).toThrow(PathEscapeError);
  expect(() => confineToRoot(root, '/etc/passwd', 'diff')).toThrow(PathEscapeError);
});

it('a relative path that stays inside the root resolves fine', () => {
  const root = freshRoot();
  mkdirSync(join(root, 'sub'));
  expect(confineToRoot(root, 'sub', 'notesRoot')).toBe(join(root, 'sub'));
  expect(confineToRoot(root, '.', 'root')).toBe(root);
});

it('a `..` traversal that escapes the root is rejected', () => {
  const root = freshRoot();
  expect(() => confineToRoot(root, '../../etc/passwd', 'diff')).toThrow(PathEscapeError);
  expect(() => confineToRoot(root, '..', 'notesRoot')).toThrow(PathEscapeError);
});

it('a symlink inside the root that points outside it is rejected (realpath check)', () => {
  const root = freshRoot();
  const outside = mkdtempSync(join(tmpdir(), 'mole-mcp-outside-'));
  cleanups.push(() => rmSync(outside, { recursive: true, force: true }));
  writeFileSync(join(outside, 'secret.txt'), 'nope');
  symlinkSync(outside, join(root, 'escape-link'));
  expect(() => confineToRoot(root, 'escape-link', 'notesRoot')).toThrow(PathEscapeError);
});

it('end-to-end: mole_check root="/" is rejected by the tool, never passed to fs', async () => {
  const root = freshRoot();
  const server = createServer({ root, noStart: true });
  // reach into the registered handler the same way the SDK dispatches a tools/call
  const result = await (server as unknown as { _registeredTools: Record<string, { handler: (args: unknown, extra: unknown) => Promise<{ isError?: boolean; content: Array<{ text: string }> }> }> })
    ._registeredTools['mole_check']!.handler({ root: '/', worktree: true }, { requestId: 'r1' });
  expect(result.isError).toBe(true);
  expect(result.content[0]?.text).toMatch(/outside the server root|absolute path/);
});
