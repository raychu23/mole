// `mole cascade-check --base SHA --head SHA` (T46): cascade at check time. Zero-LLM tier decides first; escalates
// to one LLM call per decision only when a governed scope is touched and no rule decided a crisp verdict.
import { loadGraph } from '../graph.js';
import { cascadeCheck, decisionTextFromRecords } from './cascade.js';
import { hermesLlmClient } from '../compile/llm.js';
import type { LlmClient } from '../compile/types.js';
import type { CascadeResult } from './types.js';

const str = (v: string | true | undefined): string | undefined => (typeof v === 'string' ? v : undefined);

export function formatCascade(r: CascadeResult): string {
  if (!r.verdicts.length) return `mole cascade-check: nothing governed these lines (${r.ms} ms)`;
  const out: string[] = [];
  for (const v of r.verdicts) {
    const cost = v.usage?.costUsd !== undefined ? ` $${v.usage.costUsd.toFixed(4)}` : '';
    out.push(`${v.flag.padEnd(9)} ${v.decision}  tier=${v.tier}${cost}  (${v.ms} ms)  ${v.reason}`);
  }
  const llmCalls = r.verdicts.filter((v) => v.tier === 'llm').length;
  out.push(`${r.verdicts.length} decision(s) governed, ${llmCalls} escalated to the LLM tier (${r.ms} ms total)`);
  return out.join('\n');
}

/** CLI entry used by packages/daemon/src/cli.ts. `--no-llm` runs the zero-LLM tier only (never escalates). */
export async function cascadeCheckCli(_pos: string[], flags: Record<string, string | true>, root: string, llm?: LlmClient): Promise<number> {
  const base = str(flags.base);
  const head = str(flags.head);
  if (!base || !head) {
    console.error('usage: mole cascade-check --base SHA --head SHA [--root DIR] [--records DIR] [--adr-dir DIR[,DIR]] [--no-llm] [--json]');
    return 2;
  }
  const recordsRoot = str(flags.records) ? str(flags.records)! : root;
  const adrDirs = str(flags['adr-dir'])?.split(',').map((s) => s.trim()).filter(Boolean);
  const graph = loadGraph(recordsRoot, { adrDirs });
  const client = flags['no-llm'] ? undefined : llm ?? hermesLlmClient();
  const r = await cascadeCheck({
    root,
    base,
    head,
    recordsRoot,
    adrDirs,
    llm: client,
    decisionText: decisionTextFromRecords(recordsRoot, graph.nodes),
  });
  console.log(flags.json ? JSON.stringify(r, null, 2) : formatCascade(r));
  return 0;
}
