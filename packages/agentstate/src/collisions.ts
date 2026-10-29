// T21 parallel-agent collisions: types + entry points. RED-COMMIT STUB: the API shape only, no implementation yet.
import type { Harness, Skipped, Sources } from './types.js';

export interface CollisionsOptions extends Sources {
  /** repo root: runs in it or its git worktrees */
  root: string;
  /** only these run ids (exact); default every in-scope run */
  runs?: string[];
  /** only pairs that include this run id (or unique prefix): what a hook asks for its own session */
  run?: string;
  /** only runs with a complete step at or after this time (ms since epoch); default now - 24 h; 0 = all */
  since?: number;
  /** N: two runs are parallel when their windows come within N minutes (default 15) */
  windowMinutes?: number;
  /** max calls edges on a directed chain between the two runs' functions (default 2) */
  hops?: number;
  /** use this call graph (edges 'path#A.b' -> 'path#C') instead of indexing the checkouts (tests) */
  graph?: { edges: Array<[string, string]> };
}

export interface CollisionRun {
  id: string;
  harness: Harness;
  title: string | null;
  parent: string | null;
  first: string; // ISO, first complete step
  last: string; // ISO, last complete step
}

/** one function a run edited or read, with the step that did it */
export interface CollisionTouch {
  run: string;
  symbol: string; // repo-relative path#Qualified.name
  how: 'edit' | 'read';
  time: string;
  step: string;
}

/** one side of a pair: the run, its harness and window */
export interface CollisionSide {
  run: string;
  harness: Harness;
  title: string | null;
  first: string;
  last: string;
}

export interface Collision {
  a: CollisionSide;
  b: CollisionSide;
  /** functions both runs touched (at least one of them edited it) */
  shared: string[];
  /** shortest directed call chain between the two runs' functions, one 'from -> to' per edge (empty when shared) */
  path: string[];
  /** which run changed / read what, newest first */
  changes: CollisionTouch[];
  /** newest evidence time (pairs are sorted newest first) */
  time: string;
}

export interface NoteCollision {
  run: string;
  harness: Harness;
  symbol: string;
  note: string; // repo-relative .mole/notes/<slug>.md
  time: string;
  step: string;
}

export interface CollisionsResult {
  windowMinutes: number;
  hops: number;
  runs: CollisionRun[];
  pairs: Collision[];
  notes: NoteCollision[];
  skipped: Skipped[];
}

export function collisions(_opts: CollisionsOptions): CollisionsResult {
  throw new Error('collisions: not implemented yet (T21 red commit)');
}

export function formatCollisions(_r: CollisionsResult): string {
  throw new Error('formatCollisions: not implemented yet (T21 red commit)');
}
