// T24 claim check: what an agent says it did (its final answer) against what it did (its own tool calls + results, git).
// Types only. Deterministic: sentence split + patterns, no model call.
import type { Harness, Outcome, Skipped, Sources } from '../types.js';

export type ClaimCategory = 'test' | 'exit' | 'commit' | 'merge' | 'push' | 'file' | 'fix';
export type Verdict = 'supported' | 'unsupported' | 'contradicted';

/** One tool call that backs or contradicts a claim. */
export interface ClaimEvidence {
  callId: string;
  tool: string;
  /** hermes: messages.id of the call; JSONL: 1-based line */
  row: number;
  /** exit code the tool reported, when it reported one */
  exit: number | null;
  outcome: Outcome;
  /** a commit sha the call shows, when the claim is about a commit */
  commit: string | null;
  /** the command (or file) and the part of the result that decided it, one line */
  detail: string;
}

export interface Claim {
  /** the claim as written (a clause of the answer) */
  text: string;
  /** character offsets of text in the answer */
  start: number;
  end: number;
  category: ClaimCategory;
  verdict: Verdict;
  evidence: ClaimEvidence[];
  /** why this verdict, one line */
  why: string;
  /** round 8 precision guard: a flag the Stop hook prints. Only a success claim (pass, exit 0, commit, merge, push, file,
   *  fix) with a concrete contradicting tool result, or with no tool call of that kind in the whole run. Weaker flags
   *  (a count or a run of 'this kind' not found, a pass that predates an edit, failure claims) stay in `mole claims`
   *  output but are not pushed into the agent's session. Always false for supported claims. */
  hook: boolean;
}

/** A claim found by the splitter, before it is checked. */
export interface ClaimSpan {
  text: string;
  start: number;
  end: number;
  category: ClaimCategory;
}

/** A turn-final answer: the last assistant text before the next user message. */
export interface Answer {
  run: string;
  harness: Harness;
  /** hermes: messages.id; JSONL: 1-based line */
  row: number;
  time: string;
  text: string;
}

export interface ClaimsReport {
  run: string;
  harness: Harness | null;
  /** the answer that was checked (null when the run has none) */
  answer: Answer | null;
  claims: Claim[];
  summary: { supported: number; unsupported: number; contradicted: number };
  /** true when the answer has no checkable claim ('nothing to check') */
  nothing: boolean;
  skipped: Skipped[];
}

export interface ClaimsOptions extends Sources {
  /** check this answer instead of the run's last one: its row (hermes messages.id / JSONL line) */
  at?: number;
  /** check this text instead of an answer from the transcript (e.g. a runs.jsonl line the agent wrote) */
  text?: string;
  /** with text: only tool calls (and results) before this row count as evidence; default = the whole run */
  before?: number;
}
