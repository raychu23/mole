// T24 claim check: parse an agent's final answer for claims ('tests pass', 'fixed X', 'updated file Y', 'committed <sha>',
// 'exit 0', 'N/N passed', 'merged', 'pushed') and check each against the run's own tool calls + results (T18's readers)
// and git. Deterministic: sentence split + patterns, no model call. Sources are read-only.
import { defaultSources } from '../sources.js';
import type { Skipped, Sources } from '../types.js';
import { answersOf, locate } from './answers.js';
import { clauses, split } from './split.js';
import type { Answer, ClaimSpan, ClaimsOptions, ClaimsReport } from './types.js';
import { checkClause, evidenceOf } from './verify.js';

export * from './types.js';

const srcOf = (o: Sources): Required<Sources> => ({ ...defaultSources(), ...Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) });
const dedupe = (s: Skipped[]): Skipped[] => [...new Map(s.map((x) => [`${x.harness} ${x.path}`, x])).values()];

/** Split an answer into checkable claims (sentence split + patterns). */
export function splitClaims(text: string): ClaimSpan[] {
  return split(text);
}

/** Every turn-final answer of a run, oldest first ([] for an unknown run). */
export function finalAnswers(run: string, opts: ClaimsOptions = {}): Answer[] {
  const src = srcOf(opts);
  const skipped: Skipped[] = [];
  const loc = locate(run, src, skipped);
  return loc ? answersOf(loc, src, skipped) : [];
}

/**
 * Check the run's last answer (or the answer at opts.at, or opts.text) against the run's own tool calls before it.
 * Throws for an unknown run id.
 */
export function claims(run: string, opts: ClaimsOptions = {}): ClaimsReport {
  const src = srcOf(opts);
  const skipped: Skipped[] = [];
  const loc = locate(run, src, skipped);
  if (!loc) throw new Error(`no run ${run} (or the prefix is not unique)`);
  let answer: Answer | null = null;
  let before: number | undefined;
  if (opts.text !== undefined) {
    answer = { run: loc.raw.summary.id, harness: loc.harness, row: opts.before ?? 0, time: '', text: opts.text };
    before = opts.before;
  } else {
    const all = answersOf(loc, src, skipped);
    answer = (opts.at !== undefined ? all.find((a) => a.row === opts.at) : all.at(-1)) ?? null;
    before = answer?.row;
  }
  const evs = evidenceOf(loc.raw, before);
  const text = answer?.text ?? '';
  const list = answer ? clauses(text).map((c) => checkClause(c, text, loc.raw, evs)) : [];
  const n = (v: string): number => list.filter((c) => c.verdict === v).length;
  return {
    run: loc.raw.summary.id,
    harness: loc.harness,
    answer,
    claims: list,
    summary: { supported: n('supported'), unsupported: n('unsupported'), contradicted: n('contradicted') },
    nothing: list.length === 0,
    skipped: dedupe(skipped),
  };
}

const one = (s: string, n: number): string => {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

/** Human view: one line per claim (verdict, category, claim, evidence), 'nothing to check' when there is none. */
export function formatClaims(r: ClaimsReport): string {
  const head = `${r.harness ?? '?'} run ${r.run}${r.answer ? ` · answer at row ${r.answer.row}${r.answer.time ? ` (${r.answer.time})` : ''}` : ''}`;
  if (r.nothing) return `${head}\nmole: nothing to check (${r.answer ? 'no checkable claim in the answer' : 'the run has no answer'})`;
  const lines = r.claims.map((c) => {
    const e = c.evidence[0];
    const ev = e ? `${e.callId} ${e.tool}${e.exit !== null ? ` exit ${e.exit}` : ''}${e.commit ? ` commit ${e.commit}` : ''}: ${e.detail}` : 'no evidence';
    const weak = c.verdict !== 'supported' && !c.hook ? ' (weak: not sent by the Stop hook)' : '';
    return `  ${c.verdict.padEnd(12)} ${c.category.padEnd(6)} "${one(c.text, 110)}"\n      ${c.why}${weak} ← ${ev}`;
  });
  const s = r.summary;
  return [head, ...lines, `${s.supported} supported · ${s.unsupported} unsupported · ${s.contradicted} contradicted`].join('\n');
}
