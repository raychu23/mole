// Note files (.mole/notes/<slug>.md): a tiny YAML front-matter subset (key: value, plain or quoted) + plain-words body.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CodeSymbol, MemoryEntry, Note, NoteOptions } from './index.js';
import { findSymbol, sourceFiles, splitTarget, symbolsInFile } from './symbols.js';

export const NOTES_DIR = '.mole/notes';
const REQUIRED = ['symbol', 'hash'] as const;

function author(root: string): string {
  try {
    const name = execFileSync('git', ['-C', root, 'config', 'user.name'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (name) return name;
  } catch {
    // not a git repo or no user.name
  }
  return process.env.USER ?? process.env.USERNAME ?? 'unknown';
}

const slugOf = (qualifiedName: string) =>
  qualifiedName
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120) || 'note';

export function addNote(root: string, target: string, text: string, opts: NoteOptions = {}): Note {
  const body = text.trim();
  if (!body) throw new Error('mole note: empty note text');
  const sym = findSymbol(root, target);
  if (!sym) {
    const t = splitTarget(root, target);
    const known = t ? symbolsInFile(root, t.path).map((s) => s.tail) : [];
    throw new Error(
      `mole note: no symbol ${target}` + (t && !existsSync(join(root, t.path)) ? ` (file ${t.path} not found)` : known.length ? ` (symbols in file: ${known.slice(0, 12).join(', ')})` : ''),
    );
  }
  const dir = join(root, NOTES_DIR);
  mkdirSync(dir, { recursive: true });
  const base = slugOf(sym.qualifiedName);
  let name = `${base}.md`;
  for (let i = 2; existsSync(join(dir, name)); i++) name = `${base}-${i}.md`;
  const written = opts.date instanceof Date ? opts.date.toISOString() : (opts.date ?? new Date().toISOString());
  const note: Note = {
    file: `${NOTES_DIR}/${name}`,
    symbol: sym.qualifiedName,
    path: sym.path,
    kind: sym.kind,
    hash: sym.hash,
    author: opts.author ?? author(root),
    written,
    text: body,
  };
  const q = (v: string) => JSON.stringify(v);
  const front = ['---', `symbol: ${q(note.symbol)}`, `path: ${q(note.path)}`, `kind: ${note.kind}`, `hash: ${note.hash}`, `author: ${q(note.author)}`, `written: ${q(note.written)}`, '---'];
  writeFileSync(join(root, note.file), `${front.join('\n')}\n\n${body}\n`);
  return note;
}

type Parsed = { note?: Note; problem?: { line: number; message: string } };

/** Parse a note's text. Never throws: a malformed note yields { problem: { line (1-based), message } }. */
export function parseNote(content: string, file: string): Parsed {
  const lines = content.replace(/^\uFEFF/, '').split(/\r?\n/);
  if ((lines[0] ?? '').trim() !== '---') return { problem: { line: 1, message: 'front matter must start with a "---" line' } };
  const close = lines.findIndex((l, i) => i > 0 && l.trim() === '---');
  if (close < 0) return { problem: { line: 1, message: 'front matter opened here is never closed by a "---" line' } };
  const fields = new Map<string, { value: string; line: number }>();
  for (let i = 1; i < close; i++) {
    const raw = lines[i] ?? '';
    if (raw.trim() === '' || raw.trim().startsWith('#')) continue;
    const m = /^([A-Za-z_][\w-]*)[ \t]*:(?:[ \t]+(.*))?$/.exec(raw.trimEnd());
    if (!m) return { problem: { line: i + 1, message: `expected "key: value", got ${JSON.stringify(raw.trim().slice(0, 60))}` } };
    const key = m[1]!;
    let value = (m[2] ?? '').trim();
    if (value.startsWith('"')) {
      if (value.length < 2 || !value.endsWith('"')) return { problem: { line: i + 1, message: `unterminated double-quoted value for "${key}"` } };
      try {
        value = JSON.parse(value) as string;
      } catch {
        return { problem: { line: i + 1, message: `invalid double-quoted value for "${key}"` } };
      }
    } else if (value.startsWith("'")) {
      if (value.length < 2 || !value.endsWith("'")) return { problem: { line: i + 1, message: `unterminated single-quoted value for "${key}"` } };
      value = value.slice(1, -1).replace(/''/g, "'");
    } else {
      value = value.replace(/\s+#.*$/, '').trim();
      if (/^[[{|>&*!]/.test(value)) return { problem: { line: i + 1, message: `unsupported YAML value for "${key}" (use a plain or quoted string)` } };
    }
    if (fields.has(key)) return { problem: { line: i + 1, message: `duplicate key "${key}" (first on line ${fields.get(key)!.line})` } };
    fields.set(key, { value, line: i + 1 });
  }
  for (const k of REQUIRED) if (!fields.get(k)?.value) return { problem: { line: close + 1, message: `missing required key "${k}" in front matter` } };
  const symbol = fields.get('symbol')!;
  const hashOf = symbol.value.indexOf('#');
  if (hashOf <= 0 || hashOf === symbol.value.length - 1) return { problem: { line: symbol.line, message: `symbol must look like "path/to/file.ts#Name", got ${JSON.stringify(symbol.value)}` } };
  const get = (k: string) => fields.get(k)?.value ?? '';
  return {
    note: {
      file,
      symbol: symbol.value,
      path: get('path') || symbol.value.slice(0, hashOf),
      kind: get('kind'),
      hash: get('hash'),
      author: get('author'),
      written: get('written'),
      text: lines.slice(close + 1).join('\n').trim(),
    },
  };
}

/** Where a note's symbol is now. */
function locate(root: string, note: Note, repo: () => CodeSymbol[]): Pick<MemoryEntry, 'status' | 'newPath' | 'line' | 'changed'> {
  const tail = note.symbol.slice(note.symbol.indexOf('#') + 1);
  const here = symbolsInFile(root, note.path).find((s) => s.tail === tail);
  if (here) return { status: here.hash === note.hash ? 'fresh' : 'stale', line: here.startLine, changed: here.hash !== note.hash };
  const elsewhere = repo().filter((s) => s.path !== note.path);
  const sameTail = elsewhere.filter((s) => s.tail === tail);
  const same = sameTail.find((s) => s.hash === note.hash);
  if (same) return { status: 'moved', newPath: same.path, line: same.startLine, changed: false };
  // a same-named symbol elsewhere with a different body is not this note's code: no name-only re-anchoring (T11 review P1-1)
  // a renamed container (class Foo -> Bar) keeps the member's last name segment and its body
  const last = tail.slice(tail.lastIndexOf('.') + 1);
  const renamed = [...symbolsInFile(root, note.path), ...elsewhere].filter((s) => s.tail.slice(s.tail.lastIndexOf('.') + 1) === last && s.hash === note.hash && s.kind === note.kind);
  if (renamed.length === 1) return { status: 'moved', newPath: renamed[0]!.path, line: renamed[0]!.startLine, changed: false };
  return { status: 'orphaned', changed: true };
}

/** Every note file under .mole/notes, sorted by file name, with its current status. Never throws on a bad note. */
export function memory(root: string): MemoryEntry[] {
  const dir = join(root, NOTES_DIR);
  let names: string[] = [];
  try {
    names = readdirSync(dir).filter((n) => n.endsWith('.md')).sort();
  } catch {
    return [];
  }
  let repoSyms: CodeSymbol[] | undefined;
  const repo = () => (repoSyms ??= sourceFiles(root).flatMap((f) => symbolsInFile(root, f)));
  return names.map((n): MemoryEntry => {
    const file = `${NOTES_DIR}/${n}`;
    let content: string;
    try {
      content = readFileSync(join(dir, n), 'utf8');
    } catch (e) {
      return { file, status: 'invalid', line: 1, text: '', problem: `${file}:1: cannot read note (${e instanceof Error ? e.message : String(e)})` };
    }
    const { note, problem } = parseNote(content, file);
    if (!note) {
      const line = problem?.line ?? 1;
      return { file, status: 'invalid', line, text: '', problem: `${file}:${line}: ${problem?.message ?? 'unreadable note'}` };
    }
    let where: ReturnType<typeof locate>;
    try {
      where = locate(root, note, repo);
    } catch (e) {
      where = { status: 'orphaned', changed: true };
      return { file, symbol: note.symbol, path: note.path, ...where, text: note.text, author: note.author, written: note.written, problem: `${file}:1: ${e instanceof Error ? e.message : String(e)}` };
    }
    return { file, symbol: note.symbol, path: note.path, ...where, text: note.text, author: note.author, written: note.written };
  });
}
