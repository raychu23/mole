// Split an answer into checkable claims: sentence/clause split + patterns. Deterministic, no model.
import type { ClaimCategory, ClaimSpan } from './types.js';

// sentence-level boundaries: newlines (real and JSON-escaped), sentence ends, ';', table and '·' separators, JSON key starts
const SENTENCE = /\\n|\n|(?<=[.!?])\s+(?=[A-Z0-9`*"'(\[_-])|;\s+|\s\|\s|\s·\s|,(?=")|\{(?=")/g;
// clause-level boundaries inside a sentence
const CLAUSE = /,\s+and\s+|,\s+but\s+|,\s+so\s+|,\s+then\s+|\s+and\s+(?=(?:I|we|then|also|the|all|every|its?|my|our)\b)|\s+[—–]\s+|,\s+(?!\d)/g;

export const CATEGORY_ORDER: ClaimCategory[] = ['exit', 'push', 'merge', 'commit', 'test', 'fix', 'file'];

const EXIT = /\bexit(?:ed|s)?(?:\s+code)?"?\s*[:=]?\s*-?\d+\b/i;
// first person or passive ('I pushed', 'was pushed', 'pushed to origin'), not 'the command pushed the exit code out'
const PUSH = /\b(?:I|we)\b[^.;]*\bpushed\b|\bpushed to\b|\b(?:was|were|been|is|are|got)\s+pushed\b|^pushed\b/i;
const MERGE = /\b(?:merged|integrated)\b/i;
const COMMIT_WORD = /\b(?:committed|reverted|cherry-picked|amended)\b|\b\d+ lines? added\b/i;
export const COUNT = /\b\d[\d,]*\s*\/\s*\d[\d,]*\b|\b\d[\d,]* of \d[\d,]*\b|\b\d[\d,]* (?:tests?\s+)?(?:passed|passing|pass(?:es)?|failed|failing)\b|\(\d[\d,]* tests?\)|\bwith \d[\d,]* tests\b|\bRan \d+ tests?\b/i;
const TEST_NOUN = /\b(?:tests?|suite|checks?|builds?|selftests?|self-tests?|pytest|vitest|unittest|jest|tsc|lint|typecheck|npm (?:run \w[\w:-]*|test))\b/i;
const TEST_VERB = /\b(?:pass(?:es|ed|ing)?|green|succeed(?:s|ed)?|fail(?:s|ed|ing)?|ran|re-?ran|were run|was run|is clean|clean)\b/i;
const SAME = /\b(?:returns|gives|prints|produces|outputs) the same\b/i;
const FIX = /\b(?:fixed|fixes are in)\b/i;
const FILE_VERB = /\b(?:wrote|written|writes|updated|created|added|saved|logged|recorded|copied|edited|is in|are in|now in|lives in|stored|kept in|is at|written up|now deletes|deletes|report)\b/i;

// a plan, a negative, a condition, a question or someone else's word: not a claim of the agent's own done work
const NOT_DONE =
  /\b(?:not|never|no longer|nothing|none|neither|nor|without|until|unless|if|whether|will|won't|would|could|should|might|may|cannot|can't|isn't|aren't|wasn't|weren't|hasn't|haven't|didn't|doesn't|don't|i'll|we'll|it'll|going to|next|later|once|pending|waiting|todo|plan(?:ned)?|propos\w*)\b/i;
const OTHERS = /\b(?:reviewers?|review found|the review|subagents?|sub-agent|builder|they|he|she|user)\b/i;
const LEDGER = /\bledger\b/i;

const SHA = /(?<![\w#/.=-])`?([0-9a-f]{7,40})`?(?![\w/-])/g;
/** short shas named in the text: hex 7-40 with a letter, and a digit unless it is backticked or follows commit/as/sha */
export function shasIn(s: string): string[] {
  const out: string[] = [];
  for (const m of s.matchAll(SHA)) {
    const h = m[1]!;
    const ticked = m[0].startsWith('`');
    const before = s.slice(Math.max(0, m.index! - 14), m.index!);
    const context = ticked || /\b(?:commit|committed|as|sha|at|in)\s*["':]*\s*$/i.test(before);
    if (!/[a-f]/.test(h) && !context) continue; // all digits: a sha only where a sha is expected
    if (!/\d/.test(h) && !context) continue; // all letters (a word like 'deadbee'): same
    if (/https?:\/\/\S*$/.test(before)) continue;
    out.push(h);
  }
  return out;
}

const EXT = '(?:md|json|jsonl|ts|tsx|js|mjs|cjs|py|sh|txt|html|css|ya?ml|toml|vsix|sql|csv|R|Rmd)';
const PATH_IN = new RegExp(`[\\w.~@/ -]*[\\w-]\\.${EXT}\\b|(?:[\\w.~@-]+/)+[\\w.@-]+`, 'g');
const BARE = new RegExp(`(?<![\\w/])(?:~?/?[\\w.@-]+/)*[\\w@-][\\w.@-]*\\.${EXT}\\b|(?<![\\w])(?:~?/)?(?:[\\w.@-]+/)+[\\w.@-]+`, 'g');
/** well-known places agents install into, named in prose without a path */
export const KNOWN_PLACES: Array<[RegExp, string]> = [
  [/\bClaude Code'?s? (?:local )?plugins? (?:folder|dir(?:ectory)?)\b/i, '.claude/plugins'],
  [/\bClaude Code'?s? (?:local )?skills? (?:folder|dir(?:ectory)?)\b/i, '.claude/skills'],
  [/\bHermes'?s? skills? (?:folder|dir(?:ectory)?)\b/i, '.hermes/skills'],
];

/** file-like tokens a clause names: backticked, markdown links, parenthesised paths, bare paths */
export function pathsIn(s: string): string[] {
  const out = new Set<string>();
  const add = (t: string): void => {
    const v = decodeURIComponent(t.replace(/%(?![0-9A-Fa-f]{2})/g, '%25')).trim().replace(/^[<'"(]+|[>'"),:.;]+$/g, '');
    const ext = new RegExp(`\\.${EXT}$`).test(v);
    if (v.length >= 3 && !/^https?:/.test(v) && !/^\d+(?:\.\d+)*$/.test(v) && (ext || /^[~/]/.test(v) || /^\.[\w-]+\//.test(v))) out.add(v);
  };
  for (const m of s.matchAll(/`([^`]+)`/g)) for (const p of m[1]!.matchAll(PATH_IN)) add(p[0]);
  for (const m of s.matchAll(/\[([^\]]+)\]\(([^)\s]+)\)/g)) {
    add(m[2]!);
    for (const p of m[1]!.matchAll(PATH_IN)) add(p[0]);
  }
  for (const m of s.matchAll(/\(([^()`]+)\)/g)) for (const p of m[1]!.matchAll(PATH_IN)) if (p[0].includes('/')) add(p[0]);
  const plain = s.replace(/`[^`]*`|\[[^\]]*\]\([^)]*\)|\([^()]*\)|https?:\/\/\S+/g, ' ');
  for (const p of plain.matchAll(BARE)) add(p[0]);
  return [...out];
}

export function categoriesOf(clause: string): ClaimCategory[] {
  const out = new Set<ClaimCategory>();
  if (EXIT.test(clause)) out.add('exit');
  if (PUSH.test(clause)) out.add('push');
  if (MERGE.test(clause)) out.add('merge');
  if (shasIn(clause).length || COMMIT_WORD.test(clause)) out.add('commit');
  const count = COUNT.test(clause);
  if ((count && (TEST_NOUN.test(clause) || TEST_VERB.test(clause))) || (TEST_NOUN.test(clause) && TEST_VERB.test(clause)) || SAME.test(clause)) out.add('test');
  if (FIX.test(clause)) out.add('fix');
  const prose = clause.replace(/`[^`]*`|\[[^\]]*\]\([^)]*\)|\S*[/.]\S*/g, ' ');
  if ((FILE_VERB.test(prose) && pathsIn(clause).length) || KNOWN_PLACES.some(([re]) => re.test(clause))) out.add('file');
  return CATEGORY_ORDER.filter((c) => out.has(c));
}

interface Piece {
  start: number;
  end: number;
}
function cut(text: string, start: number, end: number, re: RegExp): Piece[] {
  const out: Piece[] = [];
  const s = text.slice(start, end);
  let at = 0;
  for (const m of s.matchAll(re)) {
    out.push({ start: start + at, end: start + m.index! });
    at = m.index! + m[0].length;
  }
  out.push({ start: start + at, end });
  return out;
}
/** trim whitespace, bullets, markdown emphasis, quotes and closing punctuation, keeping offsets */
function trim(text: string, p: Piece): Piece {
  let { start, end } = p;
  const lead = /^(?:\s+|[-*•>#]+\s+|\d+[.)]\s+|\*\*|__|["'{\[]+|\\")/;
  const tail = /(?:\s+|\*\*|__|[.,;:"'}\]]+|\\"|\\)$/;
  for (let guard = 0; guard < 20; guard++) {
    const s = text.slice(start, end);
    const m = lead.exec(s);
    if (!m || m[0].length === 0) break;
    start += m[0].length;
  }
  for (let guard = 0; guard < 20; guard++) {
    const s = text.slice(start, end);
    const m = tail.exec(s);
    if (!m || m[0].length === 0) break;
    end -= m[0].length;
  }
  return { start, end: Math.max(start, end) };
}

export interface Clause extends ClaimSpan {
  categories: ClaimCategory[];
  /** the sentence the clause sits in */
  sentence: string;
}

/** every checkable clause, in text order */
export function clauses(text: string): Clause[] {
  const out: Clause[] = [];
  for (const sp of cut(text, 0, text.length, SENTENCE)) {
    const s = trim(text, sp);
    if (s.end - s.start < 4) continue;
    const sentence = text.slice(s.start, s.end);
    const question = /\?\s*$/.test(text.slice(sp.start, sp.end).trim());
    for (const cp of cut(text, s.start, s.end, CLAUSE)) {
      const c = trim(text, cp);
      const t = text.slice(c.start, c.end);
      if (t.length < 4 || question) continue;
      if (NOT_DONE.test(t) || OTHERS.test(t) || LEDGER.test(t)) continue;
      const cats = categoriesOf(t);
      if (!cats.length) continue;
      out.push({ text: t, start: c.start, end: c.end, category: cats[0]!, categories: cats, sentence });
    }
  }
  return out;
}

export function split(text: string): ClaimSpan[] {
  return clauses(text).map(({ text: t, start, end, category }) => ({ text: t, start, end, category }));
}
