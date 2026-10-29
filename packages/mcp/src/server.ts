import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { formatNeighborhood } from '@mole/core';
import { ensureDaemon, MoleClient, type EnsureOptions } from '@mole/daemon';
import { claims, defaultSources, tried } from '@mole/agentstate';
import { registerCollisionsTool } from './collisions-tool.js';
import { executeTool, GEN_AI } from '@mole/telemetry';
import type { Change } from '@mole/history';
import { resolve } from 'node:path';

export interface MoleMcpOptions extends EnsureOptions {
  /** Do not spawn a daemon if none runs (tests). */
  noStart?: boolean;
}

/** `mole_map(path|symbol)`: the same ranked neighbourhood the editor panel draws, as compact text for an agent. */
export function createServer(opts: MoleMcpOptions): McpServer {
  const server = new McpServer({ name: 'mole', version: '0.0.0' });
  server.registerTool(
    'mole_map',
    {
      title: 'Mole map',
      description:
        'Ranked neighbourhood (<=25 nodes) of a file or symbol: what it defines, who calls it, what it calls, who imports it. ' +
        'Facts come from the TypeScript compiler index with file:line evidence; no LLM. Use before reading unfamiliar code. ' +
        'For "called by" and "imported by" the line is where the call or import happens (the first one; ×N means N sites); for everything else it is the declaration line.',
      inputSchema: {
        target: z.string().describe('repo-relative file (src/a.ts), file#Symbol (src/a.ts#Cls.method), or a bare symbol name'),
        impact: z.boolean().optional().describe('also mark transitive callers (what breaks if this changes) with !impact'),
      },
    },
    // T16: OTel GenAI execute_tool span per call (no-op unless MOLE_OTEL=1)
    async ({ target, impact }, extra) =>
      executeTool('mole_map', { [GEN_AI.toolCallId]: String(extra.requestId), [GEN_AI.mcpMethod]: 'tools/call', 'mole.target': target }, async (span) => {
      const client = opts.noStart ? new MoleClient(opts) : await ensureDaemon(opts);
      let n = await client.map(target, impact === true);
      for (let i = 0; i < 50 && n.state === 'indexing'; i++) {
        await new Promise((r) => setTimeout(r, 200));
        n = await client.map(target, impact === true);
      }
      span({ 'mole.map.state': n.state });
      return { content: [{ type: 'text' as const, text: formatNeighborhood(n) }], isError: n.state === 'index-unavailable' };
    }),
  );
  // T18: what agents already tried (commands, tests, fixes + outcome), including before a context compaction
  server.registerTool(
    'mole_tried',
    {
      title: 'Mole tried',
      description:
        'Commands, tests and edits an agent run already tried, each with its outcome (pass/fail/unknown) and the compaction it came before. ' +
        'Target = a run id (Hermes session, Claude Code or Codex session id, or a unique prefix) or file#Symbol / file (the runs that edited it). ' +
        'Read from the local transcripts (read-only); no LLM. Use after a compaction, before retrying a fix.',
      inputSchema: { target: z.string().describe('run id or prefix, file#Symbol, or repo-relative file') },
    },
    async ({ target }) => ({ content: [{ type: 'text' as const, text: JSON.stringify(tried(target, { ...defaultSources(), root: opts.root }), null, 2) }] }),
  );
  // T24: what an agent says it did (its final answer) checked against what it did (its own tool calls + git)
  server.registerTool(
    'mole_claims',
    {
      title: 'Mole claims',
      description:
        "Checks an agent run's last answer: each claim (tests pass, N/N passed, exit 0, committed <sha>, merged, pushed, wrote <file>, fixed) " +
        "against the run's own tool calls and results and git, as supported / unsupported / contradicted with the evidence (tool call id, exit code, commit). " +
        'A claim only a subagent reported is unsupported. Same JSON as `mole claims <run> --json`. Deterministic patterns, no LLM.',
      inputSchema: { run: z.string().describe('run id (Hermes session, Claude Code or Codex session id, or a unique prefix)'), at: z.number().int().optional().describe('check the answer at this row instead of the last one') },
    },
    async ({ run, at }) => {
      try {
        return { content: [{ type: 'text' as const, text: JSON.stringify(claims(run, { ...defaultSources(), at }), null, 2) }] };
      } catch (e) {
        return { content: [{ type: 'text' as const, text: `mole_claims: ${(e as Error).message}` }], isError: true };
      }
    },
  );
  registerCollisionsTool(server, opts); // T21: parallel-agent collisions
  server.registerTool(
    'mole_check',
    {
      title: 'Mole check',
      description:
        'Before or after editing: for a change (the working tree vs HEAD, a commit sha, or a diff file + base), the past fix commits that last ' +
        'wrote the edited lines (git blame on the base), each with its reason (commit text, comments, task/note files), the tests that guard it ' +
        'and a source file:line in the fix; plus at most 3 questions about them. Same JSON as `mole check ... --json`. Git history only: no index, ' +
        'no daemon, no model calls. Give exactly one of sha, diff, worktree.',
      inputSchema: {
        root: z.string().optional().describe('repository root (default: the server root, MOLE_ROOT or cwd)'),
        sha: z.string().optional().describe('a commit: check what it changed against its parent'),
        diff: z.string().optional().describe('a unified diff file (relative to root or absolute)'),
        base: z.string().optional().describe('with diff: the commit the diff applies to (default HEAD)'),
        worktree: z.boolean().optional().describe('check the uncommitted working-tree change vs HEAD'),
        fixRule: z.string().optional().describe('regex for which commits count as fixes (default: fix/revert/regression/review fixes, or .mole/config.json)'),
        notesRoot: z.string().optional().describe('read .mole/notes from this directory instead of the root'),
      },
    },
    async (args) => {
      const modes = [args.sha !== undefined, args.diff !== undefined, args.worktree === true].filter(Boolean).length;
      if (modes !== 1) return { content: [{ type: 'text' as const, text: 'mole_check: give exactly one of sha, diff (+ base) or worktree: true' }], isError: true };
      const root = resolve(opts.root, args.root ?? '.');
      try {
        const json = await checkJson(root, args);
        return { content: [{ type: 'text' as const, text: JSON.stringify(json.result, null, 2) }, ...json.notices.map((n) => ({ type: 'text' as const, text: `mole: ${n}` }))] };
      } catch (e) {
        return { content: [{ type: 'text' as const, text: `mole_check: ${(e as Error).message}` }], isError: true };
      }
    },
  );
  // T29: the decision graph (tenets, decisions, plain ADR folders) with citator flags; same JSON as `mole decisions --json`
  server.registerTool(
    'mole_decisions',
    {
      title: 'Mole decisions',
      description:
        'Every decision and tenet of the repo (.mole/tenets.md, .mole/decisions/*.md, plus plain ADR folders) with a flag and its reasons at file:line: ' +
        'red = superseded/deprecated/orphaned (every scope anchor gone)/retired tenet; yellow = a proposed record conflicts with or supersedes it, its scope code ' +
        'changed since the approver confirmed, an anchor or evidence test is missing or failing, or a record it traces to is yellow/red; green = accepted and intact; ' +
        'grey = proposed. Same JSON as `mole decisions --json`. Files + git only, no model calls. Use before editing code a decision covers.',
      inputSchema: {
        root: z.string().optional().describe('repository root (default: the server root, MOLE_ROOT or cwd)'),
        adrDir: z.array(z.string()).optional().describe('plain ADR folders to include, relative to root (e.g. docs/architecture-decisions)'),
        testReport: z.string().optional().describe('a vitest JSON report: evidence tests that fail there turn their decisions yellow'),
      },
    },
    async (args) => {
      const root = resolve(opts.root, args.root ?? '.');
      try {
        const { decisions } = await import('@mole/decisions');
        const json = decisions(root, { adrDirs: args.adrDir ?? [], testReport: args.testReport ? resolve(root, args.testReport) : undefined });
        return { content: [{ type: 'text' as const, text: JSON.stringify(json, null, 2) }] };
      } catch (e) {
        return { content: [{ type: 'text' as const, text: `mole_decisions: ${(e as Error).message}` }], isError: true };
      }
    },
  );
  // T38: as-of answers from the bitemporal decision graph in Postgres (what held on a given date),
  // beside what a latest-only store would answer. Same engine @mole/temporal uses for its M32 bench.
  server.registerTool(
    'mole_decisions_asof',
    {
      title: 'Mole decisions as-of',
      description:
        "What a decision's status held on a given date (application/valid time), from the bitemporal store in Postgres " +
        '(EXCLUDE USING gist enforces 0 overlapping validity rows; history is append-only). Needs MOLE_TEMPORAL_PG ' +
        '(a Postgres connection string) in the environment; returns an error, not a guess, if it is unset or unreachable. ' +
        '0 model calls.',
      inputSchema: {
        decisionId: z.string().describe("a decision id, e.g. 'D24'"),
        attr: z.string().optional().describe("the fact attribute (default 'status')"),
        asOf: z.string().describe('an ISO timestamp: what held at that instant'),
      },
    },
    async (args) => {
      const connectionString = process.env.MOLE_TEMPORAL_PG;
      if (!connectionString) {
        return { content: [{ type: 'text' as const, text: 'mole_decisions_asof: set MOLE_TEMPORAL_PG (a Postgres connection string) to use this tool' }], isError: true };
      }
      try {
        const { openPool, asOf } = await import('@mole/temporal');
        const pool = openPool(connectionString);
        try {
          const value = await asOf(pool, args.decisionId, args.attr ?? 'status', args.asOf);
          return { content: [{ type: 'text' as const, text: value ?? 'not yet proposed' }] };
        } finally {
          await pool.end();
        }
      } catch (e) {
        return { content: [{ type: 'text' as const, text: `mole_decisions_asof: ${(e as Error).message}` }], isError: true };
      }
    },
  );
  return server;
}

export interface CheckArgs {
  sha?: string;
  diff?: string;
  base?: string;
  worktree?: boolean;
  fixRule?: string;
  notesRoot?: string;
}

/**
 * Exactly what `mole check <change> --json` prints (packages/daemon/src/cli.ts): T12's CheckResult with T14's questions, the
 * questions' internal facts (notes, guards) left out. Loaded lazily: git history + questions only, never the indexer.
 */
export async function checkJson(root: string, args: CheckArgs): Promise<{ result: Record<string, unknown>; notices: string[] }> {
  const { questions } = await import('@mole/questions');
  const change: Change = args.diff !== undefined ? { diffFile: resolve(root, args.diff), base: args.base } : args.sha !== undefined ? { sha: args.sha } : { worktree: true };
  const q = await questions(root, change, { fixRule: args.fixRule, notesRoot: args.notesRoot ? resolve(root, args.notesRoot) : undefined });
  const { notes: _notes, guards: _guards, ...r } = q.facts;
  return { result: { ...r, questions: q.questions }, notices: q.notices };
}
