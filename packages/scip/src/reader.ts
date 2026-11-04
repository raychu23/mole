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
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { deserializeSCIP, type Index, type Occurrence } from '@c4312/scip';

export type { Index } from '@c4312/scip';

export interface ImportSite {
  file: string; // document relative_path the reference was read in
  line: number; // 1-based
  /** repo-relative path of the project file imported (posix), or an external module name (e.g. 'os', 'urllib.request'). */
  target: string;
  isPath: boolean; // true: target is a repo path; false: target is a module name (matches `to:` module rules)
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
  return deserializeSCIP(readFileSync(path));
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
  return (occ.range[0] ?? 0) + 1;
}

/** Character immediately after an occurrence's own range, read from the real source file on disk (SCIP
 * indexes do not ship document text by default). Used only to tell a call `q()` apart from a plain name
 * reference to the same method-shaped symbol (e.g. the `q` of `from a import q`) -- a one-character check
 * common to every call syntax Mole already supports (TS, and every SCIP source language), not a parser. */
function nextNonSpaceChar(root: string, file: string, occ: Occurrence, cache: Map<string, string | undefined>): string | undefined {
  const key = file;
  if (!cache.has(key)) {
    try {
      cache.set(key, readFileSync(join(root, file), 'utf8'));
    } catch {
      cache.set(key, undefined);
    }
  }
  const text = cache.get(key);
  if (text === undefined) return undefined;
  const lines = text.split(/\r?\n/);
  const line = lines[occ.range[0] ?? 0];
  if (line === undefined) return undefined;
  const endChar = occ.range.length === 4 ? occ.range[3]! : occ.range[2]!;
  let i = endChar;
  while (i < line.length && /\s/.test(line[i]!)) i++;
  return line[i];
}

/** Build the file+symbol sites Mole's rules checker matches `from`/`to`/`callee` rules against. */
export function scipSites(index: Index, root: string): ScipSites {
  const files = index.documents.map((d) => d.relativePath);
  // symbol -> the document it is DEFINED in (every doc.symbols entry, plus any Definition-role occurrence).
  const definedIn = new Map<string, string>();
  for (const doc of index.documents) {
    for (const s of doc.symbols) definedIn.set(s.symbol, doc.relativePath);
    for (const occ of doc.occurrences) if (occ.symbolRoles & 1 /* Definition */) definedIn.set(occ.symbol, doc.relativePath);
  }

  const imports: ImportSite[] = [];
  const calls: CallSite[] = [];
  const firstImportLine = new Map<string, number>(); // `${file}\0${target}` -> min line kept
  const sourceCache = new Map<string, string | undefined>();

  for (const doc of index.documents) {
    const file = doc.relativePath;
    for (const occ of doc.occurrences) {
      if (occ.symbolRoles & 1 /* Definition */) continue; // only references, not the declaration itself
      const sym = occ.symbol;
      if (!sym || sym.startsWith('local ')) continue;
      const targetFile = definedIn.get(sym);
      if (MODULE_SUFFIX.test(sym)) {
        if (targetFile && targetFile === file) continue; // same-file reference, not an import
        const names = descriptorNames(sym);
        const moduleName = names.join('.');
        const target = targetFile ?? moduleName;
        if (!target) continue;
        const key = `${file}\0${target}`;
        const line = lineOf(occ);
        const existing = firstImportLine.get(key);
        if (existing === undefined) {
          firstImportLine.set(key, line);
          imports.push({ file, line, target, isPath: !!targetFile });
        } else if (line < existing) {
          firstImportLine.set(key, line);
          const site = imports.find((s) => s.file === file && s.target === target);
          if (site) site.line = line;
        }
      } else if (METHOD_SUFFIX.test(sym)) {
        const ch = nextNonSpaceChar(root, file, occ, sourceCache);
        if (ch !== '(') continue; // a name reference to a method/function symbol that is not actually called here
        const names = descriptorNames(sym);
        const callee = names.join('.');
        if (!callee) continue;
        calls.push({ file, line: lineOf(occ), callee });
      }
    }
  }
  return { files, imports, calls };
}

export { packageOf };
