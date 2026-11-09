// T53: router API types. RouteDoc is a decision's INDEX text for BM25 (title + one-line summary + a clipped slice
// of rationale.ts's own sections) -- deliberately much smaller than the record's full text (that's RAG's job, and
// its cost: M2 v2 results.md measured the RAG arm at $0.0255/check for reading every decision's full body).
import type { LlmClient, LlmUsage } from '../compile/types.js';

export interface RouteDoc {
  id: string;
  title: string;
  /** one-line summary, used ONLY in the stage-2 listwise LLM prompt (never the full index text) */
  summary: string;
  /** BM25 index text: title + summary + clipped rationale key terms (indexTextOf) */
  text: string;
  /** T118: the decision's own `scope:` / `in:` glob patterns (GraphNode.scope anchor targets), when the record
   *  declares any. Used ONLY as an optional ranking signal (scopeBoost) -- never a pre-filter: a decision with
   *  no scope, or a scope that matches nothing, must still compete on BM25 alone (T49's recall-ceiling finding:
   *  a decision with no authored anchor never got to compete). */
  scopeGlobs?: string[];
  /** T118 step B: repo file paths the ADR's own TEXT mentions (e.g. a "Key files" list), resolved against the
   *  real repo file list at load time by route/mentions.ts's extractMentionedPaths -- NOT an author-declared
   *  field like scopeGlobs. Exists for real ADR corpora that carry zero scope: anchors (see scopeGlobs doc);
   *  used ONLY as an optional ranking signal (mentionBoost), same recall-ceiling-preserving posture. */
  mentionPaths?: string[];
  /** T118 step B: backtick-coded identifiers (function/type names) the ADR's own text mentions, extracted by
   *  route/mentions.ts's extractMentionedIdentifiers. Matched against changeText itself (not just changedFiles)
   *  -- an identifier can appear in a diff hunk without the file path matching exactly. */
  mentionIdentifiers?: string[];
}

export interface RouteCandidate {
  id: string;
  title: string;
  bm25Score: number;
}

export type RouteTier = 'bm25' | 'bm25+llm';

export interface RouteResult {
  /** final routed decision ids for this change */
  routed: RouteCandidate[];
  /** every BM25-scored candidate above minScore, including ones stage 2 dropped (audit trail) */
  bm25Candidates: RouteCandidate[];
  tier: RouteTier;
  /** stage 1's own confidence in its top pick: top1Score / (top1Score + top2Score), 1 when there is no runner-up
   *  or no candidate at all. This is the number `confidenceRatio` is compared against to decide whether stage 2
   *  runs at all. */
  confidence: number;
  /** stage 2's usage, only when the LLM stage actually ran (bm25-only tier costs exactly $0) */
  usage?: LlmUsage;
  ms: number;
}

export interface RouteOptions {
  /** the change: file paths + hunk text (added/removed lines), assembled by the caller -- route.ts has no git
   *  dependency of its own, keeping the zero-LLM stage pure and unit-testable without a repo. */
  changeText: string;
  /** every decision this change could plausibly be about -- the repo's WHOLE candidate set, not pre-filtered by
   *  scope anchors (the T49-diagnosed recall ceiling: a decision with no authored anchor never got to compete). */
  decisions: RouteDoc[];
  /** how many BM25 candidates stage 2 ever sees (RankGPT-style small listwise window). Default 5. */
  topK?: number;
  /** BM25 score floor below which a candidate is dropped before stage 2 ever sees it. Default: any score > 0. */
  minScore?: number;
  /** stage 1 skips the LLM stage when confidence >= this ratio (top1/(top1+top2)). Default 0.75, tuned on M2 v2
   *  dev -- see t53-results.md. */
  confidenceRatio?: number;
  /** injectable stage-2 listwise pick call; omit to run the BM25-only tier (tests, or no LLM budget). */
  llm?: LlmClient;
  /** T118: file paths this change touches (caller-assembled, e.g. cascade.ts's own `pr.files`). Required for
   *  scopeBoost to do anything; with no changedFiles, scopeBoost is a no-op (falls back to plain BM25 order). */
  changedFiles?: string[];
  /** T118: opt-in (default false/undefined -- never changes existing behavior unless a caller asks). Re-ranks
   *  bm25Candidates by Reciprocal Rank Fusion (Cormack et al. 2009, k=60) of (a) the plain BM25 rank and (b) a
   *  second rank ordering decisions whose `scopeGlobs` match >=1 changedFiles ahead of those that don't, by match
   *  count. A decision with no scopeGlobs or no match is NEVER excluded or penalized below its BM25 rank's own
   *  contribution -- it just gets no boost from signal (b), same recall-ceiling-preserving rule as the base
   *  router (see RouteDoc.scopeGlobs doc). */
  scopeBoost?: boolean;
  /** T118 step B: opt-in (default false/undefined, independent flag from scopeBoost -- both may be set at once
   *  and their rank signals simply fuse together in the same RRF sum). Re-ranks bm25Candidates by RRF of the
   *  plain BM25 rank and a "mention match" rank: a decision's `mentionPaths` matching >=1 changedFiles, or its
   *  `mentionIdentifiers` appearing in changeText, counts toward the match (see RouteDoc.mentionPaths doc and
   *  route/mentions.ts). Same recall-ceiling-preserving contract as scopeBoost: a decision with no mentions or
   *  no match is never excluded or penalized below its BM25 rank alone. */
  mentionBoost?: boolean;
}
