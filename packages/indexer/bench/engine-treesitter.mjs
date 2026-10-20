// Engine B: tree-sitter (syntax only). Parses every file, builds a def table + import/re-export graph and
// resolves each call by name: local def -> import binding (following re-exports and tsconfig paths) -> unique method name.
import { readFileSync, existsSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { Language, Parser } from 'web-tree-sitter';
import { leaf, listSources, relTo } from './common.mjs';

const require = createRequire(import.meta.url);
let ready;
export async function loadParsers() {
  ready ??= (async () => {
    await Parser.init();
    const dir = dirname(require.resolve('tree-sitter-typescript/package.json'));
    return { ts: await Language.load(join(dir, 'tree-sitter-typescript.wasm')), tsx: await Language.load(join(dir, 'tree-sitter-tsx.wasm')) };
  })();
  return ready;
}

const text = (n) => n?.text;
const strLit = (n) => n.text.slice(1, -1);

/** Parse one file -> { defs, methods, imports, reexports, stars, calls } (no cross-file resolution yet). */
export function extract(tree, relPath) {
  const defs = new Map(); // top-level name -> kind
  const methods = []; // { owner, name }
  const imports = new Map(); // local name -> { spec, imported } ; imported '*' = namespace
  const reexports = new Map(); // exported name -> { spec, orig }
  const stars = []; // export * from spec
  const calls = []; // { row, col, kind:'id'|'member'|'new', name, objText, owner }

  const addDef = (n, kind) => { if (n) defs.set(n, kind); };
  const walkClassBody = (owner, body) => {
    for (const m of body.namedChildren) {
      const nm = text(m.childForFieldName('name'));
      if (!nm) continue;
      if (m.type === 'method_definition' || m.type === 'method_signature' || m.type === 'abstract_method_signature') methods.push({ owner, name: nm });
      else if (m.type === 'public_field_definition' || m.type === 'property_signature') {
        const v = m.childForFieldName('value');
        const ty = m.childForFieldName('type');
        if ((v && (v.type === 'arrow_function' || v.type === 'function_expression')) || (ty && ty.descendantsOfType('function_type').length && ty.namedChildren[0]?.namedChildren[0]?.type === 'function_type')) methods.push({ owner, name: nm });
      }
    }
  };
  const topDecl = (n) => {
    switch (n.type) {
      case 'function_declaration': case 'function_signature': addDef(text(n.childForFieldName('name')), 'fn'); break;
      case 'class_declaration': case 'abstract_class_declaration': { const nm = text(n.childForFieldName('name')); addDef(nm, 'class'); const b = n.childForFieldName('body'); if (b) walkClassBody(nm, b); break; }
      case 'interface_declaration': { const nm = text(n.childForFieldName('name')); addDef(nm, 'type'); const b = n.childForFieldName('body'); if (b) walkClassBody(nm, b); break; }
      case 'type_alias_declaration': case 'enum_declaration': addDef(text(n.childForFieldName('name')), 'type'); break;
      case 'lexical_declaration': case 'variable_declaration':
        for (const d of n.namedChildren) if (d.type === 'variable_declarator') { const id = d.childForFieldName('name'); if (id?.type === 'identifier') addDef(id.text, 'var'); }
        break;
      default: break;
    }
  };
  const root = tree.rootNode;
  // `declare module '@x/y' { export function f(): void }` (ambient module): its members count as this file's top-level
  // declarations so a path-aliased import of '@x/y' that lands on this .d.ts resolves.
  const top = [];
  const unwrapAmbient = (n) => {
    if (n.type === 'ambient_declaration') { for (const c of n.namedChildren) unwrapAmbient(c); }
    else if (n.type === 'module' || n.type === 'internal_module') { const b = n.childForFieldName('body'); if (b) for (const c of b.namedChildren) unwrapAmbient(c); }
    else top.push(n);
  };
  for (const n of root.namedChildren) unwrapAmbient(n);
  for (const n of top) {
    if (n.type === 'import_statement') {
      const src = n.childForFieldName('source');
      if (!src) continue;
      const spec = strLit(src);
      for (const c of n.namedChildren) {
        if (c.type !== 'import_clause') continue;
        for (const k of c.namedChildren) {
          if (k.type === 'identifier') imports.set(k.text, { spec, imported: 'default' });
          else if (k.type === 'namespace_import') imports.set(k.namedChildren[0].text, { spec, imported: '*' });
          else if (k.type === 'named_imports') for (const s of k.namedChildren) { const nme = s.childForFieldName('name'); const al = s.childForFieldName('alias'); if (nme) imports.set((al ?? nme).text, { spec, imported: nme.text }); }
        }
      }
    } else if (n.type === 'export_statement') {
      const src = n.childForFieldName('source');
      const decl = n.childForFieldName('declaration');
      if (decl) topDecl(decl);
      if (src) {
        const spec = strLit(src);
        let any = false;
        for (const c of n.namedChildren) {
          if (c.type === 'export_clause') { any = true; for (const s of c.namedChildren) { const nme = s.childForFieldName('name'); const al = s.childForFieldName('alias'); if (nme) reexports.set((al ?? nme).text, { spec, orig: nme.text }); } }
          else if (c.type === 'namespace_export') { any = true; reexports.set(c.namedChildren[0]?.text ?? '*', { spec, orig: '*' }); }
        }
        if (!any) stars.push(spec);
      } else {
        for (const c of n.namedChildren) if (c.type === 'export_clause') for (const s of c.namedChildren) { const nme = s.childForFieldName('name'); const al = s.childForFieldName('alias'); if (nme && al) reexports.set(al.text, { spec: null, orig: nme.text }); }
      }
    } else topDecl(n);
  }
  // calls (anywhere): track enclosing class for this.x()
  const walk = (n, owner) => {
    let cur = owner;
    if (n.type === 'class_declaration' || n.type === 'abstract_class_declaration') cur = text(n.childForFieldName('name')) ?? owner;
    if (n.type === 'call_expression' || n.type === 'new_expression') {
      const f = n.childForFieldName(n.type === 'new_expression' ? 'constructor' : 'function');
      if (f?.type === 'identifier') calls.push({ row: f.startPosition.row, col: f.startPosition.column, kind: n.type === 'new_expression' ? 'new' : 'id', name: f.text, owner: cur });
      else if (f?.type === 'member_expression') {
        const prop = f.childForFieldName('property');
        const obj = f.childForFieldName('object');
        if (prop) calls.push({ row: prop.startPosition.row, col: prop.startPosition.column, kind: n.type === 'new_expression' ? 'new' : 'member', name: prop.text, objText: obj?.type === 'identifier' || obj?.type === 'this' ? obj.text : null, owner: cur });
      }
    }
    for (const c of n.namedChildren) walk(c, cur);
  };
  walk(root, undefined);
  return { path: relPath, defs, methods, imports, reexports, stars, calls };
}

/** Resolve a module specifier from a file: relative path or tsconfig `paths` alias -> repo-relative file in `known`. */
export function makeResolver(root, known, paths) {
  const tryFile = (base) => {
    const noJs = base.replace(/\.(?:js|jsx|mjs|cjs)$/, '');
    for (const c of [base, `${noJs}.ts`, `${noJs}.tsx`, `${base}.ts`, `${base}.tsx`, `${base}.d.ts`, `${noJs}/index.ts`, `${base}/index.ts`, `${base}/index.tsx`]) if (known.has(c)) return c;
    return undefined;
  };
  return (spec, fromPath) => {
    if (spec.startsWith('.')) return tryFile(join(dirname(fromPath), spec).split('\\').join('/'));
    for (const [pat, targets] of Object.entries(paths)) {
      const star = pat.indexOf('*');
      const hit = star < 0 ? spec === pat : spec.startsWith(pat.slice(0, star)) && spec.endsWith(pat.slice(star + 1));
      if (!hit) continue;
      const mid = star < 0 ? '' : spec.slice(star, spec.length - (pat.length - star - 1));
      for (const t of targets) { const r = tryFile(t.replace('*', mid)); if (r) return r; }
    }
    return undefined;
  };
}

export function resolveCalls(files, resolveSpec) {
  const byPath = new Map(files.map((f) => [f.path, f]));
  const methodsByName = new Map();
  for (const f of files) for (const m of f.methods) { const a = methodsByName.get(m.name) ?? []; a.push({ file: f.path, owner: m.owner }); methodsByName.set(m.name, a); }
  const resolveExport = (path, name, depth = 0) => {
    const f = byPath.get(path);
    if (!f || depth > 8) return undefined;
    if (f.defs.has(name)) return { file: path, name };
    const re = f.reexports.get(name);
    if (re) { const target = re.spec ? resolveSpec(re.spec, path) : path; return target ? resolveExport(target, re.orig, depth + 1) : undefined; }
    for (const s of f.stars) { const t = resolveSpec(s, path); const r = t && resolveExport(t, name, depth + 1); if (r) return r; }
    return undefined;
  };
  const edges = [];
  for (const f of files) {
    for (const c of f.calls) {
      let target;
      if (c.kind === 'id' || (c.kind === 'new' && !c.objText)) {
        if (f.defs.has(c.name)) target = { file: f.path, name: c.name };
        else { const im = f.imports.get(c.name); if (im && im.imported !== '*') { const t = resolveSpec(im.spec, f.path); if (t) target = resolveExport(t, im.imported === 'default' ? 'default' : im.imported); } }
      } else {
        const im = c.objText ? f.imports.get(c.objText) : undefined;
        if (im?.imported === '*') { const t = resolveSpec(im.spec, f.path); if (t) target = resolveExport(t, c.name); }
        else {
          const cands = methodsByName.get(c.name) ?? [];
          const own = c.objText === 'this' ? cands.filter((m) => m.file === f.path && m.owner === c.owner) : [];
          const pick = own.length === 1 ? own : cands.length === 1 ? cands : [];
          if (pick.length === 1) target = { file: pick[0].file, name: c.name };
        }
      }
      if (target) edges.push({ file: f.path, line: c.row + 1, tfile: target.file, tleaf: leaf(target.name) });
    }
  }
  return edges;
}

export async function indexTreeSitter(root, files, paths) {
  const { ts, tsx } = await loadParsers();
  const parser = new Parser();
  const known = new Set(files.map((f) => relTo(root, f)));
  const parsed = [];
  for (const f of files) {
    parser.setLanguage(f.endsWith('x') ? tsx : ts);
    const tree = parser.parse(readFileSync(f, 'utf8'));
    parsed.push(extract(tree, relTo(root, f)));
    tree.delete();
  }
  const resolveSpec = makeResolver(root, known, paths);
  return { parsed, resolveSpec, edges: resolveCalls(parsed, resolveSpec), parser, known };
}

export async function runTreeSitter(root, tsconfigPath, srcDir) {
  const cfg = JSON.parse(readFileSync(tsconfigPath, 'utf8'));
  const paths = cfg.compilerOptions?.paths ?? {};
  const files = listSources(srcDir);
  const t0 = performance.now();
  const r = await indexTreeSitter(root, files, paths);
  return { ...r, ms: performance.now() - t0, files };
}
