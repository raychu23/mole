// @mole/history: L2 "the why + what broke before" (T12).
// For a change (commit, diff file or working tree): per edited hunk, the past fix commits that last
// wrote those lines (git blame on the parent), with their reason, guarding tests and a clickable source.
// Deterministic git plumbing only: no model calls (modelCalls stays 0).

export type Change = { sha: string } | { diffFile: string; base?: string } | { worktree: true };

export interface CheckOptions {
  /** which commits count as fixes; default DEFAULT_FIX_RULE, else .mole/config.json {"fixRule"} */
  fixRule?: RegExp | string;
}

export interface ReasonSource {
  kind: 'commit' | 'comment' | 'task' | 'note';
  /** repo-relative path (comment: file in the fix commit; task/note: the file) */
  path?: string;
  line?: number;
  text: string;
}

export interface GuardTest {
  file: string;
  /** describe/it titles the fix added or edited next to */
  names?: string[];
  /** fix = the fix commit touched it; symbol = it references the edited symbol at the base */
  via?: 'fix' | 'symbol';
}

export interface PastFix {
  sha: string;
  shortSha: string;
  subject: string;
  date: string;
  author: string;
  reason: string;
  reasonSources: ReasonSource[];
  tests: GuardTest[];
  /** clickable source: the fix commit and the line in its own version of the file */
  source: { sha: string; file: string; line: number };
  /** base-side line numbers of this hunk that the fix last wrote */
  lines: number[];
}

export interface Hunk {
  file: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  pastFixes: PastFix[];
}

export interface CheckResult {
  change: { kind: 'sha' | 'diff' | 'worktree'; ref: string; base: string };
  fixRule: string;
  hunks: Hunk[];
  noPastFixes: boolean;
  ms: number;
}

export const DEFAULT_FIX_RULE = '^(fix|revert)\\b|regression|review fixes';

/** counts model (LLM) calls made by this package: there are none, and the bench asserts 0 */
export const modelCalls = { count: 0 };

export const NO_PAST_FIXES = 'no past fixes on these lines';

export async function check(_repoRoot: string, _change: Change, _opts: CheckOptions = {}): Promise<CheckResult> {
  throw new Error('not implemented');
}

export function formatCheck(_r: CheckResult): string {
  throw new Error('not implemented');
}
