// Cascade at check time (T46): zero-LLM tier (T27/T32's prCheck content anchors + scope anchors) decides first;
// escalate to exactly ONE LLM call, with only the governing decision's own text, when a decision's scope is touched
// but no crisp rule decided (FrugalGPT, arXiv:2305.05176 -- stop as early in the cascade as a tier can decide).
export type CascadeTier = 'zero-llm' | 'llm';
export type CascadeFlag = 'violates' | 'compliant';

export interface CascadeVerdict {
  decision: string;
  title: string;
  tier: CascadeTier;
  flag: CascadeFlag;
  /** why the tier that decided, decided (anchor name(s), or the LLM's one-sentence reason) */
  reason: string;
  usage?: { inputTokens?: number; outputTokens?: number; costUsd?: number };
  ms: number;
}

export interface CascadeResult {
  base: string;
  head: string;
  verdicts: CascadeVerdict[];
  /** files touched by this diff that no decision's scope covers at all (not in verdicts: nothing to decide) */
  files: string[];
  ms: number;
}
