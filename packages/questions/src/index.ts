// @mole/questions: L3 questions (T14). For a change, at most 3 questions aimed at your understanding, built from
// deterministic templates over facts other packages found: past fixes + guarding tests (@mole/history, T12),
// your notes (@mole/memory, T11) and, later, your seen history (T13, a typed hook only). A model may only reword
// a question's text behind a flag; it never decides which questions exist, their order or their sources.
import type { Change, CheckOptions, CheckResult } from '@mole/history';

export type QuestionKind = 'past-fix' | 'note' | 'guard-test' | 'seen';

export interface Question {
  /** 1-based position after ranking (past fix > note > guard-test > seen; a guard-test edit always keeps a slot) */
  rank: number;
  kind: QuestionKind;
  text: string;
  /** the fact the question is about */
  cites: { sha?: string; note?: string; testFile?: string };
  /** clickable source: file:line (in commit `sha` when given, else at the base / the note file) */
  source: { file: string; line: number; sha?: string };
}

/** A note (T11) on a symbol the change edits. file is relative to the notes root ('.mole/notes/x.md'). */
export interface NoteFact {
  file: string;
  symbol: string;
  path: string;
  /** base-side line range of the symbol */
  startLine: number;
  endLine: number;
  /** fresh = the symbol's body at the base still has the note's hash */
  status: 'fresh' | 'stale';
  text: string;
  author: string;
  written: string;
  /** line of the note body in the note file */
  line: number;
}

/** A guarding test of a past fix that the change edits or deletes (read from the test diff). */
export interface GuardFact {
  testFile: string;
  /** describe/it titles the change edits or deletes that the fix named as its tests */
  names: string[];
  action: 'edits' | 'deletes';
  /** base-side first edited line */
  line: number;
  fix: { sha: string; shortSha: string; subject: string; date: string };
  /** blame = the fix last wrote the edited test lines; named = the fix added/edited (or sat in) a test with that title */
  via: 'blame' | 'named';
}

/** T13 hook (not built yet): something you looked at before, on a file/line this change touches. */
export interface SeenFact {
  file: string;
  line: number;
  when: string;
  what: string;
  sha?: string;
}

export interface QuestionsOptions extends CheckOptions {
  /** read .mole/notes from this directory instead of the repo root (e.g. for a read-only clone) */
  notesRoot?: string;
  /** T13 input (future): your seen history; ignored when absent */
  seen?: SeenFact[];
  /** reword the template text with a model; with no model configured this is a no-op plus a notice */
  reword?: boolean;
  /** the model hook used when reword is on; never consulted for which questions exist */
  model?: (text: string) => Promise<string>;
}

export interface QuestionsResult {
  questions: Question[];
  facts: CheckResult & { notes: NoteFact[]; guards: GuardFact[] };
  modelCalls: number;
  notices: string[];
}

export const MAX_QUESTIONS = 3;

export async function questions(_root: string, _change: Change, _opts: QuestionsOptions = {}): Promise<QuestionsResult> {
  throw new Error('not implemented');
}

export function formatQuestions(_qs: Question[]): string {
  throw new Error('not implemented');
}
