// Builds the M1.5 ticket set + answer keys from the language service. Keys are written BEFORE any agent run.
//   node packages/daemon/bench/m15/tickets.mjs   ->  generated data/m15-tickets.json
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { callSites, importersOf, openProject, TEST, topFunctions } from './truth.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const FIX = process.env.FIXTURE ?? join(homedir(), '.hermes/hermes-agent/ui-tui');
const OUT = process.env.OUT ?? resolve(here, '../../../../generated data/m15-tickets.json');
const p = openProject(FIX, 'tsconfig.build.json');
const { ts } = p;
const rel = p.rel;
const prodFile = (f) => p.inSrc(f) && !TEST.test(rel(f)) && !f.endsWith('.d.ts');

// 1. every top-level function in production src + its direct call sites
const fns = [];
for (const sf of p.program.getSourceFiles()) {
  if (!prodFile(sf.fileName)) continue;
  for (const f of topFunctions(p, sf)) fns.push({ ...f, file: sf.fileName });
}
const byKey = new Map(fns.map((f) => [`${f.file}#${f.name}`, f]));
const sitesOf = new Map();
for (const f of fns) {
  sitesOf.set(`${f.file}#${f.name}`, callSites(p, f.file, f.nameNode).filter((s) => prodFile(s.file)));
}
const nameCount = new Map();
for (const f of fns) nameCount.set(f.name, (nameCount.get(f.name) ?? 0) + 1);
const unique = (f) => nameCount.get(f.name) === 1;
const exported = (f) => f.node && (ts.getCombinedModifierFlags?.(f.node.kind === ts.SyntaxKind.FunctionDeclaration ? f.node : f.node.parent?.parent?.parent ?? f.node) & ts.ModifierFlags.Export) !== 0 || true;

// deterministic pseudo-random order
let seed = 20261020;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const pick = (arr, n) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
};

const grepFiles = (name) => {
  try {
    return execFileSync('grep', ['-rlwE', `${name}`, '--include=*.ts', '--include=*.tsx', join(FIX, 'src')], { encoding: 'utf8' }).split('\n').filter(Boolean).map(rel).filter((f) => !TEST.test(f));
  } catch {
    return [];
  }
};

const tickets = [];
const add = (t) => tickets.push({ id: `T${String(tickets.length + 1).padStart(2, '0')}`, ...t });

// callers (file level): 3..9 distinct caller files, unique name, key agrees with grep file set being a superset
const callerCands = fns.filter((f) => unique(f)).map((f) => ({ f, files: [...new Set(sitesOf.get(`${f.file}#${f.name}`).map((s) => rel(s.file)))] })).filter((c) => c.files.length >= 3 && c.files.length <= 9 && c.f.name.length >= 5);
for (const { f, files } of pick(callerCands, 5)) {
  add({ type: 'callers', difficulty: files.length >= 6 ? 'hard' : 'medium',
    prompt: `In the code under src/ (ignore src/__tests__ and any *.test.* files), which files contain a direct call to the function \`${f.name}\` defined in \`${rel(f.file)}\`? Count only calls, not imports or mentions in comments.`,
    answerFormat: 'json array of repo-relative file paths, e.g. ["src/a.ts","src/b.tsx"]',
    key: { kind: 'set', items: files.sort() },
    check: { grepFilesWithName: grepFiles(f.name).length } });
}

// transitive impact (two levels of callers), file level
const impactCands = [];
for (const { f, files } of callerCands) {
  const direct = sitesOf.get(`${f.file}#${f.name}`);
  const level2 = new Set(files);
  let ok = true;
  for (const s of direct) {
    const c = s.caller;
    if (!c) continue;
    if (!c.nameNode) continue;
    for (const s2 of callSites(p, c.file, c.nameNode)) if (prodFile(s2.file)) level2.add(rel(s2.file));
  }
  if (ok && level2.size >= 6 && level2.size <= 20 && level2.size > files.length) impactCands.push({ f, files: [...level2].sort(), direct: files });
}
for (const { f, files, direct } of pick(impactCands, 2)) {
  add({ type: 'impact', difficulty: 'hard',
    prompt: `If the behaviour of the function \`${f.name}\` (defined in \`${rel(f.file)}\`) changed, which production files under src/ (ignore src/__tests__ and *.test.* files) could be affected? Count files that call it directly AND files that call a function that calls it directly (two levels of callers).`,
    answerFormat: 'json array of repo-relative file paths',
    key: { kind: 'set', items: files }, meta: { directFiles: direct } });
}

// definition + callees: top-level functions/classes in src that the function body calls directly (method calls excluded)
const classNames = new Set();
for (const sf of p.program.getSourceFiles()) if (prodFile(sf.fileName)) for (const st of sf.statements) if (ts.isClassDeclaration(st) && st.name) classNames.add(`${sf.fileName}#${st.name.text}`);
function calleesOf(f) {
  const out = new Set();
  const sf = f.node.getSourceFile();
  const visit = (n) => {
    if ((ts.isCallExpression(n) || ts.isNewExpression(n)) && ts.isIdentifier(n.expression)) {
      for (const d of p.ls.getDefinitionAtPosition(sf.fileName, n.expression.getStart(sf)) ?? []) {
        if (!prodFile(d.fileName)) continue;
        const key = `${d.fileName}#${d.name}`;
        if (byKey.has(key) || classNames.has(key)) out.add(d.name);
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(f.node.body ?? f.node);
  out.delete(f.name);
  return [...out].sort();
}
const defCands = fns.filter((f) => unique(f) && f.name.length >= 6).map((f) => ({ f, callees: calleesOf(f) })).filter((c) => c.callees.length >= 3 && c.callees.length <= 8);
for (const { f, callees } of pick(defCands, 3)) {
  add({ type: 'definition-callees', difficulty: 'medium',
    prompt: `Find where the function \`${f.name}\` is defined under src/ and list the top-level functions or classes defined elsewhere in this repo's own src/ (not library code, not methods) that its body calls directly.`,
    answerFormat: 'json object {"file":"repo-relative path","callees":["name",...]}',
    key: { kind: 'file+set', file: rel(f.file), items: callees } });
}

// importers of a module
const importCands = [];
for (const sf of p.program.getSourceFiles()) {
  if (!prodFile(sf.fileName)) continue;
  const imps = importersOf(p, sf.fileName).filter((x) => prodFile(x)).map(rel).sort();
  if (imps.length >= 4 && imps.length <= 12) importCands.push({ file: rel(sf.fileName), imps });
}
for (const c of pick(importCands, 2)) {
  add({ type: 'importers', difficulty: 'easy',
    prompt: `Which production files under src/ (ignore src/__tests__ and *.test.* files) import the module \`${c.file}\`? Count static import and re-export statements; the specifier may be relative.`,
    answerFormat: 'json array of repo-relative file paths',
    key: { kind: 'set', items: c.imps } });
}

// call path: shortest path of exactly 3 edges between unique top-level functions
const edges = new Map(); // callerKey -> Set(calleeKey)
for (const f of fns) {
  const k = `${f.file}#${f.name}`;
  for (const s of sitesOf.get(k)) {
    const c = s.caller;
    if (!c || !c.top) continue;
    const ck = `${c.file}#${c.name}`;
    if (!byKey.has(ck) || ck === k) continue;
    (edges.get(ck) ?? edges.set(ck, new Set()).get(ck)).add(k);
  }
}
const paths = [];
for (const [a] of edges) {
  const dist = new Map([[a, 0]]);
  const prev = new Map();
  let frontier = [a];
  for (let d = 1; d <= 3 && frontier.length; d++) {
    const nxt = [];
    for (const x of frontier) for (const y of edges.get(x) ?? []) if (!dist.has(y)) { dist.set(y, d); prev.set(y, x); nxt.push(y); }
    frontier = nxt;
  }
  for (const [b, d] of dist) if (d === 3 && unique(byKey.get(a)) && unique(byKey.get(b))) {
    const path = [b];
    while (path[0] !== a) path.unshift(prev.get(path[0]));
    if (path.every((k) => unique(byKey.get(k)))) paths.push(path);
  }
}
for (const path of pick(paths, 1)) {
  const names = path.map((k) => byKey.get(k).name);
  add({ type: 'call-path', difficulty: 'hard',
    prompt: `Give a chain of direct calls from the function \`${names[0]}\` (in \`${rel(byKey.get(path[0]).file)}\`) to the function \`${names[3]}\` (in \`${rel(byKey.get(path[3]).file)}\`) through exactly 2 intermediate production functions: A calls B, B calls C, C calls D. All four are top-level functions under src/.`,
    answerFormat: 'json array of the four function names in call order',
    key: { kind: 'path', start: names[0], end: names[3], length: 4 }, meta: { example: names } });
}
// the graph the path grader checks each edge against (name level; all names unique)
const graph = {};
for (const [a, bs] of edges) {
  const an = byKey.get(a).name;
  if (!unique(byKey.get(a))) continue;
  graph[an] = [...bs].filter((b) => unique(byKey.get(b))).map((b) => byKey.get(b).name).sort();
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), fixture: FIX, fixtureCommit: execFileSync('git', ['-C', FIX, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), groundTruth: 'TypeScript language service (findReferences, getDefinitionAtPosition, resolveModuleName); NOT Mole\'s index; both are TypeScript so errors can correlate', counts: { productionFunctions: fns.length, callerCands: callerCands.length, impactCands: impactCands.length, defCands: defCands.length, importCands: importCands.length, pathCands: paths.length }, tickets, callGraph: graph }, null, 2) + '\n');
console.log(JSON.stringify({ n: tickets.length, byType: Object.fromEntries([...new Set(tickets.map((t) => t.type))].map((k) => [k, tickets.filter((t) => t.type === k).length])), counts: { fns: fns.length, callerCands: callerCands.length, impactCands: impactCands.length, defCands: defCands.length, importCands: importCands.length, pathCands: paths.length } }));
for (const t of tickets) console.log(t.id, t.type, t.key.items?.length ?? t.key.length ?? '', t.check ? JSON.stringify(t.check) : '');
