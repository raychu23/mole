#!/usr/bin/env node
// Mole prototype CLI: the agent-facing read tools (plan S1.9), same core as the sidebar.
// usage:
//   node cli/mole.mjs map <path|symbolId>      compact map text (what mole_map would return)
//   node cli/mole.mjs impact <symbolId>        callers up to 3 hops, file:line
//   node cli/mole.mjs drift                    forbidden edges under the sample roadmap
//   node cli/mole.mjs path <fromFile> <toFile> shortest import/call chain
//   node cli/mole.mjs session-start            SessionStart additionalContext text
//   node cli/mole.mjs bootstrap                draft roadmap from directory boundaries (YAML)
//   node cli/mole.mjs mermaid                  roadmap + drift as a managed Mermaid block
// options: --data data/ui-tui.json  --tests (include test files)
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const M = require('../core/mole-core.js');
const SAMPLE = require('../sample/sample.js');

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); if (i < 0) return d; const v = argv[i + 1]; argv.splice(i, 2); return v; };
const flag = (n) => { const i = argv.indexOf(`--${n}`); if (i < 0) return false; argv.splice(i, 1); return true; };
const dataPath = opt('data', path.join(here, '..', 'data', 'ui-tui.json'));
const cfg = { excludeTests: !flag('tests'), maxNodes: 25, driftIgnoreTests: true, driftIgnoreTypeOnly: true, sessionStartCap: 1500 };
const [cmd, a, b] = argv;

if (!fs.existsSync(dataPath)) { console.error(`no index at ${dataPath}: run node indexer/index.mjs --root <repo> first`); process.exit(1); }
const G = M.load(JSON.parse(fs.readFileSync(dataPath, 'utf8')));
const R = SAMPLE.roadmap;
const D = M.drift(G, R, cfg);

const resolve = (t) => {
  if (!t) return null;
  if (G.symbols[t] || G.files[t]) return t;
  const f = Object.keys(G.files).filter((k) => k.endsWith('/' + t) || k === t);
  if (f.length === 1) return f[0];
  const s = Object.values(G.symbols).filter((x) => x.name === t);
  if (s.length === 1) return s[0].id;
  if (f.length + s.length > 1) { console.error(`ambiguous: ${[...f, ...s.map((x) => x.id)].slice(0, 8).join(', ')}`); process.exit(2); }
  console.error(`not found: ${t}`); process.exit(2);
};

switch (cmd) {
  case 'map': { const t = resolve(a); const txt = M.moleMap(G, t, cfg, R, D); console.log(txt); console.error(`(${Buffer.byteLength(txt)} bytes)`); break; }
  case 'impact': {
    const t = resolve(a); if (!G.symbols[t]) { console.error('impact needs a symbol (e.g. patchUiState)'); process.exit(2); }
    const rows = M.impact(G, t, cfg, 3);
    console.log(`impact ${G.symbols[t].name}: ${rows.length} callers in ${new Set(rows.map((r) => r.file)).size} files`);
    rows.forEach((r) => console.log(`  hop ${r.depth}  ${r.name}  ${r.file}:${r.line}`));
    break;
  }
  case 'drift': D.violations.forEach((v) => console.log(`${v.rule}  ${v.from}:${v.line} -> ${v.to}  (${v.why})`)); console.error(`${D.violations.length} violations · ${D.planned.length} planned edges not built`); break;
  case 'path': { const p = M.pathBetween(G, resolve(a), resolve(b), cfg); if (!p) { console.log('no path'); break; } p.forEach((s, i) => console.log(`${i ? '  -> ' : ''}${s.file}${s.edge && s.edge.importLine ? ` (import :${s.edge.importLine})` : ''}`)); break; }
  case 'session-start': console.log(M.sessionStart(G, R, cfg, D, null)); break;
  case 'bootstrap': console.log(M.roadmapYaml(M.bootstrap(G, cfg))); break;
  case 'mermaid': console.log(M.managedBlock(R, D, M.hash(M.roadmapYaml(R)))); break;
  default:
    console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 12).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
    process.exit(cmd ? 2 : 0);
}
