// Git AI Authorship Logs (git note in `refs/notes/ai`, attached post-commit). Format per usegitai.com docs
// (fetched 2026-10-30, context/product-plan/systems/design-reviews/research/ has the Entire pages; git-ai's own
// pages are summarized in tasks/T39-import-agent-session-logs/4 log/prior-art.md with URLs):
//   <file>   <sessionId> <line-ranges>[   <sessionId2> <line-ranges2> ...]
//   ...
//   ---
//   { "schema_version": "authorship/3.0.0", "git_ai_version": "...", "base_commit_sha": "...",
//     "prompts": { "<sessionId>": { "agent": "...", "model": "...", "author": "...", "messages_url": "..." } } }
// (usegitai.com/docs/cli/how-git-ai-works, "Git Note Format"). `git log --show-notes=ai` pretty-prints the same
// file/session/range table indented under "Notes (ai):"; both shapes are accepted here.
import type { RawIntent } from './types.js';

interface GitAiMetadata {
  schema_version?: string;
  git_ai_version?: string;
  base_commit_sha?: string;
  prompts?: Record<string, { agent?: string; model?: string; author?: string; messages_url?: string }>;
}

interface GitAiFileEntry {
  file: string;
  sessions: Array<{ sessionId: string; ranges: Array<{ startLine: number; endLine: number }> }>;
}

/** parses a line like "1-8,10-21" into inclusive [start,end] ranges */
function parseRanges(spec: string): Array<{ startLine: number; endLine: number }> {
  return spec
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const m = /^(\d+)(?:-(\d+))?$/.exec(part);
      if (!m) throw new Error(`git-ai note: bad line range "${part}"`);
      const start = Number(m[1]);
      const end = m[2] ? Number(m[2]) : start;
      return { startLine: start, endLine: end };
    });
}

/** Parses the raw note body (the table above `---`, plus JSON metadata after it). Also accepts
 * `git log --show-notes=ai` output, stripping the "Notes (ai):" header and its extra indent. */
export function parseGitAiNote(note: string): { files: GitAiFileEntry[]; meta: GitAiMetadata } {
  const cleaned = note.replace(/^\s*Notes \(ai\):\s*$/m, '').split('\n');
  const sepIdx = cleaned.findIndex((l) => l.trim() === '---');
  const tableLines = (sepIdx >= 0 ? cleaned.slice(0, sepIdx) : cleaned).map((l) => l.replace(/^\s+/, '')).filter((l) => l.trim().length > 0);
  const jsonText = sepIdx >= 0 ? cleaned.slice(sepIdx + 1).join('\n').trim() : '';
  const meta: GitAiMetadata = jsonText ? JSON.parse(jsonText) : {};

  // Each line splits on runs of 2+ spaces/tabs into groups; the first group is the file (or, on a continuation
  // line, already a "<sessionId> <ranges>" pair), every later group is a "<sessionId> <ranges>" pair separated
  // by a single space (usegitai.com "Git Note Format": one row per file, one column pair per session).
  const sessionPair = /^(\S+)\s+([\d,-]+)$/;
  const files: GitAiFileEntry[] = [];
  let current: GitAiFileEntry | undefined;
  for (const line of tableLines) {
    const groups = line.split(/\s{2,}|\t+/).filter(Boolean);
    if (groups.length === 0) continue;
    const first = groups[0]!;
    const firstIsPair = sessionPair.test(first);
    let pairs = groups;
    if (!firstIsPair || !current) {
      current = { file: first, sessions: [] };
      files.push(current);
      pairs = groups.slice(1);
    }
    for (const g of pairs) {
      const m = sessionPair.exec(g);
      if (!m) continue; // a bare range with no session id on a continuation line: nothing to attribute, skip
      current.sessions.push({ sessionId: m[1]!, ranges: parseRanges(m[2]!) });
    }
  }
  return { files, meta };
}

export function gitAiToRawIntents(parsed: { files: GitAiFileEntry[]; meta: GitAiMetadata }): RawIntent[] {
  const out: RawIntent[] = [];
  for (const f of parsed.files) {
    for (const s of f.sessions) {
      const prompt = parsed.meta.prompts?.[s.sessionId];
      for (const r of s.ranges) {
        out.push({
          source: 'git-ai',
          sessionId: s.sessionId,
          file: f.file,
          startLine: r.startLine,
          endLine: r.endLine,
          agent: prompt?.agent,
          model: prompt?.model,
          commitSha: parsed.meta.base_commit_sha,
        });
      }
    }
  }
  return out;
}
