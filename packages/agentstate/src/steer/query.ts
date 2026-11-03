// Query: read-only agent state (Temporal Query semantics -- a snapshot, never blocks, never changes anything),
// built on @mole/agentstate's own run graph (T18, src/index.ts getRun) so `mole steer query` never re-implements
// run parsing. getRun loads the TypeScript-compiler-backed main index (LangGraph etc.) -- imported dynamically here
// so a plain `mole steer signal|update` never pays for it (same reasoning as claims/cli.ts's light-entry comment).
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { AgentStateSnapshot } from './types.js';

function parseId(text: string): string | undefined {
  return /^id:\s*'?([^'\n]*)'?\s*$/m.exec(text)?.[1]?.trim();
}
function parseTitle(text: string, id: string): string {
  return /^title:\s*'?([^'\n]*)'?\s*$/m.exec(text)?.[1]?.trim() ?? id;
}
function parseScopeFiles(text: string): string[] {
  const block = /^scope:\n((?:\s+-.*\n)+)/m.exec(text);
  const inline = /^scope:[ \t]*\[(.*)\][ \t]*$/m.exec(text);
  const items = block ? block[1]!.split('\n') : inline ? inline[1]!.replace(/[[\]]/g, '').split(',') : [];
  const out: string[] = [];
  for (const line of items) {
    const item = line.trim().replace(/^-\s*/, '').replace(/^['"]|['"]$/g, '');
    if (item && item.toLowerCase() !== 'repo-wide') out.push(item.split('#')[0]!);
  }
  return out;
}

/** Decisions (id, title) in .mole/decisions whose scope covers a file in `files` (exact path, or a scope folder
 * ('dir/') that contains it). Light, dependency-free parse -- mirrors the matching rule in
 * plugins/claude-code/scripts/lib.mjs's scopeMatches/governingDecisions, intentionally duplicated (see that file's
 * header comment: these two stay independent so agentstate never gains a @mole/decisions dependency). */
function decisionsInPlay(root: string, files: string[]): Array<{ id: string; title: string }> {
  const dir = join(root, '.mole', 'decisions');
  let names: string[];
  try {
    names = readdirSync(dir).filter((f) => f.endsWith('.md')).sort();
  } catch {
    return [];
  }
  const rels = files.map((f) => relative(root, f));
  const out: Array<{ id: string; title: string }> = [];
  for (const name of names) {
    let text: string;
    try {
      text = readFileSync(join(dir, name), 'utf8');
    } catch {
      continue;
    }
    const id = parseId(text);
    if (!id) continue;
    const scope = parseScopeFiles(text);
    const hit = scope.some((s) => rels.some((f) => f === s || (s.endsWith('/') ? f.startsWith(s) : false)));
    if (hit) out.push({ id, title: parseTitle(text, id) });
  }
  return out;
}

/** `mole steer query --session S`: the agent's current state from @mole/agentstate (T18) -- intent, files, decisions
 * in play. found: false (no other field set) when no source has this run; never throws on an unknown session. */
export async function queryAgentState(root: string, session: string): Promise<AgentStateSnapshot> {
  const { getRun } = (await import('../index.js')) as typeof import('../index.js');
  let g: ReturnType<typeof getRun> | null = null;
  try {
    g = getRun(session, { root });
  } catch {
    g = null;
  }
  if (!g) return { session, found: false };
  const files = new Set<string>();
  for (const s of g.steps) for (const f of s.files.edited) files.add(f);
  const last = g.steps.at(-1) ?? null;
  const intent = g.run.title ?? (last ? [last.operation, last.tool, last.command ?? last.files.edited.join(' ') ?? last.files.read.join(' ')].filter(Boolean).join(' ') : null);
  return {
    session,
    found: true,
    harness: g.run.harness,
    cwd: g.run.cwd,
    start: g.run.start,
    end: g.run.end,
    steps: g.run.steps,
    intent: intent || null,
    filesInPlay: [...files],
    decisionsInPlay: decisionsInPlay(root, [...files]),
    lastStep: last ? { time: last.time, operation: last.operation, kind: last.kind, tool: last.tool, command: last.command } : null,
  };
}
