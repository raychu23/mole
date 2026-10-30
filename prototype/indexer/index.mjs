#!/usr/bin/env node
// Mole prototype indexer (seed of plan S1.1 / offerings F0.1).
// Builds the "current" layer: files, top-level symbols, imports and calls,
// each with file:line@commit, using the TypeScript Compiler API (type checker,
// so calls through barrels/re-exports resolve to the real declaration).
//
// usage: node indexer/index.mjs --root <repo dir> [--src src] [--name label] [--out data/<name>.js]
// TypeScript: MOLE_TS=<path to typescript package> or a resolvable `typescript`.

import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));

function arg(name, dflt) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : dflt;
}

function loadTs() {
  const candidates = [process.env.MOLE_TS, 'typescript', '/Users/a1/.hermes/hermes-agent/node_modules/typescript'].filter(Boolean);
  for (const c of candidates) {
    try { return require(c); } catch { /* try next */ }
  }
  console.error('typescript not found: set MOLE_TS=/path/to/node_modules/typescript');
  process.exit(1);
}

const ts = loadTs();
const root = path.resolve(arg('root', '.'));
const srcRel = arg('src', 'src');
const srcDir = path.join(root, srcRel);
const name = arg('name', path.basename(root));
const out = path.resolve(arg('out', path.join(here, '..', 'data', `${name}.js`)));
const TEXT_CAP = 200_000; // bytes of source embedded per file (prototype code pane)

const hash8 = (s) => createHash('sha1').update(s).digest('hex').slice(0, 8);
const rel = (f) => path.relative(root, f).split(path.sep).join('/');
const git = (cmd) => { try { return execSync(`git ${cmd}`, { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return null; } };

const t0 = performance.now();

// --- program -------------------------------------------------------------
const cfgPath = ts.findConfigFile(root, ts.sys.fileExists, 'tsconfig.json');
const cfg = cfgPath ? ts.parseJsonConfigFileContent(ts.readConfigFile(cfgPath, ts.sys.readFile).config, ts.sys, root) : { options: {} };
const options = { ...cfg.options, noEmit: true, allowJs: false };
// every .ts/.tsx under src, tests included: index policy decides later what is shown
const rootNames = ts.sys.readDirectory(srcDir, ['.ts', '.tsx'], ['**/node_modules', '**/dist'], undefined);
const program = ts.createProgram({ rootNames, options });
const checker = program.getTypeChecker();
const tProgram = performance.now();

const inProject = (f) => f && f.startsWith(srcDir + path.sep) && !f.includes(`${path.sep}node_modules${path.sep}`);
const sources = program.getSourceFiles().filter((sf) => inProject(sf.fileName));

const isTestPath = (r) => /(^|\/)__tests__\//.test(r) || /\.(test|spec)\.tsx?$/.test(r);
const moduleOf = (r) => {
  const inner = r.slice(srcRel.length + 1);
  const parts = inner.split('/');
  return parts.length > 1 ? parts[0] : '(root)';
};
const lineOf = (sf, pos) => sf.getLineAndCharacterOfPosition(pos).line + 1;

// --- symbols -------------------------------------------------------------
const files = {};
const symbols = {};
const declToSym = new Map(); // ts.Node -> symbol id

function addSym(sf, node, nameText, kind, exported, parentId) {
  const r = rel(sf.fileName);
  const id = parentId ? `${parentId}.${nameText}` : `${r}#${nameText}`;
  if (symbols[id]) return id;
  const text = node.getText(sf);
  symbols[id] = {
    id, name: parentId ? `${symbols[parentId].name}.${nameText}` : nameText, file: r, kind,
    line: lineOf(sf, node.getStart(sf)), end: lineOf(sf, node.getEnd()), exported: !!exported,
    bodyHash: hash8(text),
  };
  declToSym.set(node, id);
  files[r].symbols.push(id);
  return id;
}

const hasExport = (n) => !!(ts.getCombinedModifierFlags(n) & ts.ModifierFlags.Export);

for (const sf of sources) {
  const r = rel(sf.fileName);
  const text = sf.getFullText();
  files[r] = {
    id: r, module: moduleOf(r), lines: sf.getLineStarts().length, bytes: Buffer.byteLength(text),
    test: isTestPath(r), decl: sf.isDeclarationFile, symbols: [],
    text: isTestPath(r) ? null : text.slice(0, TEXT_CAP),
  };
  for (const st of sf.statements) {
    if (ts.isFunctionDeclaration(st) && st.name) addSym(sf, st, st.name.text, 'function', hasExport(st));
    else if (ts.isClassDeclaration(st) && st.name) {
      const cid = addSym(sf, st, st.name.text, 'class', hasExport(st));
      for (const m of st.members) {
        if ((ts.isMethodDeclaration(m) || ts.isPropertyDeclaration(m)) && m.name && ts.isIdentifier(m.name)) addSym(sf, m, m.name.text, 'method', false, cid);
      }
    } else if (ts.isInterfaceDeclaration(st)) addSym(sf, st, st.name.text, 'interface', hasExport(st));
    else if (ts.isTypeAliasDeclaration(st)) addSym(sf, st, st.name.text, 'type', hasExport(st));
    else if (ts.isEnumDeclaration(st)) addSym(sf, st, st.name.text, 'enum', hasExport(st));
    else if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) {
        if (!ts.isIdentifier(d.name)) continue;
        const init = d.initializer;
        const fnLike = init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init) || ts.isCallExpression(init));
        addSym(sf, d, d.name.text, fnLike ? 'function' : 'const', hasExport(st));
      }
    } else if (ts.isExportAssignment(st)) addSym(sf, st, 'default', 'default', true);
  }
}

// --- edges ---------------------------------------------------------------
const imports = []; // file -> file
const callMap = new Map(); // key -> edge
let barrelHops = 0;
let unresolvedCalls = 0;
let typeMemberCalls = 0;

function resolveSpec(spec, fromFile) {
  const res = ts.resolveModuleName(spec, fromFile, options, ts.sys).resolvedModule;
  return res && inProject(res.resolvedFileName) ? res.resolvedFileName : null;
}

function ownerSym(node) {
  for (let n = node; n; n = n.parent) {
    const id = declToSym.get(n);
    if (id) return id;
  }
  return null;
}

function targetOf(expr) {
  let sym = checker.getSymbolAtLocation(expr);
  if (!sym) return null;
  let viaFile = null;
  if (sym.flags & ts.SymbolFlags.Alias) {
    const aliasDecl = sym.declarations?.[0];
    for (let n = aliasDecl; n; n = n.parent) {
      if (ts.isImportDeclaration(n) && ts.isStringLiteral(n.moduleSpecifier)) {
        viaFile = resolveSpec(n.moduleSpecifier.text, n.getSourceFile().fileName);
        break;
      }
    }
    try { sym = checker.getAliasedSymbol(sym); } catch { return null; }
  }
  const decl = sym.declarations?.[0];
  if (!decl || !inProject(decl.getSourceFile().fileName)) return null;
  const id = ownerSym(decl);
  if (!id) return null;
  // a call through an interface/type member (ctx.run() where run is declared on `interface Ctx`)
  // has no concrete callee: recording it as "calls Ctx" would be a wrong edge
  if (symbols[id].kind === 'interface' || symbols[id].kind === 'type') { typeMemberCalls++; return null; }
  if (viaFile && viaFile !== decl.getSourceFile().fileName) barrelHops++;
  return id;
}

for (const sf of sources) {
  const r = rel(sf.fileName);
  const fileSym = `${r}#(module)`;
  const visit = (node) => {
    // imports / re-exports
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      const to = resolveSpec(node.moduleSpecifier.text, sf.fileName);
      if (to) {
        let typeOnly = false;
        if (ts.isImportDeclaration(node)) {
          const ic = node.importClause;
          typeOnly = !!ic && (ic.isTypeOnly || (!ic.name && ic.namedBindings && ts.isNamedImports(ic.namedBindings)
            && ic.namedBindings.elements.length > 0 && ic.namedBindings.elements.every((e) => e.isTypeOnly)));
        } else typeOnly = node.isTypeOnly;
        imports.push({ from: r, to: rel(to), line: lineOf(sf, node.getStart(sf)), typeOnly, reexport: ts.isExportDeclaration(node) });
      }
    }
    // calls, constructors, JSX components
    let callee = null; let kind = null;
    if (ts.isCallExpression(node)) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        const a = node.arguments[0];
        const to = a && ts.isStringLiteral(a) ? resolveSpec(a.text, sf.fileName) : null;
        if (to) imports.push({ from: r, to: rel(to), line: lineOf(sf, node.getStart(sf)), typeOnly: false, reexport: false, dynamic: true });
      } else { callee = node.expression; kind = 'call'; }
    } else if (ts.isNewExpression(node)) { callee = node.expression; kind = 'new'; }
    else if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) { callee = node.tagName; kind = 'jsx'; }
    if (callee) {
      const nameNode = ts.isPropertyAccessExpression(callee) ? callee.name : callee;
      const to = targetOf(nameNode);
      if (to) {
        const from = ownerSym(node) || fileSym;
        if (from !== to) {
          const key = `${from}|${to}`;
          const e = callMap.get(key);
          if (e) e.count++;
          else callMap.set(key, { from, to, kind, line: lineOf(sf, node.getStart(sf)), file: r, count: 1 });
        }
      } else if (kind === 'call' && ts.isIdentifier(nameNode)) unresolvedCalls++;
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

// file-level module pseudo-symbols for top-level code
for (const e of callMap.values()) {
  if (e.from.endsWith('#(module)') && !symbols[e.from]) {
    const f = e.from.slice(0, -'#(module)'.length);
    symbols[e.from] = { id: e.from, name: '(top level)', file: f, kind: 'module', line: 1, end: 1, exported: false, bodyHash: '' };
    files[f].symbols.push(e.from);
  }
}

const tWalk = performance.now();
const commit = git('rev-parse --short HEAD');
const dirty = !!git(`status --porcelain -- ${srcRel}`);

const data = {
  schema: 'mole.prototype.graph/1',
  name, root, src: srcRel,
  commit, dirty,
  engine: `typescript ${ts.version} (Compiler API + type checker)`,
  indexedAt: new Date().toISOString(),
  stats: {
    files: Object.keys(files).length,
    testFiles: Object.values(files).filter((f) => f.test).length,
    symbols: Object.keys(symbols).length,
    imports: imports.length,
    typeOnlyImports: imports.filter((i) => i.typeOnly).length,
    calls: callMap.size,
    barrelHops,
    nonProjectIdentifierCalls: unresolvedCalls, // library/builtin/local calls, not graph edges
    typeMemberCallsSkipped: typeMemberCalls,
    programMs: Math.round(tProgram - t0),
    walkMs: Math.round(tWalk - tProgram),
    totalMs: Math.round(tWalk - t0),
  },
  files, symbols, imports, calls: [...callMap.values()],
};

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `// generated by prototype/indexer/index.mjs — do not edit\nwindow.MOLE_DATA = ${JSON.stringify(data)};\n`);
fs.writeFileSync(out.replace(/\.js$/, '.json'), JSON.stringify({ ...data, files: Object.fromEntries(Object.entries(files).map(([k, v]) => [k, { ...v, text: undefined }])) }, null, 1));
console.log(JSON.stringify({ out, commit, dirty, ...data.stats }, null, 1));
