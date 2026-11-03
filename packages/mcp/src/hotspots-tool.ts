// T70 (D68): `mole_hotspots` read-only MCP tool -- same JSON as `mole hotspots --json`. Follows the
// packages/mcp/src/reasoning-tools.ts pattern (one registerX(server, opts) per feature file, read
// through @mole/hotspots, never a second implementation).
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { computeHotspots } from '@mole/hotspots';
import { READ_ONLY_ANNOTATIONS, sc } from './annotations.js';

interface Opts {
  root: string;
}

export function registerHotspotsTool(server: McpServer, opts: Opts): void {
  server.registerTool(
    'mole_hotspots',
    {
      title: 'Mole hotspots',
      description:
        'Code areas to pay down, ranked (D68): churn (commits touching the file) x indentation-based complexity (Tornhill: logical-indent depth summed over ' +
        "the file) x decision volatility (decisions whose scope covers the file, plus `overrides` edges between them) x incident/fix density (commits whose " +
        'subject matches the fix rule). Each raw input is normalized (divided by the largest value of that input across the files considered) before the four ' +
        'are multiplied, so one outsized metric cannot alone dominate the rank (Nagappan & Ball: relative churn measures, not absolute, predict defects). Every ' +
        'rank in the result carries its own four raw + normalized inputs -- a rank never stands without the numbers that produced it. Same JSON as ' +
        '`mole hotspots --json`. Deterministic, no model calls, read-only.',
      inputSchema: {
        top: z.number().int().positive().optional().describe('max files to return (default 10)'),
        since: z.string().optional().describe('restrict churn/incident history to commits since this date (any `git log --since` value)'),
        fixRule: z.string().optional().describe('override the fix-commit-subject regex (default @mole/history\'s DEFAULT_FIX_RULE)'),
      },
      annotations: { ...READ_ONLY_ANNOTATIONS, title: 'Mole hotspots' },
      outputSchema: z.object({ ranked: z.array(z.unknown()), filesConsidered: z.number(), fixRule: z.string(), ms: z.number() }).passthrough(),
    },
    async ({ top, since, fixRule }) => {
      try {
        const r = await computeHotspots(opts.root, { ...(top !== undefined ? { top } : {}), ...(since ? { since } : {}), ...(fixRule ? { fixRule } : {}) });
        return { content: [{ type: 'text' as const, text: JSON.stringify(r, null, 2) }], structuredContent: sc(r) };
      } catch (e) {
        return { content: [{ type: 'text' as const, text: `mole_hotspots: ${e instanceof Error ? e.message : String(e)}` }], isError: true };
      }
    },
  );
}
