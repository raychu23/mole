// Git AI Authorship Logs (git note in `refs/notes/ai`, attached post-commit). Table format per usegitai.com docs
// (fetched 2026-10-30, context/product-plan/systems/design-reviews/research/ has the Entire pages; git-ai's own
// pages are summarized in tasks/T39-import-agent-session-logs/4 log/prior-art.md with URLs):
//   <file>   <sessionId> <line-ranges>[   <sessionId2> <line-ranges2> ...]
//   ...
//   ---
//   { "schema_version": "authorship/3.0.0", "git_ai_version": "...", "base_commit_sha": "...", "prompts": {...} }
// (usegitai.com/docs/cli/how-git-ai-works, "Git Note Format"). `git log --show-notes=ai` pretty-prints the same
// file/session/range table indented under "Notes (ai):"; both shapes are accepted here.
//
// T76 (2026-11-03): the real v1.7.5 binary's own notes (tasks/T76-agent-log-import-real/4 log/real-samples/gitai/,
// produced with git-ai's own `mock_ai`/`human`/`known_human` test presets -- no live AI agent, no fixture) always
// emit `"prompts": {}` and instead carry attribution under two undocumented keys: `sessions` (AI checkpoints,
// keyed by the table row's session id with the `::<sub-session>` suffix stripped) and `humans` (`known_human`
// checkpoints -- explicitly NOT agent work). Both the docs' `prompts` shape and the real `sessions`/`humans` shape
// are read below; a row whose id is a key in `humans` is skipped entirely (importing it would be a wrong link:
// a human-attested range reported as AI-authored).
import type { RawIntent } from './types.js';

interface GitAiMetadata {
  schema_version?: string;
  git_ai_version?: string;
  base_commit_sha?: string;
  prompts?: Record<string, { agent?: string; model?: string; author?: string; messages_url?: string }>;
  sessions?: Record<string, { agent_id?: { tool?: string; id?: string; model?: string }; human_author?: string }>;
  humans?: Record<string, { author?: string }>;
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

// git_ai_standard_v3.0.0.md §1.2.3.1 "Attestation Key Formats": three key prefixes route to three maps --
//   `s_` -> metadata.sessions (composite `s_<id>::t_<trace>`, split on `::` and look up the base `s_<id>`)
//   `h_` -> metadata.humans (bare `h_<id>`, never composite)
//   (no prefix) -> metadata.prompts (legacy, pre-v1.4.0, bare 16-hex)
// A row whose id is an `h_` key is ALWAYS a known-human attestation, never agent work (§1.2.3.1 "Human Keys":
// "Human keys: MUST correspond to an entry in `metadata.humans`"). T76 review (2026-11-03): the original fix
// only excluded `s.sessionId in parsed.meta.humans` -- an exact-string lookup. Two real cases that check missed:
//  1. the BASE of a composite `base::sub` id is the humans key (not the full composite string) -- can't happen
//     with a spec-compliant `h_` key (never composite), but a malformed/future note could still carry one, and
//     checking the base, not just the full id, costs nothing and closes the gap either way.
//  2. an `h_`-prefixed id shows up with `meta.humans` absent entirely (older note, or a parser that dropped the
//     map) -- the prefix itself identifies it as human per the spec, independent of whether the map confirms
//     it; treating a bare prefix match as "unknown, import it" would be the wrong-link class this task exists
//     to catch, so an h_-prefixed id with no humans map is still excluded (treated as human / skipped).
function isHumanRow(sessionId: string, humans: GitAiMetadata['humans']): boolean {
  if (sessionId.startsWith('h_')) return true; // spec: h_ prefix always identifies a human key, map or not
  const baseId = sessionId.split('::')[0]!;
  if (humans && (sessionId in humans || baseId in humans)) return true;
  return false;
}

export function gitAiToRawIntents(parsed: { files: GitAiFileEntry[]; meta: GitAiMetadata }): RawIntent[] {
  const out: RawIntent[] = [];
  for (const f of parsed.files) {
    for (const s of f.sessions) {
      // A row whose id is a key in meta.humans (or h_-prefixed at all, per the spec) is a known_human
      // checkpoint, not agent work -- importing it would be a wrong link (T76 real-samples/gitai/
      // note-3-multi-file-mixed-human-ai.txt, fileB.js rows).
      if (isHumanRow(s.sessionId, parsed.meta.humans)) continue;
      const legacyPrompt = parsed.meta.prompts?.[s.sessionId]; // docs' shape: prompts keyed by the bare sessionId
      // Real shape: an AI row's id is "<base_session_id>::<sub_session_id>"; meta.sessions is keyed by the base.
      const baseId = s.sessionId.split('::')[0]!;
      const session = parsed.meta.sessions?.[baseId] ?? parsed.meta.sessions?.[s.sessionId];
      const agent = legacyPrompt?.agent ?? session?.agent_id?.tool;
      const model = legacyPrompt?.model ?? session?.agent_id?.model;
      for (const r of s.ranges) {
        out.push({
          source: 'git-ai',
          sessionId: s.sessionId,
          file: f.file,
          startLine: r.startLine,
          endLine: r.endLine,
          agent,
          model,
          commitSha: parsed.meta.base_commit_sha,
        });
      }
    }
  }
  return out;
}
