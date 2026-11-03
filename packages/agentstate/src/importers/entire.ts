// Entire Checkpoints: real public data, not docs. T76 (2026-11-03) fetched 5 real checkpoints (10 metadata.json
// files: root + session 0 each) from entireio/cli's own public `refs/entire/checkpoints/*` namespace (the tool
// dogfoods itself; no `entire` CLI, no install, no live agent session -- plain `git ls-remote`/`git fetch`/
// `git cat-file`, see ../../tasks/T76-agent-log-import-real/4 log/real-samples/entire/README.md for the exact
// commands). T39's prior-art claim that no real public Entire checkpoint data exists was FALSE.
//
// The real wire shape, confirmed against both the fetched data and entireio/cli's own
// `api/checkpoint/metadata.go` (`CheckpointSummary`, `Metadata`) and `docs/architecture/sessions-and-checkpoints.md`:
// snake_case fields (`checkpoint_id`, `files_touched`, `token_usage`, ...), and `sessions` in the root
// metadata.json is an array of *file paths* to each session's own metadata.json -- not session objects, and
// never session line-range objects. Neither the root nor any per-session metadata.json carries a line range
// anywhere. T39's `EntireSessionRecord.fileRanges: Array<{file,startLine,endLine}>` does not exist in the real
// format; it was a hand-built domain-model guess (see git history for the pre-T76 shape). The granularity the
// real data supports is file-level (`files_touched`), not line-level -- `entireToRawIntents` below reflects
// that honestly by marking every RawIntent `granularity: 'file'` rather than inventing a line range.
//
// Commit linkage: `commit_sha` in metadata.json is an *import-only* anchor (empty on every non-imported
// checkpoint, confirmed in all 5 real samples) -- the real link from a checkpoint to its commit is the
// `Entire-Checkpoint: <checkpoint_id>` trailer Entire stamps on the commit message (confirmed in entireio/cli's
// own source comment on `Metadata.CommitSHA` and in docs.entire.io/guides/checkpoints/overview: "Entire adds
// that ID to the commit message with an Entire-Checkpoint trailer"; a real instance of the trailer is saved in
// 4 log/real-samples/entire/commit-trailer-example.txt). `findCommitForCheckpoint` in external.ts resolves this
// the same way a human would: `git log --grep`.
import { readFileSync } from 'node:fs';
import type { RawIntent } from './types.js';

export interface EntireTokenUsage {
  inputTokens?: number;
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
  outputTokens?: number;
  apiCallCount?: number;
}

/** Root metadata.json (`CheckpointSummary`). `sessions` is file paths to each session's own metadata.json,
 * not session records -- callers that want session detail must separately read+parse each path. */
export interface EntireCheckpointSummary {
  checkpointId: string;
  cliVersion?: string;
  strategy?: string;
  branch?: string;
  commitSha?: string; // import-only; empty on normal (non-imported) checkpoints
  checkpointsCount?: number;
  filesTouched: string[]; // real data: null or [] are both normalized to []
  sessionMetadataPaths: string[]; // raw.sessions[].metadata, e.g. "/0/metadata.json"
  tokenUsage?: EntireTokenUsage;
}

/** Per-session metadata.json (`Metadata`, abbreviated to the fields this importer uses). */
export interface EntireSessionMetadata {
  checkpointId: string;
  sessionId: string;
  branch?: string;
  commitSha?: string; // import-only; empty on normal (non-imported) checkpoints
  filesTouched: string[];
  agent?: string; // e.g. "Claude Code" (real data: human-readable tool label, not a lowercase slug)
  model?: string; // real data: "" (empty string) when unknown -- always present, per the Go doc comment
  turnId?: string;
}

function readTokenUsage(raw: Record<string, unknown> | undefined): EntireTokenUsage | undefined {
  if (!raw) return undefined;
  return {
    inputTokens: typeof raw.input_tokens === 'number' ? raw.input_tokens : undefined,
    cacheCreationTokens: typeof raw.cache_creation_tokens === 'number' ? raw.cache_creation_tokens : undefined,
    cacheReadTokens: typeof raw.cache_read_tokens === 'number' ? raw.cache_read_tokens : undefined,
    outputTokens: typeof raw.output_tokens === 'number' ? raw.output_tokens : undefined,
    apiCallCount: typeof raw.api_call_count === 'number' ? raw.api_call_count : undefined,
  };
}

export function parseEntireCheckpointSummary(json: string): EntireCheckpointSummary {
  const raw = JSON.parse(json) as Record<string, unknown>;
  if (typeof raw.checkpoint_id !== 'string' || !Array.isArray(raw.sessions)) {
    throw new Error('entire checkpoint metadata.json: missing checkpoint_id or sessions[]');
  }
  const sessionMetadataPaths = (raw.sessions as Array<Record<string, unknown>>).map((s) => (typeof s.metadata === 'string' ? s.metadata : '')).filter(Boolean);
  return {
    checkpointId: raw.checkpoint_id,
    cliVersion: typeof raw.cli_version === 'string' ? raw.cli_version : undefined,
    strategy: typeof raw.strategy === 'string' ? raw.strategy : undefined,
    branch: typeof raw.branch === 'string' ? raw.branch : undefined,
    commitSha: typeof raw.commit_sha === 'string' && raw.commit_sha ? raw.commit_sha : undefined,
    checkpointsCount: typeof raw.checkpoints_count === 'number' ? raw.checkpoints_count : undefined,
    filesTouched: Array.isArray(raw.files_touched) ? (raw.files_touched as string[]) : [], // real data: null when none
    sessionMetadataPaths,
    tokenUsage: readTokenUsage(raw.token_usage as Record<string, unknown> | undefined),
  };
}

export function parseEntireSessionMetadata(json: string): EntireSessionMetadata {
  const raw = JSON.parse(json) as Record<string, unknown>;
  if (typeof raw.checkpoint_id !== 'string' || typeof raw.session_id !== 'string') {
    throw new Error('entire session metadata.json: missing checkpoint_id or session_id');
  }
  return {
    checkpointId: raw.checkpoint_id,
    sessionId: raw.session_id,
    branch: typeof raw.branch === 'string' ? raw.branch : undefined,
    commitSha: typeof raw.commit_sha === 'string' && raw.commit_sha ? raw.commit_sha : undefined,
    filesTouched: Array.isArray(raw.files_touched) ? (raw.files_touched as string[]) : [],
    agent: typeof raw.agent === 'string' && raw.agent ? raw.agent : undefined,
    model: typeof raw.model === 'string' && raw.model ? raw.model : undefined, // "" normalizes to undefined
    turnId: typeof raw.turn_id === 'string' ? raw.turn_id : undefined,
  };
}

export function readEntireCheckpointSummary(path: string): EntireCheckpointSummary {
  return parseEntireCheckpointSummary(readFileSync(path, 'utf8'));
}

export function readEntireSessionMetadata(path: string): EntireSessionMetadata {
  return parseEntireSessionMetadata(readFileSync(path, 'utf8'));
}

/** One RawIntent per (session, touched file) -- file-level, the only granularity the real data supports.
 * `startLine`/`endLine` are set to the whole-file sentinel [1,1] and MUST NOT be read as a claimed precise
 * range: `granularity: 'file'` on the RawIntent tells unify.ts to report these as an explicit miss (reason:
 * no line data) rather than silently anchoring to whichever symbol happens to sit at line 1 -- anchoring a
 * file-wide claim to one function would be a fabricated precision the source data never provided.
 * `commitSha` is the caller-resolved commit (from the Entire-Checkpoint trailer, see external.ts), not a
 * metadata.json field -- real metadata.json's own `commit_sha` is import-only and normally absent. */
export function entireToRawIntents(summary: Pick<EntireCheckpointSummary, 'filesTouched'>, sessions: EntireSessionMetadata[], commitSha?: string): RawIntent[] {
  const out: RawIntent[] = [];
  for (const s of sessions) {
    const files = s.filesTouched.length > 0 ? s.filesTouched : summary.filesTouched;
    for (const file of files) {
      out.push({
        source: 'entire',
        sessionId: s.sessionId,
        file,
        startLine: 1,
        endLine: 1,
        granularity: 'file',
        agent: s.agent,
        model: s.model,
        commitSha: s.commitSha ?? commitSha,
      });
    }
  }
  return out;
}

// --- LEGACY (hand-built, never a real Entire wire shape) ------------------------------------------------------
// T39 originally hand-built this `fileRanges` shape from the *checkpoint-level* domain model described in
// context/product-plan/systems/design-reviews/research/entire-page-sessions-and-checkpoints.txt (CheckpointID,
// CommitSHA, FilesTouched, Sessions[]) because no per-session file/line-range wire format was known at the
// time. T76 (2026-11-03) fetched 5 real checkpoints from entireio/cli's public refs and confirmed Entire never
// writes this shape -- real session metadata has no `fileRanges` field at all (see the real types above).
// Kept only so the pre-existing fixture-based test keeps passing under a name that says what it actually is.
export interface EntireLegacySessionRecord {
  sessionId: string;
  agentType?: string;
  model?: string;
  prompt?: string;
  fileRanges: Array<{ file: string; startLine: number; endLine: number }>;
}

export interface EntireLegacyCheckpointMetadata {
  checkpointId: string;
  commitSha: string;
  filesTouched: string[];
  sessions: EntireLegacySessionRecord[];
}

export function parseEntireCheckpointLegacyFixture(json: string): EntireLegacyCheckpointMetadata {
  const raw = JSON.parse(json) as Partial<EntireLegacyCheckpointMetadata> & Record<string, unknown>;
  if (!raw.checkpointId || !Array.isArray(raw.sessions)) {
    throw new Error('entire legacy fixture: missing checkpointId or sessions[]');
  }
  return raw as EntireLegacyCheckpointMetadata;
}

export function entireLegacyFixtureToRawIntents(meta: EntireLegacyCheckpointMetadata): RawIntent[] {
  const out: RawIntent[] = [];
  for (const s of meta.sessions) {
    for (const r of s.fileRanges) {
      out.push({
        source: 'entire',
        sessionId: s.sessionId,
        file: r.file,
        startLine: r.startLine,
        endLine: r.endLine,
        agent: s.agentType,
        model: s.model,
        prompt: s.prompt,
        commitSha: meta.commitSha,
      });
    }
  }
  return out;
}
