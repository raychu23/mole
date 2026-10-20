// Ground truth: what the TypeScript *language service* says each call site resolves to.
// (Compiler API engine uses the type checker directly; go-to-definition is a separate code path, but
//  both are TypeScript, so TS-engine recall is partly circular. Report says so.)
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { leaf, relTo } from './common.mjs';

const require = createRequire(import.meta.url);
const ts = require('typescript');

export function buildTruth(root, tsconfig, files) {
  const cfgPath = resolve(root, tsconfig);
  const cfg = ts.readConfigFile(cfgPath, ts.sys.readFile);
  const options = { ...ts.parseJsonConfigFileContent(cfg.config, ts.sys, dirname(cfgPath), undefined, cfgPath).options, noEmit: true, composite: false };
  const host = {
    getScriptFileNames: () => files,
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
  const checker = program.getTypeChecker();
  const inProject = new Set(files.map((f) => resolve(f)));
  const unwrap = (e) => { let c = e; while (ts.isParenthesizedExpression(c) || ts.isNonNullExpression(c) || ts.isAsExpression(c)) c = c.expression; return c; };
  const topLevel = (n) => ts.isSourceFile(n.parent) || ts.isModuleBlock(n.parent);
  const nm = (n) => (n && (ts.isIdentifier(n) || ts.isStringLiteral(n)) ? n.text : undefined);

  /** Is this declaration something every engine is expected to produce as a node? */
  function declTarget(d) {
    const sf = d.getSourceFile();
    if (!inProject.has(resolve(sf.fileName))) return undefined;
    const tfile = relTo(root, sf.fileName);
    const owner = (m) => (ts.isClassDeclaration(m.parent) || ts.isInterfaceDeclaration(m.parent)) && m.parent.name && topLevel(m.parent) ? m.parent.name.text : undefined;
    if (ts.isFunctionDeclaration(d) && d.name && topLevel(d)) return { tfile, tleaf: d.name.text, kind: 'fn' };
    if (ts.isClassDeclaration(d) && d.name && topLevel(d)) return { tfile, tleaf: d.name.text, kind: 'class' };
    if (ts.isConstructorDeclaration(d) && owner(d)) return { tfile, tleaf: owner(d), kind: 'class' };
    if (ts.isMethodDeclaration(d) || ts.isGetAccessorDeclaration(d) || ts.isSetAccessorDeclaration(d)) return owner(d) && nm(d.name) ? { tfile, tleaf: nm(d.name), kind: 'method' } : undefined;
    if (ts.isMethodSignature(d)) return owner(d) && nm(d.name) ? { tfile, tleaf: nm(d.name), kind: 'iface-member' } : undefined;
    if (ts.isPropertySignature(d) || ts.isPropertyDeclaration(d)) {
      if (!owner(d) || !nm(d.name)) return undefined;
      const init = ts.isPropertyDeclaration(d) && d.initializer ? unwrap(d.initializer) : undefined;
      const fn = (init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) || (d.type && ts.isFunctionTypeNode(d.type));
      return fn ? { tfile, tleaf: nm(d.name), kind: ts.isPropertySignature(d) ? 'iface-member' : 'method' } : undefined;
    }
    if (ts.isVariableDeclaration(d) && ts.isIdentifier(d.name) && ts.isVariableDeclarationList(d.parent) && ts.isVariableStatement(d.parent.parent) && topLevel(d.parent.parent)) return { tfile, tleaf: d.name.text, kind: 'var' };
    return undefined;
  }

  /** import binding of the callee's leftmost identifier: { moduleText, resolvedFile } or undefined. */
  function importOf(id, containing) {
    const sym = checker.getSymbolAtLocation(id);
    const d = sym?.declarations?.[0];
    if (!d) return undefined;
    let decl = d;
    while (decl && !ts.isImportDeclaration(decl)) decl = decl.parent;
    if (!decl || !ts.isStringLiteral(decl.moduleSpecifier)) return undefined;
    const text = decl.moduleSpecifier.text;
    const r = ts.resolveModuleName(text, containing, options, ts.sys).resolvedModule;
    return { text, resolved: r ? resolve(r.resolvedFileName) : undefined };
  }

  const sites = [];
  for (const sf of program.getSourceFiles()) {
    if (!inProject.has(resolve(sf.fileName))) continue;
    const file = relTo(root, sf.fileName);
    const visit = (node) => {
      if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
        const callee = unwrap(node.expression);
        let nameNode = callee;
        let head = callee;
        let elem = false;
        if (ts.isPropertyAccessExpression(callee)) { nameNode = callee.name; head = callee; while (ts.isPropertyAccessExpression(head) || ts.isCallExpression(head) || ts.isElementAccessExpression(head)) head = ts.isCallExpression(head) ? head.expression : head.expression; }
        else if (ts.isElementAccessExpression(callee)) { nameNode = callee.argumentExpression; elem = true; }
        if (ts.isIdentifier(nameNode) || (elem && ts.isStringLiteral(nameNode)) || ts.isPrivateIdentifier(nameNode)) {
          const defs = ls.getDefinitionAtPosition(sf.fileName, nameNode.getStart(sf)) ?? [];
          const targets = [];
          let defKind;
          for (const def of defs) {
            const dsf = program.getSourceFile(def.fileName);
            if (!dsf) continue;
            let n = dsf;
            for (;;) {
              let next;
              ts.forEachChild(n, (c) => { if (!next && def.textSpan.start >= c.getStart(dsf) && def.textSpan.start < c.end) next = c; });
              if (!next) break;
              n = next;
            }
            const t = declTarget(n.parent && (ts.isIdentifier(n) || ts.isStringLiteral(n)) ? n.parent : n);
            if (t) { targets.push(t); defKind ??= t.kind; }
          }
          if (targets.length) {
            const line = sf.getLineAndCharacterOfPosition(nameNode.getStart(sf)).line + 1;
            // stratum: alias > barrel > dynamic > method > static
            let stratum = 'static';
            const headId = ts.isIdentifier(head) ? head : undefined;
            const imp = headId ? importOf(headId, sf.fileName) : undefined;
            const defFile = targets[0] && resolve(root, targets[0].tfile);
            if (imp && !imp.text.startsWith('.') && imp.resolved && inProject.has(imp.resolved)) stratum = 'alias';
            else if (imp && imp.resolved && inProject.has(imp.resolved) && imp.resolved !== defFile) stratum = 'barrel';
            else if (elem || defKind === 'iface-member' || node.questionDotToken || (ts.isPropertyAccessExpression(callee) && callee.questionDotToken)) stratum = 'dynamic';
            else if (ts.isPropertyAccessExpression(callee)) stratum = 'method';
            sites.push({ file, line, callee: nameNode.text, stratum, targets: targets.map(({ tfile, tleaf }) => ({ tfile, tleaf })) });
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return sites;
}
