// `mole claims <run> [--at ROW] [--json]`: a light entry (no LangGraph / TypeScript compiler load), so the Stop hook can
// run it on every stop. agentCli('claims') calls the same function.
import type { Skipped } from '../types.js';
import { claims, formatClaims } from './index.js';

const skippedLines = (s: Skipped[]): string[] => s.map((x) => `skipped ${x.harness} ${x.path}: ${x.reason}`);

export function claimsCli(pos: string[], flags: Record<string, string | true>): number {
  const target = pos[0];
  if (!target) {
    console.error('usage: mole claims <run> [--at ROW] [--json]   (run = Hermes session, Claude Code or Codex session id, or a unique prefix)');
    return 2;
  }
  const at = typeof flags.at === 'string' && /^\d+$/.test(flags.at) ? Number(flags.at) : undefined;
  let r;
  try {
    r = claims(target, { at });
  } catch (e) {
    console.error(`mole: ${e instanceof Error ? e.message : String(e)}`);
    return 1;
  }
  console.log(flags.json === true ? JSON.stringify(r, null, 2) : [formatClaims(r), ...skippedLines(r.skipped)].join('\n'));
  return 0;
}
