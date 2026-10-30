// @mole/oneonone: T31, the 1:1 loop + read-back (M23 code half). STUB for the checks-first commit (R1):
// types + file shape are real and frozen-compatible, but matching/read-back are intentionally
// not-yet-implemented so the bench and tests below are red before the implementation commit.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export interface Question {
  id: string;
  text: string;
  folder: string;
  loggedAt: string;
  source?: { file: string; line: number };
}

export interface OneOnOneRecord {
  id: string;
  file: string;
  folder: string;
  excerpt: string;
}

export interface Match {
  recordId: string;
  file: string;
  score: number;
}

export interface PrepItem {
  question: Question;
  match?: Match;
}

export interface FolderGroup {
  folder: string;
  items: PrepItem[];
}

export type ReadBackVerdict = 'confirmed' | 'rejected';

export interface ReadBackEntry {
  verdict: ReadBackVerdict;
  at: string;
  recordId?: string;
}

export type ReadBackStore = Record<string, Record<string, ReadBackEntry>>;

export const MATCH_THRESHOLD = 0.1;

export interface Matcher {
  records: OneOnOneRecord[];
}

export function tokenize(_text: string): string[] {
  throw new Error('not implemented');
}

export function buildMatcher(records: OneOnOneRecord[]): Matcher {
  return { records };
}

// STUB: never matches anything yet (R1 red state) -- the implementation commit replaces this with the
// real idf-weighted cosine + title-boost matcher.
export function matchQuestion(_m: Matcher, _question: Question, _threshold: number = MATCH_THRESHOLD): Match | undefined {
  return undefined;
}

export function prep(matcher: Matcher, questions: Question[], threshold: number = MATCH_THRESHOLD): FolderGroup[] {
  const byFolder = new Map<string, PrepItem[]>();
  for (const q of questions) {
    const items = byFolder.get(q.folder) ?? [];
    items.push({ question: q, match: matchQuestion(matcher, q, threshold) });
    byFolder.set(q.folder, items);
  }
  return [...byFolder.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([folder, items]) => ({ folder, items }));
}

function readStore(path: string): ReadBackStore {
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as ReadBackStore;
  } catch {
    return {};
  }
}

function writeStore(path: string, store: ReadBackStore): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(store, null, 1)}\n`, 'utf8');
}

export function defaultReadBackPath(repoRoot: string): string {
  return join(repoRoot, '.mole', 'local', 'oneonone', 'readback.json');
}

export function recordReadBack(path: string, folder: string, questionId: string, verdict: ReadBackVerdict, recordId: string | undefined, at: string = new Date().toISOString()): ReadBackStore {
  const store = readStore(path);
  store[folder] = store[folder] ?? {};
  store[folder]![questionId] = { verdict, at, recordId };
  writeStore(path, store);
  return store;
}

export function loadReadBack(path: string): ReadBackStore {
  return readStore(path);
}

export function folderReadBackCoverage(store: ReadBackStore, folder: string, questionIds: string[]): number {
  const entries = store[folder] ?? {};
  if (!questionIds.length) return 0;
  const answered = questionIds.filter((id) => entries[id] !== undefined).length;
  return answered / questionIds.length;
}
