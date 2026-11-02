// `mole decisions [--json] [--root DIR] [--adr-dir DIR[,DIR]] [--test-report FILE]`: every decision and tenet with its flag,
// reasons and file:line. No daemon, no model.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { computeFlags } from './flags.js';
import { loadGraph } from './graph.js';
import { formatSections, sectionsOf } from './rationale.js';
import type { DecisionsResult, FlagContext, FlagResult, LoadOptions } from './types.js';

/** The JSON `mole decisions --json` prints and the MCP tool mole_decisions returns. Every decision/tenet
 * node (T43) gets its full rationale text attached (bounded, section-aware -- see rationale.ts), read
 * straight from the record's own file so this works the same for .mole/decisions/*.md records and plain
 * ADR-folder records (graph.ts loadAdrDir) alike: both already carry a file:line, and neither needed a
 * new on-disk copy of the text to get this -- it was always right there, just never read past the title. */
export function decisions(root: string, opts: LoadOptions & FlagContext = {}): DecisionsResult {
  const graph = loadGraph(root, { adrDirs: opts.adrDirs });
  const flagged = computeFlags(graph, { testReport: opts.testReport });
  const fileOf = new Map(graph.nodes.map((n) => [n.id, n.file]));
  const withRationale: FlagResult[] = flagged.map((d) => {
    const file = fileOf.get(d.id);
    if (!file) return d;
    let text: string | undefined;
    try {
      text = readFileSync(resolve(root, file), 'utf8');
    } catch {
      text = undefined;
    }
    if (text === undefined) return d;
    const rationale = formatSections(sectionsOf(text));
    return rationale ? { ...d, rationale } : d;
  });
  return { root, decisions: withRationale, problems: graph.problems };
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
