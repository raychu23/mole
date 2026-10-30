// Best-effort readers for the three formats when they already run in a real repo (no capture of our own,
// Entire deep-dive ADOPT: consume don't capture). Every reader is read-only and never throws: a missing git
// binary, an absent ref/notes namespace, or no sidecar files all mean "nothing from this source here", not a
// crash. See 4 log/prior-art.md for exactly which parts of each format are documented vs INFERENCE here.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { agentTraceToRawIntents, parseAgentTrace } from './agenttrace.js';
import { entireToRawIntents, parseEntireCheckpoint } from './entire.js';
import { gitAiToRawIntents, parseGitAiNote } from './gitai.js';
import { anchorIntents, recheckIntents } from './unify.js';
import type { AnchorMiss, IntentStatus, RawIntent, SessionIntent } from './types.js';

function git(root: string, args: string[]): string | undefined {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return undefined;
  }
}

/** git-ai: every commit with a note under refs/notes/ai (usegitai.com "Attribution storage"). */
function readGitAiIntents(root: string): RawIntent[] {
  const listing = git(root, ['notes', '--ref=ai', 'list']);
  if (!listing) return [];
  const out: RawIntent[] = [];
  for (const line of listing.split('\n').filter(Boolean)) {
    const commitSha = line.trim().split(/\s+/)[1];
    if (!commitSha) continue;
    const note = git(root, ['notes', '--ref=ai', 'show', commitSha]);
    if (!note) continue;
    try {
      out.push(...gitAiToRawIntents(parseGitAiNote(note)));
    } catch {
      /* a malformed note is skipped, not fatal to the others */
    }
  }
  return out;
}

/** Entire Checkpoints: entire/checkpoints/v1 (legacy git-branch backend), metadata.json per checkpoint id
 * (docs/architecture/sessions-and-checkpoints.md). The git-refs backend (refs/entire/checkpoints/<shard>/<id>)
 * is not walked here -- it has no single enumerable ref to list from outside Entire's own CLI; INFERENCE,
 * logged in 2 insights.md as a known gap, not claimed as covered by M33 (the fixtures test the parser only). */
function readEntireIntents(root: string): RawIntent[] {
  if (!git(root, ['rev-parse', '--verify', 'entire/checkpoints/v1'])) return [];
  const listing = git(root, ['ls-tree', '-r', '--name-only', 'entire/checkpoints/v1']);
  if (!listing) return [];
  const out: RawIntent[] = [];
  for (const path of listing.split('\n').filter((p) => p.endsWith('metadata.json'))) {
    const content = git(root, ['show', `entire/checkpoints/v1:${path}`]);
    if (!content) continue;
    try {
      out.push(...entireToRawIntents(parseEntireCheckpoint(content)));
    } catch {
      /* one bad checkpoint file does not block the rest */
    }
  }
  return out;
}

/** Agent Trace v0.1.0 has no single standard storage path in the fetched spec; `.agent-trace/*.json` sidecar
 * files are this reader's own convention (INFERENCE, 4 log/prior-art.md), tried first since Cognition's and
 * Jujutsu's integrations write trace records as plain files beside the repo. */
function readAgentTraceIntents(root: string): RawIntent[] {
  const dir = join(root, '.agent-trace');
  if (!existsSync(dir)) return [];
  const out: RawIntent[] = [];
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.json')) continue;
    const p = join(dir, name);
    if (!statSync(p).isFile()) continue;
    try {
      out.push(...agentTraceToRawIntents(parseAgentTrace(readFileSync(p, 'utf8'))));
    } catch {
      /* one bad trace record does not block the rest */
    }
  }
  return out;
}

export function collectExternalIntents(root: string): { raw: RawIntent[]; misses: AnchorMiss[]; intents: SessionIntent[] } {
  const raw = [...readGitAiIntents(root), ...readEntireIntents(root), ...readAgentTraceIntents(root)];
  const { intents, misses } = anchorIntents(root, raw);
  return { raw, misses, intents };
}

export interface AgentIntentResult {
  target: string;
  statuses: IntentStatus[];
  misses: AnchorMiss[];
}

/** target = repo-relative file, or file#tail / bare tail (matches CodeSymbol.qualifiedName's tail, like T18's
 * `mole tried`/`mole agents`). Used by the MCP tool and the VS Code panel's agents section -- one function, two
 * callers, so "connected into the final product" never drifts into two different answers. */
export function agentIntentsFor(root: string, target: string): AgentIntentResult {
  const { intents, misses } = collectExternalIntents(root);
  const [file, tail] = target.includes('#') ? (target.split('#') as [string, string]) : [target, undefined];
  const matched = intents.filter((it) => (tail ? it.tail === tail || it.qualifiedName.endsWith(`#${tail}`) : it.file === file || it.file.endsWith(`/${file}`)));
  return { target, statuses: recheckIntents(root, matched), misses: misses.filter((m) => (tail ? false : m.file === file || m.file.endsWith(`/${file}`))) };
}
