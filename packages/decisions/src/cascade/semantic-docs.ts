// T65: the T53 semantic-routing corpus for a repo's decision records -- the same docs the measured runs built
// (metrics-proof/m2-conflict/v3/run/run_t53_semantic_route_v3.mjs:43-51): every decision that is not superseded /
// deprecated / rejected / retired, as { id, title, one-line summary, BM25 index text } from its own record text.
import { execFileSync } from 'node:child_process';
import { indexTextOf, oneLineSummaryOf } from '../route/index-text.js';
import { extractMentionedPaths, extractMentionedIdentifiers, dropCommonMentions } from '../route/mentions.js';
import type { DecisionGraph } from '../types.js';
import { decisionTextFromRecords } from './cascade.js';

const INACTIVE = new Set(['superseded', 'deprecated', 'rejected', 'retired']);

/** T118 step B: the real repo file list for `semanticRouteDocs`'s mention-path extraction, via `git ls-files`
 *  (same git-shells-out posture as cascade.ts's own gitDiffFor -- no extra dependency). Returns [] (never
 *  throws) when `root` is not a git repo at all (e.g. a synthetic records-only test fixture) -- mentionPaths
 *  extraction degrades to identifier-only, same "absent field" posture as scopeGlobs having nothing to report. */
export function listRepoFiles(root: string): string[] {
  try {
    return execFileSync('git', ['-C', root, 'ls-files'], { encoding: 'utf8', maxBuffer: 1024 * 1024 * 16 })
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

/** T118 step B: `repoFiles`, when given (e.g. from `listRepoFiles` in worktree.ts, a `git ls-files` call), feeds
 *  extractMentionedPaths so a decision's TEXT-named paths ("Key files" lists, prose references) resolve against
 *  the REAL repo file list -- never a guess. Omit (or pass []) to skip path-mention extraction entirely (e.g.
 *  a synthetic records-only corpus with no real git repo backing it, same posture as scopeGlobs being absent).
 *  Identifier-mention extraction (extractMentionedIdentifiers) needs no repo file list and always runs. */
export function semanticRouteDocs(
  recordsRoot: string,
  graph: DecisionGraph,
  repoFiles: string[] = [],
): Array<{ id: string; title: string; summary: string; text: string; scopeGlobs?: string[]; mentionPaths?: string[]; mentionIdentifiers?: string[] }> {
  const textOf = decisionTextFromRecords(recordsRoot, graph.nodes);
  const repoFileSet = new Set(repoFiles);
  const nodes = graph.nodes.filter((n) => n.kind === 'decision' && !INACTIVE.has(n.status));

  // T118 step B self-review: raw per-decision mentions are collected FIRST, then a corpus-wide pass
  // (dropCommonMentions) drops anything that shows up in too many of this repo's OWN decisions (a project name
  // like `OpenClaw`, named in nearly every ADR, is exactly this -- it is not a discriminating signal for any
  // ONE decision, same as BM25's own IDF down-weighting of a near-universal term; without this pass it actively
  // hurt recall on a real v4.1 dev case, see mentions.ts's dropCommonMentions doc).
  const rawPaths: Array<{ id: string; mentions: string[] }> = [];
  const rawIdentifiers: Array<{ id: string; mentions: string[] }> = [];
  const textById = new Map<string, string>();
  const scopeGlobsById = new Map<string, string[]>();
  for (const n of nodes) {
    const text = textOf(n.id) ?? n.title;
    textById.set(n.id, text);
    const scopeGlobs = n.scope?.map((a) => a.target).filter(Boolean);
    if (scopeGlobs?.length) scopeGlobsById.set(n.id, scopeGlobs);
    rawPaths.push({ id: n.id, mentions: repoFileSet.size ? extractMentionedPaths(text, repoFileSet) : [] });
    rawIdentifiers.push({ id: n.id, mentions: extractMentionedIdentifiers(text) });
  }
  const filteredPaths = dropCommonMentions(rawPaths);
  const filteredIdentifiers = dropCommonMentions(rawIdentifiers);

  const docs: Array<{ id: string; title: string; summary: string; text: string; scopeGlobs?: string[]; mentionPaths?: string[]; mentionIdentifiers?: string[] }> = [];
  for (const n of nodes) {
    const text = textById.get(n.id)!;
    const mentionPaths = filteredPaths.get(n.id) ?? [];
    const mentionIdentifiers = filteredIdentifiers.get(n.id) ?? [];
    docs.push({
      id: n.id,
      title: n.title,
      summary: oneLineSummaryOf(n.title, text),
      text: indexTextOf(n.title, text),
      ...(scopeGlobsById.has(n.id) ? { scopeGlobs: scopeGlobsById.get(n.id)! } : {}),
      ...(mentionPaths.length ? { mentionPaths } : {}),
      ...(mentionIdentifiers.length ? { mentionIdentifiers } : {}),
    });
  }
  return docs;
}
