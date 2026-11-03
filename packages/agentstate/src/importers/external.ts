// Best-effort readers for the three formats when they already run in a real repo (no capture of our own,
// Entire deep-dive ADOPT: consume don't capture). Every reader is read-only and never throws: a missing git
// binary, an absent ref/notes namespace, or no sidecar files all mean "nothing from this source here", not a
// crash. See 4 log/prior-art.md for exactly which parts of each format are documented vs INFERENCE here.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { agentTraceToRawIntents, parseAgentTrace } from './agenttrace.js';
import { entireToRawIntents, parseEntireCheckpointSummary, parseEntireSessionMetadata, type EntireCheckpointSummary, type EntireSessionMetadata } from './entire.js';
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

/** Entire Checkpoints. Two storage backends, both read here (docs/architecture/sessions-and-checkpoints.md,
 * confirmed against real public data, T76 2026-11-03):
 *  - legacy branch backend: orphan branch `entire/checkpoints/v1`, checkpoints at `<id[:2]>/<id[2:]>/metadata.json`
 *    (root) and `<id[:2]>/<id[2:]>/<n>/metadata.json` (session).
 *  - git-refs backend: `refs/entire/checkpoints/<id[:2]>/<id>` -- the ref points directly at the checkpoint's
 *    tree (not a commit), so `git ls-tree -r <ref>` walks it exactly like the legacy branch's per-checkpoint
 *    subtree: `metadata.json` (root) and `<n>/metadata.json` (session). Listed with `git for-each-ref`, which
 *    only sees refs already present locally (a clone/fetch of this namespace, or Entire itself) -- this reader
 *    is read-only and never fetches.
 * Root files_touched is null/empty when a checkpoint's own session already lists its files (real data: both
 * shapes occur), so entireToRawIntents falls back from session-level to root-level files_touched. Commit
 * linkage: real metadata.json's own `commit_sha` is import-only and normally absent (confirmed on all 5 T76
 * real samples) -- the real link is the `Entire-Checkpoint: <checkpoint_id>` trailer Entire stamps on the
 * linked commit's message (confirmed in entireio/cli's own source + docs, 4 log/real-samples/entire/README.md),
 * resolved here the same way a human would: `git log --grep`. */
function findCommitForCheckpoint(root: string, checkpointId: string): string | undefined {
  const out = git(root, ['log', '--all', '--fixed-strings', '--grep', `Entire-Checkpoint: ${checkpointId}`, '--format=%H', '-n', '1']);
  const sha = out?.trim();
  return sha ? sha : undefined;
}

function entireIntentsFromCheckpointTree(root: string, checkpointId: string, readPath: (path: string) => string | undefined): RawIntent[] {
  let rootMeta: EntireCheckpointSummary | undefined;
  const sessions: EntireSessionMetadata[] = [];
  const rootJson = readPath('metadata.json');
  if (rootJson) {
    try {
      rootMeta = parseEntireCheckpointSummary(rootJson);
    } catch {
      /* unreadable root metadata: still try per-session files below */
    }
  }
  for (const sessionPath of rootMeta?.sessionMetadataPaths ?? []) {
    const relPath = sessionPath.replace(/^\/+/, ''); // real data: paths are absolute-looking, e.g. "/0/metadata.json"
    const sessionJson = readPath(relPath);
    if (!sessionJson) continue;
    try {
      sessions.push(parseEntireSessionMetadata(sessionJson));
    } catch {
      /* one bad session file does not block the rest */
    }
  }
  if (sessions.length === 0) return [];
  const commitSha = findCommitForCheckpoint(root, checkpointId);
  return entireToRawIntents({ filesTouched: rootMeta?.filesTouched ?? [] }, sessions, commitSha);
}

/** Legacy branch backend: `entire/checkpoints/v1`. */
function readEntireLegacyBranchIntents(root: string): RawIntent[] {
  if (!git(root, ['rev-parse', '--verify', 'entire/checkpoints/v1'])) return [];
  const listing = git(root, ['ls-tree', '-r', '--name-only', 'entire/checkpoints/v1']);
  if (!listing) return [];
  const rootMetaPaths = listing
    .split('\n')
    .filter((p) => /^[^/]+\/[^/]+\/metadata\.json$/.test(p)); // "<id[:2]>/<id[2:]>/metadata.json", not a session subdir
  const out: RawIntent[] = [];
  for (const rootPath of rootMetaPaths) {
    const checkpointDir = rootPath.slice(0, -'/metadata.json'.length);
    const checkpointId = checkpointDir.replace('/', '');
    out.push(
      ...entireIntentsFromCheckpointTree(root, checkpointId, (relPath) => {
        const fullPath = relPath === 'metadata.json' ? rootPath : `${checkpointDir}/${relPath}`;
        return git(root, ['show', `entire/checkpoints/v1:${fullPath}`]);
      }),
    );
  }
  return out;
}

/** git-refs backend: `refs/entire/checkpoints/<shard>/<id>`, each ref a tree (not a commit). Local refs only. */
function readEntireRefsBackendIntents(root: string): RawIntent[] {
  const listing = git(root, ['for-each-ref', '--format=%(refname)', 'refs/entire/checkpoints']);
  if (!listing) return [];
  const out: RawIntent[] = [];
  for (const refname of listing.split('\n').filter(Boolean)) {
    const checkpointId = refname.split('/').pop();
    if (!checkpointId) continue;
    out.push(...entireIntentsFromCheckpointTree(root, checkpointId, (relPath) => git(root, ['show', `${refname}:${relPath}`])));
  }
  return out;
}

function readEntireIntents(root: string): RawIntent[] {
  return [...readEntireLegacyBranchIntents(root), ...readEntireRefsBackendIntents(root)];
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
