// `mole hotspots [--top N] [--since DATE] [--fix-rule RE] [--json]` (T70, D68): churn x indentation
// complexity x decision volatility x incident/fix density, ranked, each rank explained by its four
// inputs. Same JSON as the `mole_hotspots` MCP tool.
import { computeHotspots, formatHotspots } from './index.js';

export async function hotspotsCli(_pos: string[], flags: Record<string, string | true>, root: string): Promise<number> {
  const top = typeof flags.top === 'string' ? Number(flags.top) : undefined;
  if (top !== undefined && (!Number.isFinite(top) || top < 1)) {
    console.error('usage: mole hotspots [--top N] [--since DATE] [--fix-rule RE] [--json] [--root DIR]');
    return 2;
  }
  const r = await computeHotspots(root, {
    top,
    since: typeof flags.since === 'string' ? flags.since : undefined,
    fixRule: typeof flags['fix-rule'] === 'string' ? flags['fix-rule'] : undefined,
  });
  console.log(flags.json === true ? JSON.stringify(r, null, 2) : formatHotspots(r));
  return 0;
}
