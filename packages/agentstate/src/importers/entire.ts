// Entire Checkpoints (entire/checkpoints/v1 or refs/entire/checkpoints/*, commit trailer `Entire-Checkpoint`).
// Doc source: context/product-plan/systems/design-reviews/research/entire-page-sessions-and-checkpoints.txt
// (CheckpointSummary: CheckpointID, CommitSHA, FilesTouched, Sessions[]). The docs describe the checkpoint-level
// shape (metadata.json) but not a published per-session file/line-range wire format, so per-session `fileRanges`
// here is built by hand from the described domain model (session = touched files + line spans a redacted
// transcript covers), labelled HAND-BUILT in 4 log/prior-art.md -- not copied from an undocumented field.
import { readFileSync } from 'node:fs';
import type { RawIntent } from './types.js';

export interface EntireSessionRecord {
  sessionId: string;
  agentType?: string; // types.AgentType per the Go struct
  model?: string;
  prompt?: string;
  fileRanges: Array<{ file: string; startLine: number; endLine: number }>;
}

export interface EntireCheckpointMetadata {
  checkpointId: string;
  commitSha: string;
  filesTouched: string[];
  sessions: EntireSessionRecord[];
}

export function parseEntireCheckpoint(json: string): EntireCheckpointMetadata {
  const raw = JSON.parse(json) as Partial<EntireCheckpointMetadata> & Record<string, unknown>;
  if (!raw.checkpointId || !Array.isArray(raw.sessions)) {
    throw new Error('entire checkpoint metadata.json: missing checkpointId or sessions[]');
  }
  return raw as EntireCheckpointMetadata;
}

export function readEntireCheckpoint(path: string): EntireCheckpointMetadata {
  return parseEntireCheckpoint(readFileSync(path, 'utf8'));
}

export function entireToRawIntents(meta: EntireCheckpointMetadata): RawIntent[] {
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
