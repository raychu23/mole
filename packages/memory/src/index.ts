// @mole/memory: L2 notes on code as repo files (.mole/notes/*.md), anchored to symbols, with fresh/stale/moved/orphaned status.
import type { NodeKind } from '@mole/core';

/** A code symbol a note can anchor to. qualifiedName = '<repo-relative path>#<tail>', tail like 'Daemon.start'. */
export interface CodeSymbol {
  qualifiedName: string;
  path: string;
  tail: string;
  kind: Extract<NodeKind, 'function' | 'class' | 'method'>;
  startLine: number; // 1-based, first line of the declaration (after leading comments)
  endLine: number; // 1-based, inclusive
  hash: string; // normalized-body hash (comments + whitespace removed), sha256 hex
}

export interface NoteOptions {
  author?: string;
  date?: string | Date;
}

/** A note as written on disk. file is repo-relative ('.mole/notes/<slug>.md'). */
export interface Note {
  file: string;
  symbol: string;
  path: string;
  kind: string;
  hash: string;
  author: string;
  written: string;
  text: string;
}

export type NoteStatus = 'fresh' | 'stale' | 'moved' | 'orphaned' | 'invalid';

/** One line of `mole memory`: every note file appears exactly once, malformed ones as status 'invalid'. */
export interface MemoryEntry {
  file: string; // repo-relative note file
  status: NoteStatus;
  symbol?: string;
  path?: string; // path the note was written against
  newPath?: string; // where the symbol is now, when moved (or stale at a new path)
  line?: number; // current 1-based start line of the symbol, or the bad line for 'invalid'
  changed?: boolean; // the symbol's normalized body differs from the note's hash
  text: string;
  author?: string;
  written?: string;
  problem?: string; // 'invalid' only: '<file>:<line>: <message>'
}

export { findSymbol, normalizedHash, relPath, sourceFiles, splitTarget, symbolsInFile, symbolsOfText } from './symbols.js';
export { addNote, memory, NOTES_DIR, parseNote } from './notes.js';
export { appendSeen, formatSince, readSeen, SEEN_LOG, since } from './seen.js';
export type { SeenEvent, SeenHow, SeenInput, SinceChange, SinceEntry, SinceFile, SinceResult } from './seen.js';
