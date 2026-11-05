// `mole scip stamp [--index index.scip] [--root DIR]`: write the content-hash manifest `mole rules`'s SCIP path
// uses for staleness detection (review round-2 HIGH-1). Run this right after the SCIP indexer (e.g.
// `scip-python index` then `mole scip stamp`), before committing `index.scip` -- see docs/decisions-and-rules.md.
import { join, resolve } from 'node:path';
import { stampScip } from './manifest.js';

export async function scipCli(pos: string[], flags: Record<string, string | true>, root: string): Promise<number> {
  const sub = pos[0];
  if (sub !== 'stamp') {
    console.error(`mole scip: unknown subcommand '${sub ?? ''}' (expected: stamp)`);
    return 2;
  }
  // `root` is the dispatcher's already-resolved --root (default cwd); resolving --root again here doubled a
  // relative path. A relative --index stays relative to that root (docs/decisions-and-rules.md).
  const indexFlag = typeof flags.index === 'string' ? flags.index : undefined;
  const scipRoot = root;
  const scipPath = indexFlag ? resolve(scipRoot, indexFlag) : join(scipRoot, 'index.scip');
  try {
    const manifest = stampScip(scipRoot, scipPath);
    console.log(`wrote ${scipPath}.manifest.json (${Object.keys(manifest.files).length} file(s), tool: ${manifest.tool})`);
    return 0;
  } catch (error) {
    console.error(`mole scip stamp: ${(error as Error).message}`);
    return 1;
  }
}
