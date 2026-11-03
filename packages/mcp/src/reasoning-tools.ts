// T61: the built reasoning features as READ-ONLY MCP tools, so an agent in Claude Code / Hermes / Codex sees them.
//   mole_priorities         T60 tenet order per phase: evaluate one phase (phase | at) or compare two
//   mole_incident_suggest   T58 losing arguments an incident may revive (suggest only; accept/dismiss stay CLI)
//   mole_proposals_compare  T56 proposal worktrees of THIS repo vs their baseline (found via git worktree list)
// Prior art (tasks/T61-reasoning-mcp-tools/4 log/prior-art.md): MCP 2025-06-18 tools (structuredContent + the same
// JSON as text; bad input / business errors = isError result), ToolAnnotations readOnlyHint, github-mcp-server
// --read-only (write tools left out). Writes are a person's act in Mole (T58/T59), so none are exposed here.
import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { comparePhases, evaluatePhase, suggestRevivals } from '@mole/decisions';
import { compareProposals, evaluateProposal, readMeta, type ProposalMeta } from '@mole/proposals';
import { READ_ONLY_ANNOTATIONS, sc } from './annotations.js';

interface Opts {
  root: string;
}

const ok = (o: object) => ({ content: [{ type: 'text' as const, text: JSON.stringify(o, null, 2) }], structuredContent: sc(JSON.parse(JSON.stringify(o)) as object) });
const fail = (tool: string, e: unknown) => ({ content: [{ type: 'text' as const, text: `${tool}: ${e instanceof Error ? e.message : String(e)}` }], isError: true });

const real = (p: string): string => {
  try {
    return realpathSync(p);
  } catch {
    return p;
  }
};

/** proposal worktrees of this repo, sorted by name. Never takes a path from the caller. A worktree counts only if its
 *  metadata names this repo AND it has the branch createProposal gives it, `mole/proposal/<name>`, checked out (review 1:
 *  a hand-written meta file in an unrelated linked worktree was trusted). One branch per worktree, so names are unique. */
export function repoProposals(root: string): Array<{ path: string; meta: ProposalMeta }> {
  const top = real(execFileSync('git', ['-C', root, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim());
  const listing = execFileSync('git', ['-C', root, 'worktree', 'list', '--porcelain'], { encoding: 'utf8' });
  const out: Array<{ path: string; meta: ProposalMeta }> = [];
  for (const block of listing.split('\n\n')) {
    const path = /^worktree (.+)$/m.exec(block)?.[1];
    const branch = /^branch (.+)$/m.exec(block)?.[1];
    if (!path || !branch || real(path) === top) continue;
    try {
      const meta = readMeta(path);
      const own = `mole/proposal/${meta.name}`;
      if (real(meta.repo) === top && meta.branch === own && branch === `refs/heads/${own}`) out.push({ path, meta });
    } catch {
      // not a Mole proposal worktree (another linked worktree): skip
    }
  }
  return out.sort((a, b) => a.meta.name.localeCompare(b.meta.name));
}

export function registerReasoningTools(server: McpServer, opts: Opts): void {
  server.registerTool(
    'mole_priorities',
    {
      title: 'Mole priorities',
      description:
        "The decision graph judged under one phase's tenet order (.mole/priorities.md: e.g. launch ranks speed over cost, scale the reverse; " +
        'an argument serves the tenet tagged #tenet-x on its definition), or two phases compared: every argument and decision that changes, with the attack ' +
        'that wins in one phase and loses in the other, both tenets and their ranks. Give `phase`, or `at` (YYYY-MM-DD, the phase in force then), or ' +
        '`compare` [A, B]; none = the phase in force today. Same JSON as `mole priorities`. Deterministic, no LLM, read-only.',
      inputSchema: {
        phase: z.string().optional().describe('phase name from .mole/priorities.md'),
        at: z.string().optional().describe('YYYY-MM-DD: use the phase in force on that date'),
        compare: z.array(z.string()).length(2).optional().describe('two phase names to compare'),
      },
      annotations: { ...READ_ONLY_ANNOTATIONS, title: 'Mole priorities' },
      outputSchema: z.object({}).passthrough(),
    },
    async ({ phase, at, compare }) => {
      try {
        if (compare && (phase || at)) throw new Error('give `compare`, or `phase`/`at`, not both');
        if (compare) return ok(comparePhases(opts.root, compare[0]!, compare[1]!));
        return ok(evaluatePhase(opts.root, { ...(phase ? { phase } : {}), ...(at ? { at } : {}) }));
      } catch (e) {
        return fail('mole_priorities', e);
      }
    },
  );

  server.registerTool(
    'mole_incident_suggest',
    {
      title: 'Mole incident suggest',
      description:
        'For an incident record (.mole/incidents/<id>.md), the recorded losing arguments it may revive: arguments that lost to what a named or ' +
        'scope-sharing decision rests on, ranked, each with its evidence and what else accepting it would reinstate. Suggestions only: accepting one is ' +
        "a person's act (`mole incident accept`), not available over MCP. Same JSON as `mole incident suggest`. Deterministic, no LLM, read-only.",
      inputSchema: {
        incident: z.string().describe('incident id, e.g. inc-42'),
        limit: z.number().int().nonnegative().optional().describe('max candidates (default 20; 0 = none, as the library)'),
      },
      annotations: { ...READ_ONLY_ANNOTATIONS, title: 'Mole incident suggest' },
      outputSchema: z.object({ incident: z.string(), candidates: z.array(z.unknown()) }).passthrough(),
    },
    async ({ incident, limit }) => {
      try {
        return ok({ incident, candidates: suggestRevivals(opts.root, incident, limit !== undefined ? { limit } : {}) });
      } catch (e) {
        return fail('mole_incident_suggest', e);
      }
    },
  );

  server.registerTool(
    'mole_proposals_compare',
    {
      title: 'Mole proposals compare',
      description:
        "This repo's decision proposals (what-if branches made with `mole-proposals create`) judged against the approved baseline they were made from: " +
        'which arguments and decisions change state in each, and why. Proposals are found from this repo\'s git worktrees; pass `names` to pick some ' +
        '(default: all). One proposal = its evaluation; two or more = side by side (must share a baseline). Same JSON as `mole-proposals compare`. Read-only.',
      inputSchema: { names: z.array(z.string()).optional().describe('proposal names (default: every proposal of this repo)') },
      annotations: { ...READ_ONLY_ANNOTATIONS, title: 'Mole proposals compare' },
      outputSchema: z.object({ baselineRevision: z.string(), proposals: z.array(z.unknown()) }).passthrough(),
    },
    async ({ names }) => {
      try {
        const all = repoProposals(opts.root);
        let picked = all;
        if (names) {
          const byName = new Map(all.map((p) => [p.meta.name, p]));
          const unknown = names.filter((n) => !byName.has(n));
          if (unknown.length) throw new Error(`unknown proposal ${unknown.join(', ')} (this repo has: ${all.map((p) => p.meta.name).join(', ') || 'none'})`);
          picked = [...new Set(names)].map((n) => byName.get(n)!);
        }
        if (picked.length === 0) throw new Error('no proposals in this repo -- create one with: mole-proposals create');
        if (picked.length === 1) return ok({ baselineRevision: picked[0]!.meta.baselineRevision, proposals: [evaluateProposal(picked[0]!.path)] });
        return ok(compareProposals(picked.map((p) => p.path)));
      } catch (e) {
        return fail('mole_proposals_compare', e);
      }
    },
  );
}
