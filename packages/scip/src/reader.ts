// Reads a SCIP index (github.com/sourcegraph/scip) and turns it into the file + symbol-reference
// sites Mole's rules checker needs: per-site import edges (file -> file, or file -> external module
// name) and call edges (file -> dotted callee name), each with the file:line it was read at.
//
// SCIP (not Mole's own parser) does the language work: scip-python, scip-go, scip-typescript etc.
// each resolve imports/calls for their language and write one `occurrence` per reference, each
// carrying the referenced symbol's string id (scip.proto's `Symbol` grammar: a scheme, a package
// (manager/name/version) and one-or-more descriptors, the last of which ends in a suffix character
// that names its kind: '/' namespace, '#' type, '.' term, ':' meta, '().' method -- see scip.proto
// and https://github.com/sourcegraph/scip/blob/main/scip.proto for the grammar comment this reads).
// Mole reads that suffix to tell an import-like reference (namespace/meta: a module as a whole) from
// a call-like reference (method), instead of hand-writing a parser per language (task stop condition).
//
// T106: bindings switched from `@c4312/scip` (a stale mirror of `sourcegraph/scip`'s old TypeScript
// bindings, last generated against the deprecated `repeated int32 range = 1` encoding) to
// `@scip-code/scip` (the maintained org's own published npm package, version-paired with the Go
// bindings `scip-go` itself depends on). `sourcegraph/scip` moved to `scip-code/scip` and, in PR #387
// ("Make ranges typed oneofs"), replaced the deprecated flat `range`/`enclosing_range` int32 arrays
// with a typed `oneof { SingleLineRange single_line_range = 8; MultiLineRange multi_line_range = 9; }`
// -- current `scip-go` (v0.2.9, confirmed 2026-11-05) writes ONLY the typed form, never the deprecated
// field. `@c4312/scip`'s stale-schema decoder didn't know field 8/9 and silently dropped them into its
// unknown-fields bucket, decoding `occ.range` as `[]` for every occurrence -- not a scip-go bug (T95's
// "ranges are empty" finding was a stale-bindings bug in Mole's own decoder, not in the indexer).
// `occurrenceRange()` below normalizes either encoding to the flat array shape the rest of this file
// already expects, so scip-python (still deprecated-field-only, verified unchanged) and scip-go (typed
// only) both work through the same code.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fromBinary } from '@bufbuild/protobuf';
import { IndexSchema, type Index, type Occurrence } from '@scip-code/scip';

export type { Index } from '@scip-code/scip';

/** `occ`'s source range as a flat `[startLine, startChar, endChar]` / `[startLine, startChar, endLine,
 * endChar]` array, whichever encoding `occ` actually carries (see the T106 comment above): the typed
 * `single_line_range`/`multi_line_range` oneof takes precedence when set (scip.proto's own documented
 * precedence rule), falling back to the deprecated `range` field for indexers that still only write it. */
export function occurrenceRange(occ: Occurrence): number[] {
  switch (occ.typedRange?.case) {
    case 'singleLineRange': {
      const r = occ.typedRange.value;
      return [r.line, r.startCharacter, r.endCharacter];
    }
    case 'multiLineRange': {
      const r = occ.typedRange.value;
      return [r.startLine, r.startCharacter, r.endLine, r.endCharacter];
    }
    default:
      return occ.range ?? [];
  }
}

export interface ImportSite {
  file: string; // document relative_path the reference was read in
  line: number; // 1-based
  /** repo-relative path of the project file imported (posix), or an external module name (e.g. 'os', 'urllib.request'). */
  target: string;
  isPath: boolean; // true: target is a repo path; false: target is a module name (matches `to:` module rules)
  /** the import is inside an `if TYPE_CHECKING:` block and no runtime import of the same target exists in this
   * file (see typeCheckingLines below). Erased at runtime; still reported -- see scipSites's merge rule. */
  typeOnly?: boolean;
}

export interface CallSite {
  file: string;
  line: number;
  /** dotted callee text built from the symbol's own descriptors (e.g. 'os.path.join', 'q'); matched the same way
   * Mole's TS call scan matches source text: exact, or a '.<callee>' suffix. */
  callee: string;
}

export interface ScipSites {
  files: string[]; // every document's relative_path in the index
  imports: ImportSite[];
  calls: CallSite[];
}

/** Read and decode an `index.scip` file (protobuf, github.com/sourcegraph/scip wire format). */
export function readScipIndex(path: string): Index {
  return fromBinary(IndexSchema, readFileSync(path));
}

// scip.proto Symbol grammar: the last descriptor's suffix character says what kind of symbol this is.
// '/' namespace (a package or, in scip-python, every module's own namespace form), ':' meta (scip-python
// also uses this for a module's synthetic `__init__` symbol -- see scip-python's symbols.ts
// `makeModuleInit`), '().'/')<disambiguator>.' method, '#' type, '.' term, '!' macro, '[x]' type-parameter,
// '(x)' parameter. A trailing backtick-escaped name (`` `a.b.c` ``) is one escaped identifier, not a path.
const MODULE_SUFFIX = /[/:]$/;
const METHOD_SUFFIX = /\)(?:`[^`]*`)?\.$/;

/** The descriptor chain of a symbol string, each name unescaped (backticks stripped), in order. */
function descriptorNames(symbol: string): string[] {
  // '<scheme> <manager> <package-name> <version> <descriptor>+' (space-escaped as '  '); 'local <id>' has none.
  if (symbol.startsWith('local ')) return [];
  const parts = symbol.split(' ');
  if (parts.length < 4) return [];
  const tail = parts.slice(4).join(' ');
  const names: string[] = [];
  const re = /`([^`]*)`|([^/#.:!()[\]]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tail))) names.push(m[1] ?? m[2] ?? '');
  const out = names.filter(Boolean);
  // scip-python represents "the module itself" as a synthetic trailing `__init__:` meta descriptor on
  // every module (not just packages) -- see its symbols.ts `makeModuleInit`. Drop it from the dotted
  // name: the module's own import name is its namespace chain, not '<module>.__init__'.
  if (out[out.length - 1] === '__init__') out.pop();
  return out;
}

function packageOf(symbol: string): { manager: string; name: string } | undefined {
  if (symbol.startsWith('local ')) return undefined;
  const parts = symbol.split(' ');
  if (parts.length < 4) return undefined;
  return { manager: parts[1]!, name: parts[2]! };
}

function lineOf(occ: Occurrence): number {
  return (occurrenceRange(occ)[0] ?? 0) + 1;
}

/** Read (and cache) a source file's lines, from disk -- SCIP indexes do not ship document text by default
 * (verified against scip-python 0.6.8: `Document.text` is empty), so recovering source text for a reference
 * (a relative-import's dotted path, or whether a reference is really a call) means reading the real file. */
function sourceLines(root: string, file: string, cache: Map<string, string[] | undefined>): string[] | undefined {
  if (!cache.has(file)) {
    try {
      cache.set(file, readFileSync(join(root, file), 'utf8').split(/\r?\n/));
    } catch {
      cache.set(file, undefined);
    }
  }
  return cache.get(file);
}

/** Character immediately after an occurrence's own range, read from the real source file on disk. Used only to
 * tell a call `q()` apart from a plain name reference to the same method-shaped symbol (e.g. the `q` of
 * `from a import q`) -- a one-character check common to every call syntax Mole already supports. */
function nextNonSpaceChar(root: string, file: string, occ: Occurrence, cache: Map<string, string[] | undefined>): string | undefined {
  const range = occurrenceRange(occ);
  const lines = sourceLines(root, file, cache);
  const line = lines?.[range[0] ?? 0];
  if (line === undefined) return undefined;
  const endChar = range.length === 4 ? range[3]! : range[2]!;
  let i = endChar;
  while (i < line.length && /\s/.test(line[i]!)) i++;
  return line[i];
}

// scip-python's relative-import encoding (verified against scip-python 0.6.8, see
// packages/scip/test/fixtures/counterfixture/HOW-PRODUCED.md): an absolute `from a.b import c` resolves the
// module reference to the fully-qualified symbol of `a.b` (its own `` `a.b`/__init__: `` descriptor), but a
// *relative* `from . import leaf` / `from .leaf import helper` resolves the module part to an UNQUALIFIED
// descriptor built only from the written name ('leaf'), with no package prefix and no record of how many dots
// were written -- so it can never match `definedIn`'s fully-qualified keys, and the reader has to recover the
// real target from the import statement's own source text plus the importing file's own path.
const RELATIVE_IMPORT = /^\s*from\s+(\.+)([\w][\w.]*)?\s+import\b/;

// Review round-2 HIGH-2: a multi-line `from . import (\n    leaf,\n)` (or `from .. import (a,\n b)`, or a
// backslash-continued `from . import \\\n    leaf`) puts the occurrence scip-python emits for each imported
// name on its OWN line (the continuation line), which never matches RELATIVE_IMPORT by itself -- only the
// statement's first line ("from . import (") does. So the reader has to find each occurrence's *statement
// start* line first (scanning back through still-open parens and backslash continuations, like Python itself
// does), and match RELATIVE_IMPORT against THAT line's text, not the occurrence's own line.

/** For every line index, the index of the line that starts its logical (post-continuation) statement -- itself,
 * unless the line continues an earlier one. Follows Python's own line joining (Python Language Reference,
 * "Lexical analysis" 2.1.5 explicit / 2.1.6 implicit line joining, 2.4.1 string literals, and PEP 701 f-strings
 * for Python 3.12+): a line continues the previous statement when it starts inside an open bracket, inside any
 * string still open (triple-quoted, or single-quoted continued by a backslash-newline, or an f-string replacement
 * field), or after a line ending in `\` outside a string or comment. Brackets in comments and strings never
 * count. Review rounds 3-5: comment/docstring brackets, backslash-continued strings, nested same-quote f-strings.
 * Verified against CPython's tokenize (tasks/T95-scip-multilang/4 log/diff-tokenize-*). */
type LexCtx =
  | { k: 'code'; depth: number } // top level (index 0) or an f-string replacement-field expression
  | { k: 'str'; q: string; triple: boolean; f: boolean; raw: boolean }
  | { k: 'spec' }; // an f-string format spec after `:`; `{...}` nests, `}` closes the field
export function statementStarts(lines: string[]): number[] {
  const continues: boolean[] = new Array(lines.length).fill(false);
  const stack: LexCtx[] = [{ k: 'code', depth: 0 }];
  let backslash = false;
  const isIdent = (c: string | undefined) => c !== undefined && /[A-Za-z0-9_]/.test(c);
  for (let i = 0; i < lines.length; i++) {
    const root = stack[0] as { k: 'code'; depth: number };
    continues[i] = stack.length > 1 || root.depth > 0 || backslash;
    backslash = false;
    const raw = lines[i]!;
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw; // CRLF
    const end = line.length;
    let strContinued = false; // the line ended in an escaping backslash inside a string
    let k = 0;
    while (k < end) {
      const top = stack[stack.length - 1]!;
      const ch = line[k]!;
      if (top.k === 'str') {
        if (ch === '\\') {
          if (k === end - 1) { strContinued = true; k = end; break; }
          const next = line[k + 1];
          // a backslash only hides the quote or another backslash from the tokenizer; `\{` in an f-string still
          // opens a replacement field (raw or not), except the named escape `\N{...}` in a non-raw f-string
          if (next === top.q || next === '\\') { k += 2; continue; }
          if (top.f && !top.raw && next === 'N' && line[k + 2] === '{') {
            const close = line.indexOf('}', k + 3);
            k = close < 0 ? end : close + 1; continue;
          }
          k++; continue;
        }
        if (top.f && ch === '{') {
          if (line[k + 1] === '{') { k += 2; continue; }
          stack.push({ k: 'code', depth: 0 }); k++; continue;
        }
        if (top.f && ch === '}') { k += line[k + 1] === '}' ? 2 : 1; continue; }
        if (top.triple ? line.startsWith(top.q.repeat(3), k) : ch === top.q) {
          stack.pop(); k += top.triple ? 3 : 1; continue;
        }
        k++; continue;
      }
      if (top.k === 'spec') {
        if (ch === '{') { stack.push({ k: 'code', depth: 0 }); k++; continue; }
        if (ch === '}') { stack.pop(); k++; continue; } // closes the replacement field
        k++; continue;
      }
      // code (top level or a replacement-field expression)
      if (ch === '#') break; // comment to end of line
      if (ch === '"' || ch === "'") {
        let p = k; // string prefix letters just before the quote (r, b, f, u and combinations)
        while (p > 0 && /[rRbBfFuU]/.test(line[p - 1]!)) p--;
        const prefix = isIdent(line[p - 1]) ? '' : line.slice(p, k);
        const triple = line.startsWith(ch.repeat(3), k);
        stack.push({ k: 'str', q: ch, triple, f: /f/i.test(prefix), raw: /r/i.test(prefix) });
        k += triple ? 3 : 1; continue;
      }
      if (ch === '(' || ch === '[' || ch === '{') { top.depth++; k++; continue; }
      if (ch === ')' || ch === ']') { if (top.depth > 0) top.depth--; k++; continue; }
      if (ch === '}') {
        if (top.depth > 0) top.depth--;
        else if (stack.length > 1) stack.pop(); // end of a replacement field
        k++; continue;
      }
      if (ch === ':' && stack.length > 1 && top.depth === 0 && line[k + 1] !== '=') {
        stack[stack.length - 1] = { k: 'spec' }; k++; continue;
      }
      if (ch === '\\' && k === line.replace(/\s+$/, '').length - 1) backslash = true;
      k++;
    }
    // an unterminated single-quoted string (no backslash-newline) is a SyntaxError in Python: drop it, and any
    // replacement fields opened inside it, rather than carry it into the next line
    if (!strContinued) {
      let j = stack.length - 1;
      while (j > 0) {
        const c = stack[j]!;
        if (c.k === 'str' && !c.triple) { stack.length = j; }
        j--;
      }
    }
  }
  const starts: number[] = new Array(lines.length);
  for (let i = 0; i < lines.length; i++) starts[i] = continues[i] && i > 0 ? starts[i - 1]! : i;
  return starts;
}

/** Resolve a relative-import module reference to a repo-relative path, or undefined if the source line is not a
 * recognizable relative import or the computed target is not one of the index's own files.
 * `file` is the importING file's own relative_path; `names` is the unqualified symbol's own descriptor chain
 * (e.g. ['leaf'] for both `from . import leaf` and `from .leaf import helper`'s module reference). */
function resolveRelativeImport(file: string, lineText: string, names: string[], files: Set<string>): string | undefined {
  const m = RELATIVE_IMPORT.exec(lineText);
  if (!m) return undefined;
  const dots = m[1]!;
  const modulePath = m[2]; // undefined for `from . import x`, 'pkg.sub' for `from ..pkg.sub import x`
  const levelsUp = dots.length - 1; // one dot = the current package, each further dot = one package up
  const slash = file.lastIndexOf('/');
  const dirParts = slash < 0 ? [] : file.slice(0, slash).split('/');
  if (levelsUp > dirParts.length) return undefined; // `from .... import x` past the repo root: can't resolve
  const baseDir = dirParts.slice(0, dirParts.length - levelsUp);
  const modParts = modulePath ? modulePath.split('.').filter(Boolean) : names;
  if (modParts.length === 0) return undefined;
  const base = [...baseDir, ...modParts].join('/');
  if (files.has(`${base}.py`)) return `${base}.py`;
  if (files.has(`${base}/__init__.py`)) return `${base}/__init__.py`;
  return undefined;
}

// `if TYPE_CHECKING:` (or `if typing.TYPE_CHECKING:`) blocks: everything indented deeper than the `if` line,
// until a non-blank line at the same or shallower indentation. Indentation-based, like Python itself; good
// enough to label the common case (PEP 484's own idiom) without a real Python parser.
const TYPE_CHECKING_IF = /^(\s*)if\s+(?:typing\.)?TYPE_CHECKING\s*:\s*$/;
const indentOf = (line: string): number => line.length - line.trimStart().length;

/** 1-based line numbers that fall inside an `if TYPE_CHECKING:` block of `lines`. */
function typeCheckingLines(lines: string[]): Set<number> {
  const out = new Set<number>();
  for (let i = 0; i < lines.length; i++) {
    const m = TYPE_CHECKING_IF.exec(lines[i]!);
    if (!m) continue;
    const blockIndent = m[1]!.length;
    for (let j = i + 1; j < lines.length; j++) {
      const l = lines[j]!;
      if (l.trim() === '') continue; // blank lines don't end the block
      if (indentOf(l) <= blockIndent) break;
      out.add(j + 1);
    }
  }
  return out;
}

/** Build the file+symbol sites Mole's rules checker matches `from`/`to`/`callee` rules against. */
export function scipSites(index: Index, root: string): ScipSites {
  const files = index.documents.map((d) => d.relativePath);
  const fileSet = new Set(files);
  // symbol -> the document it is DEFINED in (every doc.symbols entry, plus any Definition-role occurrence).
  const definedIn = new Map<string, string>();
  for (const doc of index.documents) {
    for (const s of doc.symbols) definedIn.set(s.symbol, doc.relativePath);
    for (const occ of doc.occurrences) if (occ.symbolRoles & 1 /* Definition */) definedIn.set(occ.symbol, doc.relativePath);
  }

  const imports: ImportSite[] = [];
  const calls: CallSite[] = [];
  const importByKey = new Map<string, ImportSite>(); // `${file}\0${target}` -> the kept site (see merge rule below)
  const sourceCache = new Map<string, string[] | undefined>();
  const typeCheckingCache = new Map<string, Set<number>>();
  const statementStartCache = new Map<string, number[]>();

  for (const doc of index.documents) {
    const file = doc.relativePath;
    const lines = sourceLines(root, file, sourceCache);
    if (!typeCheckingCache.has(file)) typeCheckingCache.set(file, lines ? typeCheckingLines(lines) : new Set());
    const typeLines = typeCheckingCache.get(file)!;
    if (!statementStartCache.has(file)) statementStartCache.set(file, lines ? statementStarts(lines) : []);
    const starts = statementStartCache.get(file)!;

    // First pass: resolve every relative-import symbol this document's own import statements introduce, keyed by
    // the unqualified symbol string -- so a LATER reference to the same bound name (e.g. `leaf.helper()` after
    // `from . import leaf`, which repeats the same unqualified `leaf/__init__:` symbol on a non-import line) still
    // resolves to the real file instead of falling back to treating the name as an external module (review HIGH-2).
    // The occurrence's own line is matched against RELATIVE_IMPORT only when it IS the statement start; a
    // multi-line parenthesized or backslash-continued import's occurrence lives on a later line, so the lookup
    // goes through `starts` to the real "from ... import (" line first (review round-2 HIGH-2).
    const relativeResolved = new Map<string, string>();
    if (lines) {
      for (const occ of doc.occurrences) {
        if (occ.symbolRoles & 1 /* Definition */) continue;
        const sym = occ.symbol;
        if (!sym || sym.startsWith('local ') || !MODULE_SUFFIX.test(sym) || definedIn.has(sym) || relativeResolved.has(sym)) continue;
        const occLine = occurrenceRange(occ)[0] ?? 0; // typed ranges leave occ.range empty (T106 review)
        const startLine = starts[occLine] ?? occLine;
        const resolved = resolveRelativeImport(file, lines[startLine] ?? '', descriptorNames(sym), fileSet);
        if (resolved) relativeResolved.set(sym, resolved);
      }
    }

    for (const occ of doc.occurrences) {
      if (occ.symbolRoles & 1 /* Definition */) continue; // only references, not the declaration itself
      const sym = occ.symbol;
      if (!sym || sym.startsWith('local ')) continue;
      const line = lineOf(occ);
      if (MODULE_SUFFIX.test(sym)) {
        const targetFile = definedIn.get(sym) ?? relativeResolved.get(sym);
        const names = descriptorNames(sym);
        const moduleName = names.join('.');
        if (targetFile && targetFile === file) continue; // same-file reference, not an import
        const target = targetFile ?? moduleName;
        if (!target) continue;
        const typeOnly = typeLines.has(line);
        const key = `${file}\0${target}`;
        const existing = importByKey.get(key);
        if (!existing) {
          const site: ImportSite = { file, line, target, isPath: !!targetFile, ...(typeOnly ? { typeOnly: true } : {}) };
          importByKey.set(key, site);
          imports.push(site);
        } else {
          // keep the runtime (non-type-only) import's line over a TYPE_CHECKING-only one wherever both exist
          // (review: "report the runtime import line when both exist"); otherwise keep the first occurrence.
          const preferNew = (existing.typeOnly && !typeOnly) || (!!existing.typeOnly === typeOnly && line < existing.line);
          if (preferNew) {
            existing.line = line;
            if (typeOnly) existing.typeOnly = true;
            else delete existing.typeOnly;
          }
        }
      } else if (METHOD_SUFFIX.test(sym)) {
        const ch = nextNonSpaceChar(root, file, occ, sourceCache);
        if (ch !== '(') continue; // a name reference to a method/function symbol that is not actually called here
        const names = descriptorNames(sym);
        const callee = names.join('.');
        if (!callee) continue;
        calls.push({ file, line, callee });
      }
    }
  }
  return { files, imports, calls };
}

export { packageOf };
