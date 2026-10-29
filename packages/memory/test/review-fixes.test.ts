// T11 review round 1 regressions (tasks/T11-l2-memory-notes/4 log/review-1.md): P1-1 name-only re-anchoring, P2-1 overload signatures.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { addNote, memory } from '../src/index.js';

const dirs: string[] = [];
function repo(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'mole-mem-rf-'));
  dirs.push(root);
  for (const [p, body] of Object.entries(files)) write(root, p, body);
  return root;
}
function write(root: string, p: string, body: string): void {
  mkdirSync(dirname(join(root, p)), { recursive: true });
  writeFileSync(join(root, p), body);
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('T11 review fixes', () => {
  it('P1-1: a deleted symbol is orphaned, not "moved" to an unrelated same-named function with another body', () => {
    const root = repo({
      'src/b.ts': 'export function parse(s: string) {\n  return s.trim();\n}\n',
      'src/c.ts': 'export function parse(n: number) {\n  return n * 2;\n}\n',
    });
    addNote(root, 'src/b.ts#parse', 'parse b');
    write(root, 'src/b.ts', 'export const z = 1;\n');
    const [e] = memory(root);
    expect(e?.status).toBe('orphaned');
    expect(e?.newPath).toBeUndefined();
  });

  it('P1-1: a moved symbol with the same body is still found (moved)', () => {
    const root = repo({ 'src/b.ts': 'export function parse(s: string) {\n  return s.trim();\n}\n' });
    addNote(root, 'src/b.ts#parse', 'parse b');
    write(root, 'src/b.ts', 'export const z = 1;\n');
    write(root, 'src/lib/parse.ts', 'export function parse(s: string) {\n  return s.trim();\n}\n');
    const [e] = memory(root);
    expect(e?.status).toBe('moved');
    expect(e?.newPath).toBe('src/lib/parse.ts');
  });

  it('P2-1: changing an overload signature makes the note stale; reformatting it does not', () => {
    const src = (t: string) => `export function f(a: ${t}): string;\nexport function f(a: any): string {\n  return String(a);\n}\n`;
    const root = repo({ 'src/o.ts': src('number') });
    addNote(root, 'src/o.ts#f', 'overloaded');
    write(root, 'src/o.ts', src('number').replace('(a: number)', '( a :  number )'));
    expect(memory(root)[0]?.status).toBe('fresh');
    write(root, 'src/o.ts', src('string'));
    expect(memory(root)[0]?.status).toBe('stale');
  });
});
