// Engine D: CodeGraph (@colbymchenry/codegraph, MIT) - BENCHMARK ONLY, never a dependency of Mole.
import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const require = createRequire(import.meta.url);
export const cgBin = () => join(dirname(require.resolve('@colbymchenry/codegraph/package.json')), '..', '..', '.bin', 'codegraph');
const env = { ...process.env, CODEGRAPH_TELEMETRY: '0' };

export function cgInit(dir) {
  rmSync(join(dir, '.codegraph'), { recursive: true, force: true });
  const t0 = performance.now();
  execFileSync(cgBin(), ['init', dir], { stdio: 'ignore', env, maxBuffer: 1 << 28 });
  return performance.now() - t0;
}

export function cgSync(dir) {
  const t0 = performance.now();
  execFileSync(cgBin(), ['sync', dir], { stdio: 'ignore', env, maxBuffer: 1 << 28 });
  return performance.now() - t0;
}

export function cgEdges(dir) {
  const db = new DatabaseSync(join(dir, '.codegraph', 'codegraph.db'), { readOnly: true });
  const rows = db.prepare(`SELECT s.file_path AS file, e.line AS line, t.file_path AS tfile, t.name AS tname, t.kind AS tkind
    FROM edges e JOIN nodes s ON s.id = e.source JOIN nodes t ON t.id = e.target
    WHERE e.kind IN ('calls','instantiates') AND e.line IS NOT NULL AND t.kind NOT IN ('import','file')`).all();
  db.close();
  return rows.map((r) => ({ file: String(r.file), line: Number(r.line), tfile: String(r.tfile), tleaf: String(r.tname).replace(/^.*\./, '') }));
}
