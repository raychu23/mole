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

/** T49: which decisions govern this change and how, decided with ZERO LLM calls (prCheck's own scope anchors,
 *  content anchors and -- now -- rules/check.ts import:/call: violations). This is Mole's actual value proposition
 *  over the non-Mole baseline (RAG over every decision in the repo): routing the right decision(s) to a check at
 *  no cost, instead of paying to search/read all of them every time. `routing` is independent of the cascade's
 *  eventual verdict, so routing accuracy (did Mole find the governing decision at all) can be measured apart from
 *  verdict correctness (did the tier that decided get the right answer). */
export interface RoutedDecision {
  decision: string;
  title: string;
  /** anchor kinds that routed this decision here: 'match' | 'export-convention' | 'rule' | the scope target string */
  hitKinds: string[];
}

export interface CascadeResult {
  base: string;
  head: string;
  verdicts: CascadeVerdict[];
  /** files touched by this diff that no decision's scope covers at all (not in verdicts: nothing to decide) */
  files: string[];
  /** T49: every decision prCheck found governing this change, zero-LLM, before any escalation decided a verdict */
  routing: RoutedDecision[];
  ms: number;
}
