// Ground truth for the M1.5 tickets, built with the TypeScript LANGUAGE SERVICE (findReferences / getDefinitionAtPosition),
// a different code path from the one Mole's index uses (type-checker symbol walk in packages/indexer). Both are TypeScript, so
// they are correlated; every answer key is also spot-checked against grep in tickets.mjs.
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ts = createRequire(join(here, '../../../../package.json'))('typescript');

export const TEST = /(?:^|\/)(?:__tests__|tests?)\/|\.(?:test|spec)\.[cm]?[jt]sx?$/;

export function openProject(root, tsconfig, srcPrefix = 'src/') {
  const cfgPath = join(root, tsconfig);
  const cfg = ts.readConfigFile(cfgPath, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(cfg.config, ts.sys, root, undefined, cfgPath);
  const options = { ...parsed.options, noEmit: true, composite: false };
  const files = [];
  (function walk(d) {
    for (const e of ts.sys.readDirectory(d, ['.ts', '.tsx'], ['**/node_modules'])) files.push(resolve(e));
  })(join(root, 'src'));
  const uniq = [...new Set(files)].filter((f) => !f.endsWith('.d.ts') || f.includes('/src/types/'));
  const host = {
    getScriptFileNames: () => uniq,
    getScriptVersion: () => '1',
    getScriptSnapshot: (f) => (existsSync(f) ? ts.ScriptSnapshot.fromString(readFileSync(f, 'utf8')) : undefined),
    getCurrentDirectory: () => root,
    getCompilationSettings: () => options,
    getDefaultLibFileName: (o) => ts.getDefaultLibFilePath(o),
    fileExists: ts.sys.fileExists, readFile: ts.sys.readFile, readDirectory: ts.sys.readDirectory,
    directoryExists: ts.sys.directoryExists, getDirectories: ts.sys.getDirectories,
  };
  const ls = ts.createLanguageService(host, ts.createDocumentRegistry());
  const program = ls.getProgram();
  const rel = (f) => relative(root, f).split(sep).join('/');
  const inSrc = (f) => rel(f).startsWith(srcPrefix);
  return { ts, ls, program, rel, inSrc, root, files: uniq };
}

/** Top-level function-like declarations of a file: [{ name, node, line }] (function decls and const f = () => ...). */
export function topFunctions(p, sf) {
  const { ts } = p;
  const out = [];
  for (const st of sf.statements) {
    if (ts.isFunctionDeclaration(st) && st.name && st.body) out.push({ name: st.name.text, node: st, nameNode: st.name });
    else if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) {
        const init = d.initializer;
        if (ts.isIdentifier(d.name) && init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) out.push({ name: d.name.text, node: init, nameNode: d.name });
      }
    }
  }
  return out;
}

const enclosing = (p, node) => {
  const { ts } = p;
  for (let n = node.parent; n; n = n.parent) {
    if (ts.isFunctionDeclaration(n) && n.name) return { name: n.name.text, file: n.getSourceFile().fileName, nameNode: n.name, top: ts.isSourceFile(n.parent) };
    if ((ts.isArrowFunction(n) || ts.isFunctionExpression(n)) && ts.isVariableDeclaration(n.parent) && ts.isIdentifier(n.parent.name)) return { name: n.parent.name.text, file: n.getSourceFile().fileName, nameNode: n.parent.name, top: ts.isSourceFile(n.parent.parent?.parent?.parent) };
    if (ts.isMethodDeclaration(n) && n.name && ts.isIdentifier(n.name) && n.parent.name) return { name: `${n.parent.name.text}.${n.name.text}`, file: n.getSourceFile().fileName, nameNode: n.name, top: false };
  }
  return undefined;
};

/** Direct call sites of the function declared at nameNode: [{ file, line, caller: {name,file}|undefined }] (language service references that are call expressions). */
export function callSites(p, file, nameNode) {
  const { ts, ls, program } = p;
  const refs = ls.findReferences(file, nameNode.getStart()) ?? [];
  const out = [];
  for (const group of refs) for (const r of group.references) {
    if (r.isDefinition) continue;
    const sf = program.getSourceFile(r.fileName);
    if (!sf) continue;
    const node = findNode(ts, sf, r.textSpan.start);
    let call = node;
    while (call && !ts.isCallExpression(call) && !ts.isNewExpression(call) && call.parent && !ts.isStatement(call)) call = call.parent;
    if (!call || !(ts.isCallExpression(call) || ts.isNewExpression(call))) continue;
    // the reference must be the callee (or its property name), not an argument
    const callee = call.expression;
    const calleeEnd = callee.getEnd();
    if (!(r.textSpan.start >= callee.getStart(sf) && r.textSpan.start < calleeEnd)) continue;
    out.push({ file: r.fileName, line: sf.getLineAndCharacterOfPosition(r.textSpan.start).line + 1, caller: enclosing(p, call) });
  }
  return out;
}

function findNode(ts, sf, pos) {
  let best = sf;
  const walk = (n) => {
    if (pos >= n.getStart(sf) && pos < n.getEnd()) {
      best = n;
      ts.forEachChild(n, walk);
    }
  };
  ts.forEachChild(sf, walk);
  return best;
}

/** Files that import `file` (static import/export-from, resolved by TypeScript). */
export function importersOf(p, file) {
  const { ts, program } = p;
  const target = resolve(file);
  const out = new Set();
  for (const sf of program.getSourceFiles()) {
    if (!p.inSrc(sf.fileName)) continue;
    for (const st of sf.statements) {
      const spec = (ts.isImportDeclaration(st) || ts.isExportDeclaration(st)) && st.moduleSpecifier && ts.isStringLiteral(st.moduleSpecifier) ? st.moduleSpecifier.text : undefined;
      if (!spec) continue;
      const r = ts.resolveModuleName(spec, sf.fileName, program.getCompilerOptions(), ts.sys).resolvedModule;
      if (r && resolve(r.resolvedFileName) === target) out.add(resolve(sf.fileName));
    }
  }
  return [...out];
}
