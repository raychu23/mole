// Options round of `mole pr-check` (T32): content anchors and the version-bump rule. Code only, no model, no network.
//  1. content anchors: a decision record may carry `match:` items {pattern: <JS regex>, in?: <glob>, why?: text}; the record
//     governs an ADDED line whose text matches a pattern in a file the glob covers. For codebase-wide conventions (named
//     exports, React.FC, msw, ...) that no path anchor can express.
//  2. version-bump rule: a hunk whose old and new lines differ only in version-like tokens (semver, ~> / ^ pins, sha refs,
//     numbers on a version/tag/ref line) is not governed by a scope anchor: architecture decisions are not about routine
//     dependency bumps unless they name the dependency (a content anchor matching the changed line or the hunk's
//     enclosing-block header still fires).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { frontMatter } from '../graph.js';
import type { GraphNode, Problem } from '../types.js';

/** review 1 P2-3: added lines longer than this are never tested against `match:` patterns (bounds regex work per line) */
export const MAX_MATCH_LINE = 2000;

const repeatAt = (p: string, i: number): boolean => {
  const c = p[i];
  if (c === '+' || c === '*') return true;
  if (c !== '{') return false;
  const m = /^\{(\d+)(,(\d*))?\}/.exec(p.slice(i));
  if (!m) return false;
  if (m[2] === undefined) return Number(m[1]) > 1;
  return m[3] === '' || Number(m[3]) > 1;
};

/** review 1 P2-3: true when a repeated group contains a repeat itself (`(a+)+`, `(?:x*y)*`, `(a{1,}){2,}`): the shape of
 *  catastrophic backtracking. A syntactic check (escapes and [classes] skipped), deliberately conservative. */
export function hasNestedQuantifier(pattern: string): boolean {
  const stack: boolean[] = [];
  let inClass = false;
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i]!;
    if (c === '\\') {
      i++;
      continue;
    }
    if (inClass) {
      if (c === ']') inClass = false;
      continue;
    }
    if (c === '[') {
      inClass = true;
      if (pattern[i + 1] === '^') i++;
      if (pattern[i + 1] === ']') i++;
      continue;
    }
    if (c === '(') {
      stack.push(false);
      continue;
    }
    if (c === ')') {
      const inner = stack.pop() ?? false;
      const rep = repeatAt(pattern, i + 1);
      if (inner && rep) return true;
      if ((inner || rep) && stack.length) stack[stack.length - 1] = true;
      continue;
    }
    if (repeatAt(pattern, i) && stack.length) stack[stack.length - 1] = true;
  }
  return false;
}

export interface ContentAnchor {
  pattern: string;
  re: RegExp;
  in?: string;
  inRe?: RegExp;
  why?: string;
  file: string;
  line: number;
}

/** gitignore-ish glob -> anchored RegExp: `**` any depth (incl. none), `*` and `?` within a segment, `{a,b}` alternatives */
export function globToRegExp(glob: string): RegExp {
  let out = '';
  const g = glob.replace(/^\.?\//, '');
  for (let i = 0; i < g.length; i++) {
    const c = g[i]!;
    if (c === '*') {
      if (g[i + 1] === '*') {
        const slash = g[i + 2] === '/';
        out += slash ? '(?:.*/)?' : '.*';
        i += slash ? 2 : 1;
      } else out += '[^/]*';
    } else if (c === '?') out += '[^/]';
    else if (c === '{') {
      const j = g.indexOf('}', i);
      if (j < 0) out += '\\{';
      else {
        out += `(?:${g.slice(i + 1, j).split(',').map((s) => s.replace(/[.+^$()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*')).join('|')})`;
        i = j;
      }
    } else out += c.replace(/[.+^$()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${out}$`);
}

/** the `match:` items of a record (read from its file under the records root). Invalid regexes and nested quantifiers are
 *  not applied; each is pushed to `problems` at the record's file:line when a sink is given (review 1 P2-3). */
export function contentAnchorsOf(recordsRoot: string, n: GraphNode, problems?: Problem[]): ContentAnchor[] {
  if (n.format !== 'mole') return [];
  let text: string;
  try {
    text = readFileSync(join(recordsRoot, n.file), 'utf8');
  } catch {
    return [];
  }
  const fm = frontMatter(text, n.file);
  if (!fm || 'error' in fm) return [];
  const out: ContentAnchor[] = [];
  for (const it of fm.fields.get('match')?.items ?? []) {
    const pattern = it.map ? it.map.pattern : it.value;
    if (!pattern) continue;
    let re: RegExp;
    try {
      re = new RegExp(pattern);
    } catch (e) {
      problems?.push({ file: n.file, line: it.line, message: `match: invalid regex ${JSON.stringify(pattern)} (${(e as Error).message}); this anchor is not applied` });
      continue;
    }
    if (hasNestedQuantifier(pattern)) {
      problems?.push({ file: n.file, line: it.line, message: `match: nested quantifier in ${JSON.stringify(pattern)} (catastrophic backtracking risk); this anchor is not applied` });
      continue;
    }
    const glob = it.map?.in || undefined;
    out.push({ pattern, re, in: glob, inRe: glob ? globToRegExp(glob) : undefined, why: it.map?.why, file: n.file, line: it.line });
  }
  return out;
}

const VERSION_TOKEN = /(?:~>\s*|[~^]|[<>]=?\s*)?\bv?\d+(?:\.\d+)+(?:[-+][0-9A-Za-z][0-9A-Za-z.-]*)?\b|\bv\d+\b|\b(?=[0-9a-f]*\d)(?=[0-9a-f]*[a-f])[0-9a-f]{7,40}\b/g;
const VERSION_KEY = /version|\btag\b|\bref\b|\brev\b|digest|\bsha\b/i;
const norm = (line: string) => {
  let s = line.replace(VERSION_TOKEN, '\u0000');
  if (VERSION_KEY.test(line)) s = s.replace(/\b\d+\b/g, '\u0000');
  return s.trim();
};

/** true when the hunk's old and new lines differ, pairwise, only in version-like tokens */
export function isVersionOnlyHunk(del: string[], add: string[]): boolean {
  if (!del.length || del.length !== add.length) return false;
  let differs = false;
  for (let i = 0; i < del.length; i++) {
    const o = del[i]!;
    const n = add[i]!;
    if (o === n) continue;
    if (norm(o) !== norm(n)) return false;
    differs = true;
  }
  return differs;
}

// Option 3 (options round 2, T32): title-term bump gate. A standard IR/VSM preprocessing step (tokenize + drop a fixed
// stopword list), applied to the record's OWN title (already in the frozen overlay, no new authored data) rather than to
// a codebase corpus. A version-only hunk (a dependency/provider bump) under a folder or file scope anchor is governed
// only when the hunk's enclosing-block context or added text literally names the record's own title vocabulary (e.g. a
// `helm_release` resource block for "Use Helm..."); a bump that names no part of the title (a routine provider-version
// line next to it in the same folder) is not. Distinct from option 2 (`versionBumpRule`, off by default), which drops
// every version-only hunk unconditionally and so also drops true bumps of the decided component (2 insights round 1).
/** a small, fixed, corpus-independent English stopword list (standard IR practice; not tuned to any record's title) */
const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'into', 'this', 'that', 'these', 'those', 'use', 'uses', 'using', 'used',
  'avoid', 'prefer', 'default', 'defaults', 'proper', 'non', 'policy', 'record', 'records', 'architecture', 'decision',
  'about', 'over', 'under', 'than', 'then', 'when', 'what', 'which', 'where', 'will', 'shall', 'should', 'would',
  'have', 'has', 'had', 'are', 'was', 'were', 'been', 'being', 'not', 'but', 'via', 'per', 'each', 'all', 'any',
  'some', 'such', 'only', 'instead', 'retire', 'restructure', 'maintain', 'give', 'expose', 'split', 'replace',
]);
/** title -> distinctive lowercase terms: tokens >=4 chars, not a stopword, deduped. Pure IR query-term extraction
 *  (no corpus IDF, no per-record curation): applies identically to every record's title. */
export function titleTermsOf(title: string): string[] {
  const toks = title.match(/[A-Za-z][A-Za-z0-9+.#-]{2,}/g) ?? [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of toks) {
    const lw = t.toLowerCase();
    if (lw.length < 4 || STOPWORDS.has(lw) || seen.has(lw)) continue;
    seen.add(lw);
    out.push(lw);
  }
  return out;
}
/** true when any of `terms` occurs (case-insensitive substring) in `text` */
export function hasTitleTerm(text: string, terms: string[]): boolean {
  if (!text) return false;
  const lw = text.toLowerCase();
  return terms.some((t) => lw.includes(t));
}
