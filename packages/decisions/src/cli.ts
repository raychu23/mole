// `mole decisions [--json] [--root DIR] [--adr-dir DIR[,DIR]] [--test-report FILE]`: every decision and tenet with its flag,
// reasons and file:line. No daemon, no model.
import { resolve } from 'node:path';
import { computeFlags } from './flags.js';
import { loadGraph } from './graph.js';
import type { DecisionsResult, FlagContext, FlagResult, LoadOptions } from './types.js';

/** The JSON `mole decisions --json` prints and the MCP tool mole_decisions returns. */
export function decisions(root: string, opts: LoadOptions & FlagContext = {}): DecisionsResult {
  const graph = loadGraph(root, { adrDirs: opts.adrDirs });
  return { root, decisions: computeFlags(graph, { testReport: opts.testReport }), problems: graph.problems };
}

export function formatDecisions(r: DecisionsResult): string {
  const out: string[] = [];
  if (r.decisions.length === 0) out.push('mole: no decisions (.mole/tenets.md, .mole/decisions/*.md, or pass --adr-dir DIR)');
  const w = Math.max(4, ...r.decisions.map((d) => d.id.length));
  for (const d of r.decisions) {
    out.push(`${d.flag.padEnd(6)} ${d.id.padEnd(w)}  ${d.title.length > 70 ? `${d.title.slice(0, 67)}...` : d.title}  ${d.file}:${d.line}`);
    for (const x of d.reasons) out.push(`${' '.repeat(9 + w)}${x.flag} ${x.code}: ${x.text}  ${x.file}:${x.line}`);
  }
  for (const p of r.problems) out.push(`problem ${p.file}:${p.line}: ${p.message}`);
  const count = (f: FlagResult['flag']) => r.decisions.filter((d) => d.flag === f).length;
  out.push(`${r.decisions.length} records: ${count('red')} red, ${count('yellow')} yellow, ${count('green')} green, ${count('grey')} grey`);
  return out.join('\n');
}

const str = (v: string | true | undefined): string | undefined => (typeof v === 'string' ? v : undefined);

/** CLI entry used by packages/daemon/src/cli.ts. */
export function decisionsCli(_pos: string[], flags: Record<string, string | true>, root: string): number {
  const adr = str(flags['adr-dir']);
  const report = str(flags['test-report']);
  const r = decisions(root, {
    adrDirs: adr ? adr.split(',').map((s) => s.trim()).filter(Boolean) : [],
    testReport: report ? resolve(process.cwd(), report) : undefined,
  });
  console.log(flags.json ? JSON.stringify(r, null, 2) : formatDecisions(r));
  return 0;
}
