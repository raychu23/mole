// Engine A: TypeScript Compiler API (our packages/indexer). Edges come from the SQLite graph it writes.
import { TsIndexer } from '../dist/index.js';
import { leaf } from './common.mjs';

export function idParts(id) {
  const m = /^[a-z]+:(.*?)#(.*)$/.exec(id);
  return m ? { path: m[1], qn: m[2] } : undefined;
}

export function callEdgesFromDb(db) {
  const out = [];
  for (const r of db.prepare("SELECT to_id, path, line FROM edges WHERE kind = 'calls'").all()) {
    const p = idParts(String(r.to_id));
    if (!p) continue;
    const segs = p.qn.split('.');
    out.push({ file: String(r.path), line: Number(r.line), tfile: p.path, tleaf: leaf(segs[segs.length - 1], segs[segs.length - 2]) });
  }
  return out;
}

export function runTs(root, tsconfig, srcDir, dbPath = ':memory:') {
  const ix = new TsIndexer({ root, tsconfig, srcDir, dbPath });
  const t0 = performance.now();
  const stats = ix.indexAll();
  const ms = performance.now() - t0;
  return { ix, stats, ms, edges: callEdgesFromDb(ix.db) };
}
