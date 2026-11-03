// T39: the three external agent-session-memory formats, unified onto one lifecycle (Entire deep-dive ADOPT:
// "per-agent hook adapters -> one shared lifecycle", context/product-plan/systems/design-reviews/research/
// entire-deep-dive-2026-10-29.md). Mole does not capture its own sessions where one of these already runs
// (T18's reader stays the fallback for Claude Code/Hermes logs with none of these installed).

export type IntentSource = 'entire' | 'git-ai' | 'agent-trace';

/** A raw (file, line-range) -> session claim, before it is anchored to a function. */
export interface RawIntent {
  source: IntentSource;
  sessionId: string;
  file: string; // repo-relative
  startLine: number; // 1-based inclusive
  endLine: number; // 1-based inclusive
  /** T76: 'file' marks a claim whose source data has no real line range (e.g. real Entire `files_touched`
   * -- file-level only). startLine/endLine on a 'file' intent are a [1,1] sentinel, not a claimed precise
   * range, and anchorIntents (unify.ts) must report these as an explicit miss rather than anchor to whatever
   * symbol sits at the sentinel line. Default/undefined means 'line' (a real per-line claim, anchor as usual). */
  granularity?: 'line' | 'file';
  agent?: string;
  model?: string;
  prompt?: string;
  commitSha?: string;
}

/** A RawIntent anchored to the function whose declaration range contains it, with the body hash at anchor time
 * (T11's normalizedHash, so later edits can be re-checked exactly like a note: hash now != hash then -> stale).
 * startLine/endLine are the *raw* claimed range (not the whole function), so a hover can place it precisely. */
export interface SessionIntent {
  source: IntentSource;
  sessionId: string;
  file: string;
  qualifiedName: string; // CodeSymbol.qualifiedName the intent anchors to
  tail: string;
  startLine: number;
  endLine: number;
  agent?: string;
  model?: string;
  prompt?: string;
  commitSha?: string;
  hashAtImport: string;
}

export interface AnchorMiss {
  source: IntentSource;
  sessionId: string;
  file: string;
  startLine: number;
  endLine: number;
  reason: string;
}

export interface AnchorResult {
  intents: SessionIntent[];
  misses: AnchorMiss[];
}

export type StaleStatus = 'fresh' | 'stale';

export interface IntentStatus {
  intent: SessionIntent;
  status: StaleStatus;
  currentHash?: string; // undefined when the function no longer exists at all (counts stale)
}
