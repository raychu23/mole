// Agent Trace v0.1.0 (open spec, Cursor RFC + Cognition/Devin, agent-trace.dev, fetched 2026-10-30).
// One JSON record per { version, id, timestamp, vcs?, tool?, files[{path, conversations[{url?, contributor,
// ranges[{start_line,end_line,content_hash?}], related?}]}], metadata? }. See
// tasks/T39-import-agent-session-logs/4 log/prior-art.md for the fetched spec text.
import type { RawIntent } from './types.js';

interface AgentTraceRange {
  start_line: number;
  end_line: number;
  content_hash?: string;
}
interface AgentTraceContributor {
  type: 'ai' | 'human';
  model_id?: string;
}
interface AgentTraceConversation {
  url?: string;
  contributor: AgentTraceContributor;
  ranges: AgentTraceRange[];
  related?: Array<{ type: string; url: string }>;
}
interface AgentTraceFile {
  path: string;
  conversations: AgentTraceConversation[];
}
export interface AgentTraceRecord {
  version: string;
  id: string;
  timestamp: string;
  vcs?: { type: string; revision: string };
  tool?: { name: string; version?: string };
  files: AgentTraceFile[];
  metadata?: Record<string, unknown>;
}

export function parseAgentTrace(json: string): AgentTraceRecord {
  const rec = JSON.parse(json) as Partial<AgentTraceRecord>;
  if (!rec.version || !rec.id || !Array.isArray(rec.files)) {
    throw new Error('agent-trace record: missing version/id/files[] (spec v0.1.0 appendix A minimal record)');
  }
  return rec as AgentTraceRecord;
}

export function agentTraceToRawIntents(rec: AgentTraceRecord): RawIntent[] {
  const out: RawIntent[] = [];
  for (const f of rec.files) {
    for (const conv of f.conversations) {
      if (conv.contributor.type !== 'ai') continue; // human-written ranges carry no agent intent
      for (const r of conv.ranges) {
        out.push({
          source: 'agent-trace',
          sessionId: conv.url ?? `${rec.id}:${f.path}:${r.start_line}`,
          file: f.path,
          startLine: r.start_line,
          endLine: r.end_line,
          model: conv.contributor.model_id,
          agent: rec.tool?.name,
          commitSha: rec.vcs?.revision,
        });
      }
    }
  }
  return out;
}
