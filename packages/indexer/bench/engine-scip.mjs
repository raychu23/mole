// Engine C: scip-typescript (Sourcegraph, Apache-2.0). SCIP resolves symbols with the TS type checker but has no
// notion of a "call", so call edges = SCIP reference occurrences that sit at a call-expression callee (found with
// tree-sitter). Reports full-index time via the CLI.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { loadParsers } from './engine-treesitter.mjs';
import { listSources, relTo } from './common.mjs';

const require = createRequire(import.meta.url);
const { scip } = require('@sourcegraph/scip-typescript/dist/src/scip.js');

export function scipBin() {
  return join(dirname(require.resolve('@sourcegraph/scip-typescript/package.json')), '..', '..', '.bin', 'scip-typescript');
}

export function runScipCli(cwd, out) {
  const t0 = performance.now();
  execFileSync(scipBin(), ['index', '--cwd', cwd, '--output', out, '--no-progress-bar'], { stdio: 'ignore', maxBuffer: 1 << 28 });
  return performance.now() - t0;
}

function leafOfSymbol(sym) {
  const desc = sym.split(' ').slice(4).join(' ');
  const i = desc.lastIndexOf('`/');
  const rest = i >= 0 ? desc.slice(i + 2) : desc;
  const chunks = rest.replace(/\(\)\.$|\.$|#$/, '').split(/[#.]/).filter(Boolean);
  let name = chunks[chunks.length - 1] ?? '';
  if (name === '<constructor>') name = chunks[chunks.length - 2] ?? name;
  return name.replace(/^`|`$/g, '').replace(/^(?:get|set):/, '');
}

export async function scipCallEdges(root, scipFile, files) {
  const idx = scip.Index.deserializeBinary(readFileSync(scipFile));
  const docs = idx.documents;
  const defs = new Map();
  for (const d of docs) for (const o of d.occurrences) if (o.symbol_roles & 1) defs.set(o.symbol, { path: d.relative_path, leaf: leafOfSymbol(o.symbol) });
  const occByDoc = new Map();
  for (const d of docs) {
    const m = new Map();
    for (const o of d.occurrences) { const r = o.range; if (!(o.symbol_roles & 1) && !o.symbol.startsWith('local ')) m.set(`${r[0]}:${r[1]}`, o.symbol); }
    occByDoc.set(d.relative_path, m);
  }
  const { extract } = await import('./engine-treesitter.mjs');
  const { Parser } = await import('web-tree-sitter');
  const { ts, tsx } = await loadParsers();
  const parser = new Parser();
  const edges = [];
  for (const f of files) {
    const rel = relTo(root, f);
    const occ = occByDoc.get(rel);
    if (!occ) continue;
    parser.setLanguage(f.endsWith('x') ? tsx : ts);
    const tree = parser.parse(readFileSync(f, 'utf8'));
    for (const c of extract(tree, rel).calls) {
      const sym = occ.get(`${c.row}:${c.col}`);
      const d = sym && defs.get(sym);
      if (d) edges.push({ file: rel, line: c.row + 1, tfile: d.path, tleaf: d.leaf });
    }
    tree.delete();
  }
  return edges;
}
