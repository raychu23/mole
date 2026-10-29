// T24 claim check (red commit: API only; the implementation comes after the checks).
import type { Answer, ClaimSpan, ClaimsOptions, ClaimsReport } from './types.js';

export * from './types.js';

const todo = (): never => {
  throw new Error('claims: not implemented yet (T24 red commit)');
};

/** Split an answer into checkable claims (sentence split + patterns). */
export function splitClaims(_text: string): ClaimSpan[] {
  return todo();
}

/** Every turn-final answer of a run, oldest first. */
export function finalAnswers(_run: string, _opts: ClaimsOptions = {}): Answer[] {
  return todo();
}

/** Check the run's last answer (or opts.at / opts.text) against the run's own tool calls and git. */
export function claims(_run: string, _opts: ClaimsOptions = {}): ClaimsReport {
  return todo();
}

/** Human view: one line per claim, 'nothing to check' when there is none. */
export function formatClaims(_r: ClaimsReport): string {
  return todo();
}
