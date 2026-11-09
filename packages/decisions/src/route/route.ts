// T53: routeDecisions -- stage 1 (BM25, zero-LLM, zero network) narrows every candidate decision to its top-k
// lexical matches against the change text; stage 2 (ONE listwise LLM call, candidate SUMMARIES only -- never
// full decision text, that is the RAG arm's cost) runs ONLY when stage 1 is not confidently ahead. Shape from
// prior-art.md: aurelio-labs/semantic-router's cheap-then-slow fallthrough (`Chain`), RankGPT's listwise-pick
// mechanic (numbered candidate list, ask for a selection back), Agentless's narrow-before-decide localization.
import { Bm25Index } from './bm25.js';
import picomatch from 'picomatch';
import type { RouteCandidate, RouteDoc, RouteOptions, RouteResult } from './types.js';

const DEFAULT_TOP_K = 5;
const DEFAULT_CONFIDENCE_RATIO = 0.75; // tuned on M2 v2 dev -- see t53-results.md
const RRF_K = 60; // T118: standard Cormack et al. (2009) RRF smoothing constant, prior-art.md

/** T118: literal (non-wildcard) path-segment count of a glob's prefix, e.g. 'pkg/apperrors/**' -> 2,
 *  'pkg/**' -> 1, '**\/*.ts' -> 0. Used as a specificity floor: a catch-all single-segment glob like 'pkg/**'
 *  or 'cmd/**' matches almost everything under a top-level dir and must never win the boost on its own (found
 *  in self-review: easi-app's 0003 scope includes bare `pkg/**`/`cmd/**`, which falsely routed 16/22 dev 'none'
 *  cases to it when counted the same as a real, narrow match -- see test 'a catch-all single-segment scope
 *  glob ... never wins the boost'). Same posture as Cursor rules prior art: scope a rule to the folders it
 *  actually guards, not a whole top-level tree. */
function literalPrefixDepth(glob: string): number {
  const firstWildcard = glob.search(/[*?[{]/);
  const prefix = firstWildcard === -1 ? glob : glob.slice(0, firstWildcard);
  return prefix.split('/').filter(Boolean).length;
}
const MIN_SCOPE_SPECIFICITY = 2;

/** T118: does any of a decision's scope globs match any changed file path, counting ONLY globs that pass the
 *  specificity floor (literalPrefixDepth >= MIN_SCOPE_SPECIFICITY)? picomatch (already a direct dependency
 *  since T117), same glob semantics prCheck's own scope-anchor matching uses -- never a second, possibly-
 *  inconsistent glob engine. */
function scopeMatchCount(scopeGlobs: string[] | undefined, changedFiles: string[]): number {
  if (!scopeGlobs?.length || !changedFiles.length) return 0;
  let n = 0;
  for (const glob of scopeGlobs) {
    if (literalPrefixDepth(glob) < MIN_SCOPE_SPECIFICITY) continue;
    const re = picomatch.makeRe(glob, { dot: true });
    for (const f of changedFiles) if (re.test(f)) n++;
  }
  return n;
}

/** T118: fuses the plain BM25 order with a scope-glob-match order via Reciprocal Rank Fusion (RRF). Candidates
 *  with zero scope matches get rank = bm25Candidates.length + 1 for signal (b) (last place, never excluded --
 *  they still carry their full signal-(a) contribution, so a decision with no scope is never penalized below
 *  where plain BM25 alone would have put it; T49's recall-ceiling rule). */
function applyScopeBoost(bm25Candidates: RouteCandidate[], docs: Map<string, RouteDoc>, changedFiles: string[]): RouteCandidate[] {
  const matchCounts = bm25Candidates.map((c) => scopeMatchCount(docs.get(c.id)?.scopeGlobs, changedFiles));
  const scopeOrder = bm25Candidates
    .map((c, i) => ({ id: c.id, matches: matchCounts[i]! }))
    .sort((a, b) => b.matches - a.matches); // ties keep bm25 order (stable sort) when both are 0
  const scopeRank = new Map<string, number>();
  scopeOrder.forEach((c, i) => scopeRank.set(c.id, c.matches > 0 ? i + 1 : bm25Candidates.length + 1));

  const fused = bm25Candidates.map((c, i) => {
    const bm25Rank = i + 1;
    const rrf = 1 / (RRF_K + bm25Rank) + 1 / (RRF_K + scopeRank.get(c.id)!);
    return { ...c, _rrf: rrf };
  });
  fused.sort((a, b) => b._rrf - a._rrf);
  return fused.map(({ _rrf, ...c }) => c);
}

const LISTWISE_PROMPT = (changeSummary: string, candidates: Array<{ id: string; title: string; summary: string }>): string =>
  [
    'A code change needs to be checked against team architecture decisions. Below is a short summary of the',
    'change, and a numbered list of CANDIDATE decisions (title + one-line summary only, not their full text).',
    '',
    '--- THE CHANGE (summary) ---',
    changeSummary,
    '',
    '--- CANDIDATE DECISIONS ---',
    ...candidates.map((c, i) => `[${i + 1}] ${c.id}: ${c.title} -- ${c.summary}`),
    '',
    'Which of these candidates does the change actually touch/govern? A change can govern zero, one, or several.',
    'Answer with exactly one line: PICK: <comma-separated candidate numbers, or NONE>',
  ].join('\n');

/** An unparsable response never silently drops everything -- same "never silently drop" contract as the cascade's
 *  escalation parsing (cascade.ts parseVerdict/parseMultiVerdicts): falls back to BM25's own top candidate. */
function parsePick(resp: string, candidates: RouteCandidate[]): RouteCandidate[] {
  const m = /PICK:\s*(.+)/i.exec(resp);
  if (!m) return candidates.length ? [candidates[0]!] : [];
  const body = m[1]!.trim();
  if (/^none\b/i.test(body)) return [];
  const idxs = [...new Set(body.split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => Number.isFinite(n)))];
  const picked = idxs.map((i) => candidates[i - 1]).filter((c): c is RouteCandidate => !!c);
  return picked.length ? picked : candidates.length ? [candidates[0]!] : [];
}

export async function routeDecisions(opts: RouteOptions): Promise<RouteResult> {
  const t0 = performance.now();
  const topK = opts.topK ?? DEFAULT_TOP_K;
  const minScore = opts.minScore ?? 0;
  const confidenceRatio = opts.confidenceRatio ?? DEFAULT_CONFIDENCE_RATIO;

  const idx = new Bm25Index();
  for (const d of opts.decisions) idx.add(d.id, d.text);
  const byId = new Map<string, RouteDoc>(opts.decisions.map((d) => [d.id, d]));
  const scored = idx.score(opts.changeText).filter((h) => h.score > minScore);
  let bm25Candidates: RouteCandidate[] = scored.map((h) => ({ id: h.id, title: byId.get(h.id)?.title ?? h.id, bm25Score: h.score }));

  if (opts.scopeBoost && opts.changedFiles?.length && bm25Candidates.length > 1) {
    bm25Candidates = applyScopeBoost(bm25Candidates, byId, opts.changedFiles);
  }

  if (bm25Candidates.length === 0) {
    return { routed: [], bm25Candidates: [], tier: 'bm25', confidence: 1, ms: Math.round(performance.now() - t0) };
  }

  const top = bm25Candidates.slice(0, topK);
  const top1 = top[0]!.bm25Score;
  const top2 = top[1]?.bm25Score ?? 0;
  const confidence = top1 + top2 > 0 ? top1 / (top1 + top2) : 1;

  if (confidence >= confidenceRatio || !opts.llm) {
    return { routed: [top[0]!], bm25Candidates, tier: 'bm25', confidence, ms: Math.round(performance.now() - t0) };
  }

  // stage 2: one listwise LLM call, candidate SUMMARIES only (never full index text)
  const prompt = LISTWISE_PROMPT(
    opts.changeText.slice(0, 2000),
    top.map((c) => ({ id: c.id, title: c.title, summary: byId.get(c.id)?.summary ?? c.title })),
  );
  const { text: resp, usage } = await opts.llm.complete(prompt);
  const routed = parsePick(resp, top);
  return { routed, bm25Candidates, tier: 'bm25+llm', confidence, usage, ms: Math.round(performance.now() - t0) };
}
