#!/usr/bin/env node
// Deterministic checks of the prototype core against the real indexed repo.
// Each claim the UI makes (edges, drift lines, budgets) is checked against the source text.
// usage: node test/check.mjs
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const M = require('../core/mole-core.js');
const SAMPLE = require('../sample/sample.js');
const js = fs.readFileSync(path.join(here, '..', 'data', 'ui-tui.js'), 'utf8');
const data = JSON.parse(js.slice(js.indexOf('{'), js.lastIndexOf('}') + 1));
const cfg = { excludeTests: true, maxNodes: 25, driftIgnoreTests: true, driftIgnoreTypeOnly: true, sessionStartCap: 1500 };
const results = [];
const check = (name, ok, detail = '') => results.push({ name, ok: !!ok, detail });

// 1 schema
check('schema tag', data.schema === 'mole.prototype.graph/1');
check('every import endpoint is an indexed file', data.imports.every((i) => data.files[i.from] && data.files[i.to]));
check('every call endpoint is an indexed symbol', data.calls.every((c) => data.symbols[c.from] && data.symbols[c.to]));
check('every symbol line within its file', Object.values(data.symbols).every((s) => s.line >= 1 && s.line <= data.files[s.file].lines));

// 2 import lines point at real import text (sample of 200, deterministic)
const imps = data.imports.filter((i) => data.files[i.from].text).filter((_, k) => k % 5 === 0).slice(0, 200);
const badImp = imps.filter((i) => { const ln = data.files[i.from].text.split('\n')[i.line - 1] || ''; return !/\b(import|export)\b/.test(ln); });
check('import file:line lands on an import/export statement', badImp.length === 0, `${imps.length} sampled, ${badImp.length} off: ${badImp.slice(0, 2).map((i) => i.from + ':' + i.line).join(', ')}`);

// 3 call lines contain the callee name
const calls = data.calls.filter((c) => data.files[c.file].text && c.kind !== 'jsx').filter((_, k) => k % 7 === 0).slice(0, 200);
const badCall = calls.filter((c) => { const ln = data.files[c.file].text.split('\n')[c.line - 1] || ''; const nm = data.symbols[c.to].name.split('.').pop(); return !ln.includes(nm); });
check('call file:line contains the callee name', badCall.length <= calls.length * 0.02, `${calls.length} sampled, ${badCall.length} off`);

// 4 drift: sample roadmap flags exactly the 4 known real edges, each at a real import line
const G = M.load(data); const D = M.drift(G, SAMPLE.roadmap, cfg);
check('drift count under sample roadmap = 4', D.violations.length === 4, D.violations.map((v) => `${v.rule} ${v.from}:${v.line}`).join('; '));
check('each drift line imports the target', D.violations.every((v) => { const ln = data.files[v.from].text.split('\n')[v.line - 1]; const t = path.basename(v.to).replace(/\.tsx?$/, ''); return ln.includes(t); }));
check('planned sdk→domain not flagged', D.planned.some((p) => p.from === 'sdk' && p.to === 'domain'));
const D2 = M.drift(G, SAMPLE.roadmap, { ...cfg, driftIgnoreTypeOnly: false });
check('type-only rule matters (more or equal drift when off)', D2.violations.length >= D.violations.length, `${D.violations.length} → ${D2.violations.length}`);

// 5 agent edit overlay adds R1 drift
const G2 = M.load(data, { imports: [{ from: 'src/lib/text.ts', to: 'src/app/uiStore.ts', line: 3, typeOnly: false, sim: true }] });
const D3 = M.drift(G2, SAMPLE.roadmap, cfg);
check('simulated agent edit creates one new R1 item', D3.violations.length === 5 && D3.violations.some((v) => v.from === 'src/lib/text.ts' && v.rule === 'R1'));

// 6 neighbourhood respects cap + tests policy + stable group order
const files = Object.keys(data.files).filter((f) => !data.files[f].test);
const over = files.filter((f) => { const N = M.neighbourhood(G, f, cfg, SAMPLE.roadmap); return N.incoming.length + N.outgoing.length > cfg.maxNodes; });
check('neighbourhood never exceeds maxNodes', over.length === 0, over.slice(0, 3).join(', '));
const leak = files.filter((f) => { const N = M.neighbourhood(G, f, cfg, SAMPLE.roadmap); return [...N.incoming, ...N.outgoing].some((x) => data.files[x.file].test); });
check('tests excluded from neighbourhoods', leak.length === 0);
const pinOk = D.violations.every((v) => { const N = M.neighbourhood(G, v.from, { ...cfg, maxNodes: 8 }, SAMPLE.roadmap, D); return N.outgoing.some((x) => x.file === v.to); });
check('drift partners always shown, even at a small cap', pinOk);
const o1 = M.groupOrder(G, SAMPLE.roadmap).join(); const o2 = M.groupOrder(G, SAMPLE.roadmap).join();
check('group order fixed per index (stable layout)', o1 === o2 && o1 === SAMPLE.roadmap.boxes.map((b) => b.id).join());

// 7 agent-facing budgets
const sizes = files.map((f) => Buffer.byteLength(M.moleMap(G, f, cfg, SAMPLE.roadmap, D)));
check('mole_map ≤ 2 KB for every file', Math.max(...sizes) <= 2048, `max ${Math.max(...sizes)} B, median ${sizes.sort((a, b) => a - b)[sizes.length >> 1]} B`);
const ss = M.sessionStart(G, SAMPLE.roadmap, cfg, D3, null);
check('SessionStart ≤ cap', ss.length <= cfg.sessionStartCap, `${ss.length} chars`);

// 8 query speed (prototype, in-process, no daemon)
const t0 = performance.now(); files.forEach((f) => M.neighbourhood(G, f, cfg, SAMPLE.roadmap)); const per = (performance.now() - t0) / files.length;
check('neighbourhood query < 5 ms per file', per < 5, `${per.toFixed(3)} ms avg over ${files.length} files`);

// 9 curated importer
const anchors = M.suggestAnchors(G, M.parseMermaid(SAMPLE.curated.mermaid));
const by = Object.fromEntries(anchors.map((n) => [n.label, n]));
check('Mermaid labels anchor to real files', by['gatewayClient'].anchor === 'src/gatewayClient.ts' && by['entry.tsx'].anchor === 'src/entry.tsx');
check('ambiguous + unanchored stay honest', by['Slash commands'].status === 'ambiguous' && by['Plugin widgets'].status === 'unanchored');

// 10 propagation is deterministic
const h1 = M.managedBlock(SAMPLE.roadmap, D, 'x'); const h2 = M.managedBlock(SAMPLE.roadmap, D, 'x');
check('managed block regenerates byte-identical', h1 === h2);

const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? '  · ' + r.detail : ''}`);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
