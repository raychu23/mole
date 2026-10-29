// T11 red tests: done-when 1 (note add + memory listing, CLI), 2 (stale vs whitespace/comment-only), 3 (moved, orphaned), 5 (malformed YAML -> file:line).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { addNote, findSymbol, memory, normalizedHash, symbolsInFile } from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const cli = resolve(here, '../../daemon/dist/cli.js');

const SRC = `export class Greeter {
  greet(name: string): string {
    return 'hi ' + name;
  }
  bye(): string { return "bye"; }
}

export function add(a: number, b: number): number {
  return a + b;
}

export const mul = (a: number, b: number) => a * b;
`;

const dirs: string[] = [];
function repo(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'mole-mem-'));
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

const opts = { author: 'tester', date: '2026-10-28T00:00:00.000Z' };
const statusOf = (root: string, symbol: string) => memory(root).find((e) => e.symbol === symbol);

describe('symbols and normalized hash', () => {
  it('lists functions, const arrow functions, classes and methods with 1-based ranges', () => {
    const root = repo({ 'src/a.ts': SRC });
    const syms = symbolsInFile(root, 'src/a.ts');
    const byName = Object.fromEntries(syms.map((s) => [s.qualifiedName, s]));
    expect(Object.keys(byName).sort()).toEqual(
      ['src/a.ts#Greeter', 'src/a.ts#Greeter.bye', 'src/a.ts#Greeter.greet', 'src/a.ts#add', 'src/a.ts#mul'].sort(),
    );
    expect(byName['src/a.ts#Greeter']).toMatchObject({ kind: 'class', startLine: 1, endLine: 6, path: 'src/a.ts' });
    expect(byName['src/a.ts#Greeter.greet']).toMatchObject({ kind: 'method', tail: 'Greeter.greet', startLine: 2, endLine: 4 });
    expect(byName['src/a.ts#add']).toMatchObject({ kind: 'function', startLine: 8, endLine: 10 });
    expect(byName['src/a.ts#mul']?.kind).toBe('function');
    expect(byName['src/a.ts#add']?.hash).toMatch(/^[0-9a-f]{16,64}$/);
    expect(findSymbol(root, 'src/a.ts#Greeter.greet')?.startLine).toBe(2);
    expect(findSymbol(root, 'src/a.ts#Nope')).toBeUndefined();
  });

  it('normalizedHash ignores whitespace and comments but not string contents or tokens', () => {
    const a = normalizedHash('function f(a: number) { return a + 1; }');
    expect(normalizedHash('function f(a:number){\n  // why\n  return a+1; /* c */\n}\n')).toBe(a);
    expect(normalizedHash('/** doc */\nfunction  f( a : number )\n{\n\n  return a + 1;\n}')).toBe(a);
    expect(normalizedHash('function f(a: number) { return a + 2; }')).not.toBe(a);
    expect(normalizedHash("const s = 'a b';")).not.toBe(normalizedHash("const s = 'ab';"));
  });
});

describe('notes: add and list (done-when 1)', () => {
  it('addNote writes .mole/notes/<slug>.md with YAML front matter and memory lists it fresh', () => {
    const root = repo({ 'src/a.ts': SRC });
    const note = addNote(root, 'src/a.ts#Greeter.greet', 'greets politely; keep the trailing space', opts);
    expect(note.file).toMatch(/^\.mole\/notes\/[^/]+\.md$/);
    const raw = readFileSync(join(root, note.file), 'utf8');
    const lines = raw.split('\n');
    expect(lines[0]).toBe('---');
    expect(raw).toMatch(/^symbol: "?src\/a\.ts#Greeter\.greet"?$/m);
    expect(raw).toMatch(/^path: "?src\/a\.ts"?$/m);
    expect(raw).toMatch(/^kind: "?method"?$/m);
    expect(raw).toMatch(new RegExp(`^hash: "?${findSymbol(root, 'src/a.ts#Greeter.greet')?.hash}"?$`, 'm'));
    expect(raw).toMatch(/^author: "?tester"?$/m);
    expect(raw).toMatch(/^written: "?2026-10-28T00:00:00\.000Z"?$/m);
    expect(raw.trimEnd().endsWith('greets politely; keep the trailing space')).toBe(true);

    const list = memory(root);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ file: note.file, symbol: 'src/a.ts#Greeter.greet', status: 'fresh', path: 'src/a.ts', line: 2 });
    expect(list[0]?.text).toBe('greets politely; keep the trailing space');
  });

  it('two notes on the same symbol get two files; a missing symbol is refused', () => {
    const root = repo({ 'src/a.ts': SRC });
    const n1 = addNote(root, 'src/a.ts#add', 'one', opts);
    const n2 = addNote(root, 'src/a.ts#add', 'two', opts);
    expect(n1.file).not.toBe(n2.file);
    expect(memory(root).map((e) => e.text).sort()).toEqual(['one', 'two']);
    expect(() => addNote(root, 'src/a.ts#missing', 'x', opts)).toThrow();
    expect(() => addNote(root, 'src/nofile.ts#add', 'x', opts)).toThrow();
  });

  it('mole note add / mole memory --json via the CLI', () => {
    const root = repo({ 'src/a.ts': SRC });
    const out = execFileSync('node', [cli, 'note', 'add', 'src/a.ts#add', 'adds two numbers', '--root', root], { encoding: 'utf8' });
    expect(out).toMatch(/\.mole\/notes\/[^\s]+\.md/);
    const files = readFileSync(join(root, out.match(/(\.mole\/notes\/[^\s]+\.md)/)?.[1] ?? 'missing'), 'utf8');
    expect(files).toContain('adds two numbers');
    const json = JSON.parse(execFileSync('node', [cli, 'memory', '--json', '--root', root], { encoding: 'utf8' }));
    expect(json).toHaveLength(1);
    expect(json[0]).toMatchObject({ symbol: 'src/a.ts#add', status: 'fresh', text: 'adds two numbers' });
    write(root, 'src/a.ts', SRC.replace('a + b', 'a - b'));
    const text = execFileSync('node', [cli, 'memory', '--root', root], { encoding: 'utf8' });
    expect(text).toMatch(/stale/);
    expect(text).toContain('src/a.ts#add');
  });
});

describe('stale flag (done-when 2)', () => {
  it('a body change makes the note stale; whitespace-only and comment-only edits stay fresh', () => {
    const root = repo({ 'src/a.ts': SRC });
    addNote(root, 'src/a.ts#Greeter.greet', 'g', opts);
    addNote(root, 'src/a.ts#add', 'a', opts);
    addNote(root, 'src/a.ts#Greeter', 'c', opts);

    // whitespace-only: re-indent, blank lines, spacing
    write(root, 'src/a.ts', SRC.replace("    return 'hi ' + name;", "\n        return   'hi '   +   name ;\n\n").replace('return a + b;', 'return a+b;'));
    expect(statusOf(root, 'src/a.ts#Greeter.greet')?.status).toBe('fresh');
    expect(statusOf(root, 'src/a.ts#add')?.status).toBe('fresh');
    expect(statusOf(root, 'src/a.ts#Greeter')?.status).toBe('fresh');

    // comment-only: line, trailing and block comments
    write(root, 'src/a.ts', SRC.replace("    return 'hi ' + name;", "    // say hello\n    return 'hi ' + name; // trailing\n    /* block\n       comment */").replace('export function add', '/** adds */\nexport function add'));
    expect(statusOf(root, 'src/a.ts#Greeter.greet')?.status).toBe('fresh');
    expect(statusOf(root, 'src/a.ts#add')?.status).toBe('fresh');

    // code change inside greet: greet + its class stale, add untouched
    write(root, 'src/a.ts', SRC.replace("'hi ' + name", "'hello ' + name"));
    expect(statusOf(root, 'src/a.ts#Greeter.greet')).toMatchObject({ status: 'stale', changed: true });
    expect(statusOf(root, 'src/a.ts#Greeter')?.status).toBe('stale');
    expect(statusOf(root, 'src/a.ts#add')?.status).toBe('fresh');
  });

  it('whitespace inside a string literal is a real change', () => {
    const root = repo({ 'src/a.ts': SRC });
    addNote(root, 'src/a.ts#Greeter.greet', 'g', opts);
    write(root, 'src/a.ts', SRC.replace("'hi ' + name", "'hi' + name"));
    expect(statusOf(root, 'src/a.ts#Greeter.greet')?.status).toBe('stale');
  });
});

describe('moved and orphaned (done-when 3)', () => {
  it('a file rename keeps the note attached as moved with the new path', () => {
    const root = repo({ 'src/a.ts': SRC, 'src/other.ts': 'export function other() { return 1; }\n' });
    addNote(root, 'src/a.ts#Greeter.greet', 'g', opts);
    addNote(root, 'src/a.ts#add', 'a', opts);
    mkdirSync(join(root, 'lib/math'), { recursive: true });
    renameSync(join(root, 'src/a.ts'), join(root, 'lib/math/b.ts'));
    const g = statusOf(root, 'src/a.ts#Greeter.greet');
    expect(g).toMatchObject({ status: 'moved', path: 'src/a.ts', newPath: 'lib/math/b.ts', line: 2, text: 'g' });
    expect(g?.changed ?? false).toBe(false);
    expect(statusOf(root, 'src/a.ts#add')).toMatchObject({ status: 'moved', newPath: 'lib/math/b.ts' });
  });

  it('a symbol moved to another file with the same body is moved; a deleted symbol is orphaned, never dropped', () => {
    const root = repo({ 'src/a.ts': SRC, 'src/b.ts': 'export const x = 1;\n' });
    addNote(root, 'src/a.ts#add', 'a', opts);
    addNote(root, 'src/a.ts#mul', 'm', opts);
    const addText = 'export function add(a: number, b: number): number {\n  return a + b;\n}\n';
    write(root, 'src/a.ts', SRC.replace(addText, '').replace('export const mul = (a: number, b: number) => a * b;\n', ''));
    write(root, 'src/b.ts', 'export const x = 1;\n\n' + addText);
    expect(statusOf(root, 'src/a.ts#add')).toMatchObject({ status: 'moved', newPath: 'src/b.ts', line: 3 });
    const m = statusOf(root, 'src/a.ts#mul');
    expect(m).toMatchObject({ status: 'orphaned', text: 'm', path: 'src/a.ts' });
    expect(memory(root)).toHaveLength(2);
  });

  it('deleting the whole file orphans its notes', () => {
    const root = repo({ 'src/a.ts': SRC });
    addNote(root, 'src/a.ts#add', 'a', opts);
    rmSync(join(root, 'src/a.ts'));
    expect(statusOf(root, 'src/a.ts#add')?.status).toBe('orphaned');
  });
});

describe('malformed notes (done-when 5)', () => {
  it('a note with malformed YAML is reported with file:line and does not hide the good notes', () => {
    const root = repo({ 'src/a.ts': SRC });
    addNote(root, 'src/a.ts#add', 'good', opts);
    write(root, '.mole/notes/bad.md', '---\nsymbol: src/a.ts#add\nthis line has no colon\nhash: abc\n---\nbody\n');
    write(root, '.mole/notes/unterminated.md', '---\nsymbol: "src/a.ts#add\npath: src/a.ts\n---\nbody\n');
    write(root, '.mole/notes/noclose.md', '---\nsymbol: src/a.ts#add\npath: src/a.ts\n');
    let list: ReturnType<typeof memory> = [];
    expect(() => (list = memory(root))).not.toThrow();
    expect(list).toHaveLength(4);
    const bad = list.find((e) => e.file === '.mole/notes/bad.md');
    expect(bad).toMatchObject({ status: 'invalid', line: 3 });
    expect(bad?.problem).toMatch(/^\.mole\/notes\/bad\.md:3: /);
    const unterminated = list.find((e) => e.file === '.mole/notes/unterminated.md');
    expect(unterminated).toMatchObject({ status: 'invalid', line: 2 });
    expect(unterminated?.problem).toMatch(/^\.mole\/notes\/unterminated\.md:2: /);
    const noclose = list.find((e) => e.file === '.mole/notes/noclose.md');
    expect(noclose?.status).toBe('invalid');
    expect(noclose?.problem).toMatch(/^\.mole\/notes\/noclose\.md:\d+: /);
    expect(list.find((e) => e.text === 'good')?.status).toBe('fresh');
  });

  it('a note missing required keys is invalid with a line, and the CLI does not crash on it', () => {
    const root = repo({ 'src/a.ts': SRC });
    write(root, '.mole/notes/nokeys.md', '---\nauthor: x\n---\nbody\n');
    const e = memory(root)[0];
    expect(e?.status).toBe('invalid');
    expect(e?.problem).toMatch(/^\.mole\/notes\/nokeys\.md:\d+: .*symbol/);
    const out = execFileSync('node', [cli, 'memory', '--root', root], { encoding: 'utf8' });
    expect(out).toContain('.mole/notes/nokeys.md:');
    expect(existsSync(join(root, '.mole/notes/nokeys.md'))).toBe(true);
  });
});
