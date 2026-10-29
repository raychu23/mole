// Split an answer into checkable claims: sentence/clause split + patterns. Deterministic, no model.
import type { ClaimCategory, ClaimSpan } from './types.js';

// sentence-level boundaries: newlines (real and JSON-escaped), sentence ends, ';', table and '·' separators, JSON key starts
const SENTENCE = /\\n|\n|(?<=[.!?])\s+(?=[A-Z0-9`*"'(\[_-])|;\s+|\s\|\s|\s·\s|,(?=")|\{(?=")/g;
// clause-level boundaries inside a sentence
const CLAUSE = /,\s+and\s+|,\s+but\s+|,\s+so\s+|,\s+then\s+|\s+and\s+(?=(?:I|we|then|also|the|all|every|its?|my|our)\b)|\s+[—–]\s+|,\s+(?!\d)/g;

export const CATEGORY_ORDER: ClaimCategory[] = ['exit', 'push', 'merge', 'commit', 'test', 'fix', 'file'];

const EXIT = /\bexit(?:ed|s)?(?:\s+(?:with\s+)?code)?"?\s*[:=]?\s*-?\d+\b/i;
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
  /\b(?:not|never|no longer|nothing|none|neither|nor|until|unless|if|whether|will|won't|would|could|should|might|may|cannot|can't|isn't|aren't|wasn't|weren't|hasn't|haven't|didn't|doesn't|don't|i'll|we'll|it'll|going to|next|later|once|pending|waiting|todo|plan(?:ned)?|propos\w*)\b/i;
// 'they' / 'user' alone are not attribution ('They all pass now.', 'the user-facing tests pass'); 'they found …' is
const OTHERS = /\b(?:reviewers?|review found|the review|subagents?|sub-agent|builder|they|he|she)\b|\buser\b(?![-\w])/i;
// a description of how things were or behave, not something done in the run ('notes were being passed into the command')
const DESCRIBES = /\b(?:was|were) being\b|\bused to\b/i;
// a metric value or score ('M2 is 5/5 on the test cases', 'kept the full score (18/18)', 'recall 9/10') is not a test count
const METRIC = /\bM\d+\b|\btargets?\b|\bscor(?:e|ed|es|ing)\b|\brecall\b|\bprecision\b|\baccuracy\b|\bfalse flags?\b/i;
// 'They all pass now.', 'they're now fixed': a result whose subject stands for the tests/bugs just named (other 'they'
// clauses are someone else's word or a description: 'They fail on method calls')
const PRONOUN_PASS = /^(?:they|these|those|all|both|everything)(?:'re|\s+are)?\s+(?:(?:all|now|still)\s+)*(?:pass(?:es|ed)?|fixed)\b/i;
const FIRST_PERSON = /\b(?:I|we)\b/;
// present-tense file verbs describe what a tool does ('`brain export` writes items.jsonl') unless 'now' or 'I' makes them a change
const FILE_PRESENT = /\b(?:writes|deletes)\b/i;
// bullets introduced by someone else's findings or a list of bugs/issues describe those, not the agent's own results
const LIST_INTRO =
  /(?:\b(?:reviewers?|review|subagents?|it|they)\b[^\n]*\b(?:found|confirmed|flagged|checked|verified|reported|noted)\b[^\n]*|\b(?:bugs?|issues?|problems?|findings?)\b[^\n:]*):\s*$/i;
const BULLET = /^\s*(?:[-*•]|\d+[.)])\s+/;
// review-2 P1-1 (d): what a tool or a thing does / is, not what the run did: a present-tense description verb with a
// non-first-person subject ('`mole flows` lists the tests …', 'the hook prints …'), unless 'now' makes it a change
const DESCRIBE_VERB = /\b(?:lists|prints|shows|returns|reports|emits|outputs|gives|names|marks|reads|asks|counts|finds|flags|exits|means|matches)\b/i;
// a time clause's verb is not the claim's verb ('Before going green I changed …', 'after rebasing')
const TIME_CLAUSE = /\b(?:before|after|while|until|when)\s+\w+ing\b[^,;]*/gi;
// counts used as adjectives inside a list of contents ('contains the bench, the key and 3 failing test files')
const CONTAINS = /\b(?:contains?|includes?|holds?|has|have|had|adds?|with)\b/i;
const ATTR_COUNT = /\b\d+ (?:failing|passing|failed|passed|new|red) (?:tests?|test files?|test cases?)\b/gi;
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

/** an exit statement that reports a run, not behaviour: 'exits 1' needs I/we, 'exited 1 when/if …' is a description */
function exitClaim(clause: string): boolean {
  const m = EXIT.exec(clause);
  if (!m) return false;
  if (/^exits\b/i.test(m[0]) && !FIRST_PERSON.test(clause)) return false;
  // 'the logged exit-0 run', 'an exit 2 case': exit used as an adjective
  if (/^exit-?\s*-?\d+$/i.test(m[0].replace(/\s+/g, ' ')) && /^[-\s]*(?:runs?|lines?|cases?|paths?|codes?|status|results?)\b/i.test(clause.slice(m.index + m[0].length))) return false;
  if (/^exit-\d/i.test(m[0])) return false;
  // '<paths> are syntax errors with exit 2': a property of something, not a run's result
  if (/\bwith\s+$/i.test(clause.slice(0, m.index)) && /\b(?:is|are|was|were|be)\b/i.test(clause.slice(0, m.index)) && !FIRST_PERSON.test(clause)) return false;
  return !/^\s*(?:when|whenever|if|unless|on (?:a|an|any|every)\b)/i.test(clause.slice(m.index + m[0].length));
}

export function categoriesOf(clause0: string, lead = ''): ClaimCategory[] {
  const out = new Set<ClaimCategory>();
  let clause = clause0.replace(TIME_CLAUSE, ' ');
  if (CONTAINS.test(lead + clause)) clause = clause.replace(ATTR_COUNT, ' ');
  if (exitClaim(clause)) out.add('exit');
  if (PUSH.test(clause)) out.add('push');
  if (MERGE.test(clause)) out.add('merge');
  if (shasIn(clause).length || COMMIT_WORD.test(clause)) out.add('commit');
  const count = COUNT.test(clause);
  const metric = count && METRIC.test(clause);
  const countClaim = count && !metric && (TEST_VERB.test(clause) || /\b\d[\d,]* tests?\b|\btests?\)/i.test(clause));
  const pronounPass = PRONOUN_PASS.test(clause) && /\bpass/i.test(clause);
  if (countClaim || (!metric && TEST_NOUN.test(clause) && TEST_VERB.test(clause)) || SAME.test(clause) || pronounPass) out.add('test');
  if (FIX.test(clause)) out.add('fix');
  const prose = clause.replace(/`[^`]*`|\[[^\]]*\]\([^)]*\)|\S*[/.]\S*/g, ' ');
  const fileVerb = FILE_VERB.test(prose.replace(FILE_PRESENT, ' ')) || (FILE_PRESENT.test(prose) && (/\bnow\b/i.test(prose) || FIRST_PERSON.test(prose)));
  if ((fileVerb && pathsIn(clause).length) || KNOWN_PLACES.some(([re]) => re.test(clause))) out.add('file');
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

/** spans that quote rather than state: fenced code blocks and the value of a "metrics" object (a quoted runs.jsonl line) */
function quotedSpans(text: string): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const m of text.matchAll(/```[\s\S]*?(?:```|$)/g)) out.push([m.index!, m.index! + m[0].length]);
  for (const m of text.matchAll(/\\*"metrics\\*"\s*:\s*\{/g)) {
    let depth = 0;
    let i = m.index! + m[0].length - 1;
    for (; i < text.length; i++) {
      if (text[i] === '{') depth++;
      else if (text[i] === '}' && --depth === 0) break;
    }
    out.push([m.index!, i + 1]);
  }
  return out;
}
/** line spans of bullets under an intro that reports someone else's findings or lists bugs ('It also confirmed:') */
function attributedLists(text: string): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let at = 0;
  let intro = '';
  for (const line of text.split('\n')) {
    const end = at + line.length;
    if (BULLET.test(line)) {
      if (LIST_INTRO.test(intro) && !/\b(?:I|we|my|our)\b/.test(line)) out.push([at, end]);
    } else if (line.trim()) intro = line;
    at = end + 1;
  }
  return out;
}

/** every checkable clause, in text order */
export function clauses(text: string): Clause[] {
  const out: Clause[] = [];
  const skip = [...quotedSpans(text), ...attributedLists(text)];
  const skipped = (i: number): boolean => skip.some(([a, b]) => i >= a && i < b);
  for (const sp of cut(text, 0, text.length, SENTENCE)) {
    const s = trim(text, sp);
    if (s.end - s.start < 4) continue;
    const sentence = text.slice(s.start, s.end);
    const question = /\?\s*$/.test(text.slice(sp.start, sp.end).trim());
    let conditional = false; // after 'if …,' the rest of the sentence states the condition's effect, not a result
    for (const cp of cut(text, s.start, s.end, CLAUSE)) {
      const c = trim(text, cp);
      const t = text.slice(c.start, c.end);
      const afterIf = conditional && !FIRST_PERSON.test(t);
      if (/\b(?:if|unless|whenever)\b/i.test(t)) conditional = true;
      if (t.length < 4 || question || afterIf || skipped(c.start)) continue;
      if (NOT_DONE.test(t) || (OTHERS.test(t) && !PRONOUN_PASS.test(t)) || LEDGER.test(t) || DESCRIBES.test(t)) continue;
      if (DESCRIBE_VERB.test(t.replace(/`[^`]*`/g, ' ')) && !FIRST_PERSON.test(t) && !/\bnow\b/i.test(t) && !PRONOUN_PASS.test(t) && !SAME.test(t)) continue;
      const cats = categoriesOf(t, text.slice(s.start, c.start));
      if (!cats.length) continue;
      out.push({ text: t, start: c.start, end: c.end, category: cats[0]!, categories: cats, sentence });
    }
  }
  return out;
}

export function split(text: string): ClaimSpan[] {
  return clauses(text).map(({ text: t, start, end, category }) => ({ text: t, start, end, category }));
}
