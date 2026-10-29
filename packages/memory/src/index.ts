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

const notImplemented = (): never => {
  throw new Error('not implemented');
};

/** sha256 hex of the text's tokens with comments and whitespace removed (string contents kept). */
export function normalizedHash(_text: string): string {
  return notImplemented();
}

/** Top-level functions (incl. const arrow functions), classes and class methods/constructors of a file. */
export function symbolsInFile(_root: string, _relPath: string): CodeSymbol[] {
  return notImplemented();
}

/** Resolve 'path#Tail' to a symbol, or undefined. */
export function findSymbol(_root: string, _target: string): CodeSymbol | undefined {
  return notImplemented();
}

/** Write .mole/notes/<slug>.md for the target symbol; throws if the symbol does not exist. */
export function addNote(_root: string, _target: string, _text: string, _opts?: NoteOptions): Note {
  return notImplemented();
}

/** Every note under .mole/notes with its status against the current tree. Never throws on a bad note. */
export function memory(_root: string): MemoryEntry[] {
  return notImplemented();
}

/** Parse one note file's text; a malformed note yields { problem: { line, message } }. */
export function parseNote(_content: string, _file: string): { note?: Note; problem?: { line: number; message: string } } {
  return notImplemented();
}
