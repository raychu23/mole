// L1 (T13): what you looked at (.mole/local/seen.jsonl, never committed) and what changed in it since your last look.

export const SEEN_LOG = '.mole/local/seen.jsonl';

export type SeenHow = 'visible' | 'hover' | 'note';

/** One line of .mole/local/seen.jsonl. */
export interface SeenEvent {
  time: string; // ISO
  symbol: string; // qualifiedName 'path#Tail'
  path: string;
  hash: string; // normalized-body hash at the time of looking
  how: SeenHow;
  commit: string; // HEAD sha at the time of looking ('' outside git or before the first commit)
}

/** What a recorder hands to appendSeen: text = the editor buffer when it differs from disk (else the file is read). */
export interface SeenInput {
  path: string;
  tail: string;
  how: SeenHow;
  time?: string;
  text?: string;
}

export interface SinceChange {
  commit: string; // full sha, or 'uncommitted' for working-tree edits
  author: string;
  email?: string;
  date: string; // ISO
  agent?: string; // Co-authored-by trailer name(s), ', '-joined
  subject: string;
}

export interface SinceEntry {
  symbol: string;
  path: string;
  status: 'changed' | 'deleted';
  newPath?: string; // the symbol moved to another file (and changed)
  line?: number; // current 1-based start line
  seen: SeenEvent;
  changes: SinceChange[]; // newest first
}

export interface SinceFile {
  path: string;
  symbols: SinceEntry[]; // newest change first
}

export interface SinceResult {
  seenLog: string;
  nothingSeen: boolean;
  seenCount: number; // distinct symbols with a seen event
  files: SinceFile[]; // file with the newest change first
}

export function appendSeen(_root: string, _inputs: SeenInput[]): SeenEvent[] {
  throw new Error('not implemented');
}

export function readSeen(_root: string): SeenEvent[] | undefined {
  throw new Error('not implemented');
}

export function since(_root: string): SinceResult {
  throw new Error('not implemented');
}

export function formatSince(_r: SinceResult): string {
  throw new Error('not implemented');
}
