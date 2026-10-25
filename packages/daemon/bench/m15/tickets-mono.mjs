// M1.5b tickets on a monorepo (excalidraw): unique-name callers (control), AMBIGUOUS-name callers (where grep-by-name
// over-reports and the compiler must disambiguate), importers, call paths. Keys from the TypeScript language service.
// These tickets are chosen where a compiler-backed tool SHOULD help: a targeted test, not a claim about typical questions.
//   FIXTURE=<excalidraw checkout> node packages/daemon/bench/m15/tickets-mono.mjs  ->  generated data/m15b-tickets.json
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { callSites, importersOf, openProjectFromConfig, TEST, topFunctions } from './truth.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const FIX = process.env.FIXTURE ?? join(homedir(), '.hermes/cache/scratch/m15b/excalidraw');
const OUT = process.env.OUT ?? resolve(here, '../../../../generated data/m15b-tickets.json');
const p = openProjectFromConfig(FIX, 'tsconfig.json');
const { ts, rel } = p;
const prodFile = (f) => p.inSrc(f) && !TEST.test(rel(f)) && !f.endsWith('.d.ts') && !/(^|\/)tests?\//.test(rel(f));

const fns = [];
for (const sf of p.program.getSourceFiles()) if (prodFile(sf.fileName)) for (const f of topFunctions(p, sf)) fns.push({ ...f, file: sf.fileName });
const nameCount = new Map();
for (const f of fns) nameCount.set(f.name, (nameCount.get(f.name) ?? 0) + 1);
const key = (f) => `${f.file}#${f.name}`;
const byKey = new Map(fns.map((f) => [key(f), f]));
const sites = new Map();
for (const f of fns) sites.set(key(f), callSites(p, f.file, f.nameNode).filter((s) => prodFile(s.file)));

let seed = 20261023;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const pick = (arr, n) => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a.slice(0, n); };
const grepFiles = (name) => {
  try { return execFileSync('grep', ['-rlw', name, '--include=*.ts', '--include=*.tsx', '--exclude-dir=node_modules', '--exclude-dir=examples', '--exclude-dir=scripts', FIX], { encoding: 'utf8' }).split('\n').filter(Boolean).map(rel).filter((x) => !TEST.test(x) && !/(^|\/)tests?\//.test(x)); } catch { return []; }
};
const WHERE = 'in this repository (all packages and excalidraw-app; ignore test files, examples/ and scripts/)';
const tickets = [];
const add = (t) => tickets.push({ id: `M${String(tickets.length + 1).padStart(2, '0')}`, ...t });

const callerOf = (f) => [...new Set(sites.get(key(f)).map((s) => rel(s.file)))].sort();
// ambiguity is measured, not assumed: extra = files a plain word-grep of the name finds beyond the true caller files and the defining file
const cands = fns.filter((f) => f.name.length >= 5).map((f) => ({ f, files: callerOf(f) })).filter((c) => c.files.length >= 2 && c.files.length <= 8).map((c) => {
  const g = grepFiles(c.f.name);
  const known = new Set([...c.files, rel(c.f.file)]);
  return { ...c, grepN: g.length, extra: g.filter((x) => !known.has(x)).length, sameName: nameCount.get(c.f.name) };
});
const uniq = cands.filter((c) => c.sameName === 1 && c.extra <= 0 && c.files.length >= 3);
const amb = cands.filter((c) => c.extra >= 3).sort((a, b) => b.extra - a.extra).slice(0, 40);
for (const { f, files } of pick(uniq, 3)) add({ type: 'callers-unique', difficulty: 'easy', prompt: `Which files ${WHERE} contain a direct call to the function \`${f.name}\` defined in \`${rel(f.file)}\`? Count only calls, not imports or mentions in comments.`, answerFormat: 'json array of repo-relative file paths', key: { kind: 'set', items: files }, meta: { grepFiles: grepFiles(f.name).length } });
for (const { f, files } of pick(amb, 4)) {
  const others = fns.filter((g) => g.name === f.name && key(g) !== key(f)).map((g) => rel(g.file));
  add({ type: 'callers-ambiguous', difficulty: 'hard', prompt: `Which files ${WHERE} contain a direct call to the function \`${f.name}\` that is defined in \`${rel(f.file)}\`? Note: the same word also appears elsewhere (other declarations, methods or properties); count only calls that resolve to the function in \`${rel(f.file)}\`.`, answerFormat: 'json array of repo-relative file paths', key: { kind: 'set', items: files }, meta: { sameNameElsewhere: others, grepFiles: grepFiles(f.name).length, grepExtraFiles: cands.find((c) => c.f === f).extra } });
}
const importCands = [];
for (const sf of p.program.getSourceFiles()) {
  if (!prodFile(sf.fileName)) continue;
  const imps = importersOf(p, sf.fileName).filter((x) => prodFile(x)).map(rel).sort();
  if (imps.length >= 4 && imps.length <= 10) importCands.push({ file: rel(sf.fileName), imps });
}
for (const c of pick(importCands, 2)) add({ type: 'importers', difficulty: 'medium', prompt: `Which files ${WHERE} import the module \`${c.file}\` (static import or re-export; the specifier may be a relative path or a package alias such as @excalidraw/...)?`, answerFormat: 'json array of repo-relative file paths', key: { kind: 'set', items: c.imps } });
// call path of exactly 3 edges between top-level functions (unique names)
const edges = new Map();
for (const f of fns) for (const s of sites.get(key(f))) { const c = s.caller; if (!c || !c.top) continue; const ck = `${c.file}#${c.name}`; if (!byKey.has(ck) || ck === key(f)) continue; (edges.get(ck) ?? edges.set(ck, new Set()).get(ck)).add(key(f)); }
const paths = [];
for (const [a] of edges) {
  const dist = new Map([[a, 0]]); const prev = new Map(); let fr = [a];
  for (let d = 1; d <= 3 && fr.length; d++) { const nx = []; for (const x of fr) for (const y of edges.get(x) ?? []) if (!dist.has(y)) { dist.set(y, d); prev.set(y, x); nx.push(y); } fr = nx; }
  for (const [b, d] of dist) if (d === 3) { const path = [b]; while (path[0] !== a) path.unshift(prev.get(path[0])); if (path.every((k) => nameCount.get(byKey.get(k).name) === 1)) paths.push(path); }
}
for (const path of pick(paths, 2)) {
  const names = path.map((k) => byKey.get(k).name);
  add({ type: 'call-path', difficulty: 'hard', prompt: `Give a chain of direct calls from the function \`${names[0]}\` (in \`${rel(byKey.get(path[0]).file)}\`) to the function \`${names[3]}\` (in \`${rel(byKey.get(path[3]).file)}\`) through exactly 2 intermediate functions: A calls B, B calls C, C calls D. All four are top-level functions ${WHERE}.`, answerFormat: 'json array of the four function names in call order', key: { kind: 'path', start: names[0], end: names[3], length: 4 }, meta: { example: names } });
}
const graph = {};
for (const [a, bs] of edges) { const an = byKey.get(a).name; if (nameCount.get(an) !== 1) continue; graph[an] = [...bs].filter((b) => nameCount.get(byKey.get(b).name) === 1).map((b) => byKey.get(b).name).sort(); }
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), fixture: FIX, fixtureCommit: execFileSync('git', ['-C', FIX, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), repo: 'excalidraw (MIT), no node_modules installed', groundTruth: 'TypeScript language service; same TypeScript family as Mole index so errors can correlate; keys checked against grep per ticket in meta', counts: { fns: fns.length, uniq: uniq.length, amb: amb.length, ambExtraMedian: amb.map((c) => c.extra).sort((a, b) => a - b)[Math.floor(amb.length / 2)], importCands: importCands.length, paths: paths.length }, tickets, callGraph: graph }, null, 2) + '\n');
console.log(JSON.stringify({ n: tickets.length, counts: { fns: fns.length, uniq: uniq.length, amb: amb.length, ambExtraMedian: amb.map((c) => c.extra).sort((a, b) => a - b)[Math.floor(amb.length / 2)], imp: importCands.length, paths: paths.length } }));
for (const t of tickets) console.log(t.id, t.type, t.key.items?.length ?? t.key.length, JSON.stringify(t.meta?.grepFiles ?? ''), t.prompt.slice(50, 120).replace(/\n/g, ' '));
