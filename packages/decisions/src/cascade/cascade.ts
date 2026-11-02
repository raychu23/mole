// Cascade at check time (T46). Tier 0 (zero-LLM, $0, ~100ms): `prCheck()`'s own governed list; a hit from a `match:`
// content anchor or the export-convention AST fallback is crisp (the pattern IS the violation signal) and decides
// outright, no escalation. A hit that comes ONLY from a path/folder/symbol scope anchor (no content anchor fired) is
// "a governed scope is touched but no rule decides" -- exactly the task contract's escalation trigger -- and
// escalates to tier 1: ONE LLM call with only that decision's own text + the real diff of the files it hit, same
// prompt shape as M2's oracle llm-reviewer arm (run_llm_arms.py), so the numbers are directly comparable.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { LlmClient } from '../compile/types.js';
import { prCheck } from '../check/pr-check.js';
import type { CascadeFlag, CascadeResult, CascadeVerdict } from './types.js';

export interface CascadeOptions {
  root: string;
  base: string;
  head: string;
  recordsRoot?: string;
  adrDirs?: string[];
  /** injectable model call for the escalation tier; omit to run the zero-LLM tier only (tests, or a caller that
   *  wants to see what's ambiguous without spending anything). */
  llm?: LlmClient;
  /** the governing decision's own text, by id, for the ONE escalation call. Required to actually escalate; a
   *  decision with no text available is reported as zero-LLM 'violates' with that reason (never silently dropped). */
  decisionText?: (id: string) => string | undefined;
}

const ESCALATE_PROMPT = (decisionText: string, diff: string): string =>
  [
    'You are reviewing a code change against one specific team architecture decision (an ADR).',
    '',
    '--- THE DECISION (full text) ---',
    decisionText,
    '',
    '--- THE CODE CHANGE (unified diff) ---',
    diff,
    '',
    'Does this change VIOLATE the decision above? Answer with exactly one line first:',
    'VERDICT: VIOLATES or VERDICT: COMPLIANT',
    'Then one short sentence of reasoning.',
  ].join('\n');

function parseVerdict(text: string): CascadeFlag | undefined {
  const m = /VERDICT:\s*(VIOLATES|COMPLIANT)/i.exec(text);
  if (!m) return undefined;
  return m[1]!.toUpperCase() === 'VIOLATES' ? 'violates' : 'compliant';
}

function gitDiffFor(root: string, mergeBase: string, head: string, paths: string[]): string {
  if (!paths.length) return '';
  try {
    return execFileSync('git', ['-C', root, 'diff', `${mergeBase}..${head}`, '--', ...paths], { encoding: 'utf8', maxBuffer: 1024 * 1024 * 16 });
  } catch {
    return '';
  }
}

export async function cascadeCheck(opts: CascadeOptions): Promise<CascadeResult> {
  const t0 = performance.now();
  const recordsRoot = opts.recordsRoot ?? opts.root;
  const pr = await prCheck({ root: opts.root, base: opts.base, head: opts.head, recordsRoot, adrDirs: opts.adrDirs });
  const verdicts: CascadeVerdict[] = [];
  for (const g of pr.governed) {
    const t1 = performance.now();
    const crisp = g.hits.some((h) => h.anchor.startsWith('match:') || h.anchor === 'export-convention');
    if (crisp) {
      verdicts.push({ decision: g.id, title: g.title, tier: 'zero-llm', flag: 'violates', reason: `content anchor matched (${g.hits.map((h) => h.anchor).join(', ')})`, ms: Math.round(performance.now() - t1) });
      continue;
    }
    // governed only by a path/folder/symbol scope anchor: scope touched, no crisp rule decided -> escalate ONCE
    const paths = [...new Set(g.hits.map((h) => h.path))];
    if (!opts.llm) {
      verdicts.push({ decision: g.id, title: g.title, tier: 'zero-llm', flag: 'violates', reason: 'scope anchor touched; no LLM tier configured for this call, reporting the raw governed hit', ms: Math.round(performance.now() - t1) });
      continue;
    }
    const text = opts.decisionText?.(g.id);
    if (!text) {
      verdicts.push({ decision: g.id, title: g.title, tier: 'zero-llm', flag: 'violates', reason: 'scope anchor touched; no decision text available to escalate to the LLM tier', ms: Math.round(performance.now() - t1) });
      continue;
    }
    const diff = gitDiffFor(opts.root, pr.mergeBase, pr.head, paths);
    const { text: resp, usage } = await opts.llm.complete(ESCALATE_PROMPT(text, diff));
    const flag = parseVerdict(resp) ?? 'violates'; // an unparsable LLM response is reported as a flag, never silently dropped
    verdicts.push({ decision: g.id, title: g.title, tier: 'llm', flag, reason: resp.replace(/^VERDICT:\s*\S+\s*/i, '').trim() || resp, usage, ms: Math.round(performance.now() - t1) });
  }
  return { base: pr.base, head: pr.head, verdicts, files: pr.files, ms: Math.round(performance.now() - t0) };
}

/** Reads a decision's own full text from its record file, for `CascadeOptions.decisionText`. `adrFile`, when given,
 *  overrides with the original ADR/source file (what the T36 importer saw) -- the richer text a real cascade would
 *  prefer when the record itself is a thin overlay (bench and M24-bench-style records). */
export function decisionTextFromRecords(recordsRoot: string, nodes: Array<{ id: string; file: string }>, adrFile?: (id: string) => string | undefined): (id: string) => string | undefined {
  return (id: string) => {
    const override = adrFile?.(id);
    if (override) {
      try {
        return readFileSync(resolve(override), 'utf8');
      } catch {
        // fall through to the record file
      }
    }
    const node = nodes.find((n) => n.id === id);
    if (!node) return undefined;
    try {
      return readFileSync(resolve(recordsRoot, node.file), 'utf8');
    } catch {
      return undefined;
    }
  };
}
