// Types of `mole pr-check` (T32).
import type { Flag, Problem } from '../types.js';

export interface PrCheckOptions {
  /** the git repository (any path inside it) */
  root: string;
  /** PR base and head commit-ish; the diff is merge-base(base, head)..head, as GitHub shows it */
  base: string;
  head: string;
  /** where the .mole records live (default: root). When it is inside the checked repository, records (and notes) are read
   *  at the merge base from git objects, never from the working tree (review 1 P1-1); a folder outside the repository
   *  (the M24 bench overlays) is read as it is on disk. */
  recordsRoot?: string;
  /** plain ADR folders to load too (they carry no scope, so they never govern lines) */
  adrDirs?: string[];
  /** past fixes + questions (T12/T14); default true */
  history?: boolean;
  notesRoot?: string;
  fixRule?: string;
  /** option 1: records' `match:` content anchors govern added lines whose text matches (default true) */
  contentAnchors?: boolean;
  /** option 2: version-only hunks are not governed by scope anchors (default false: the M24 keys label bumps of a decided
   *  component as governed, so the rule cost recall 0.52 -> 0.31 on the frozen key; kept for the options bench) */
  versionBumpRule?: boolean;
}

export interface CheckAnnotation {
  path: string;
  start_line: number;
  end_line: number;
  annotation_level: 'notice' | 'warning' | 'failure';
  title: string;
  message: string;
}

/** The body of POST /repos/{owner}/{repo}/check-runs. */
export interface CheckRunPayload {
  name: string;
  head_sha: string;
  status: 'completed';
  conclusion: 'neutral' | 'success';
  output: { title: string; summary: string; text?: string; annotations: CheckAnnotation[] };
}

export interface GovernedRecord {
  id: string;
  title: string;
  status: string;
  flag: Flag;
  /** the record file and line (relative to the records root) */
  file: string;
  line: number;
  /** which anchors matched which changed lines (head-side line ranges; old-side when only deleted) */
  hits: Array<{ anchor: string; path: string; side: 'new' | 'old'; ranges: Array<[number, number]> }>;
}

export interface UnanchoredRecord {
  id: string;
  title: string;
  flag: 'grey';
  anchor: string;
  /** the path the anchor names (gone at head) and where git says it went */
  path: string;
  renamedTo?: string;
  reason: string;
}

export interface PrQuestion {
  rank: number;
  kind: string;
  text: string;
  source: { file: string; line: number; sha?: string };
}

export interface PrCheckResult {
  base: string;
  head: string;
  mergeBase: string;
  files: string[];
  governed: GovernedRecord[];
  unanchored: UnanchoredRecord[];
  owners: string[];
  ownersByFile: Record<string, string[]>;
  codeownersFile: string | null;
  pastFixes: Array<{ file: string; line: number; sha: string; subject: string }>;
  questions: PrQuestion[];
  /** review 1 P1-1: records the PR itself adds / edits / deletes (they never govern this check; the merge-base copy does) */
  recordsChanged: RecordChange[];
  /** review 1 P2-3: record problems that stop a record from governing (invalid or nested-quantifier `match:` patterns) */
  problems: Problem[];
  silent: boolean;
  checkRun: CheckRunPayload;
  ms: number;
}

export interface RecordChange {
  id: string;
  title: string;
  /** the record file relative to the records root (head name; base name for a deletion) */
  file: string;
  change: 'added' | 'edited' | 'deleted';
  statusBase?: string;
  statusHead?: string;
}

export interface CodeOwners {
  ownersOf(path: string): string[];
}
