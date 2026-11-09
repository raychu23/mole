// T120: tests-first (RED before implementation) for two new opt-in signals added to routeDecisions,
// same posture as T118's scopeBoost/mentionBoost (RRF-fused, never excludes/penalizes a candidate
// with no signal below its plain-BM25 rank -- the T49 recall-ceiling rule holds for these signals too).
//
// Motivation (B2 v4.3, see 4 log/prior-art.md): on real ADR corpora the true decision is often
// lexically dissimilar from the diff that violates/respects it (an architectural-pattern ADR vs. a
// diff that never repeats the ADR's own vocabulary) -- BM25 alone then never puts it in the top-k,
// and no listwise LLM rerank of a wrong shortlist can recover it (Rank-without-GPT, ECIR 2025:
// reranking cannot fix a shortlist that already lacks the right candidate).
//
// 1. embedBoost: an injected cosine-similarity signal over precomputed embeddings (no model/network
//    call inside this package -- same injection posture as `llm?: LlmClient`).
// 2. governsSummary: an optional capture-time field folded into the BM25 index text (doc2query-style
//    expansion) when `useGovernsSummary` is set.
import { describe, expect, it } from 'vitest';
import { routeDecisions } from '../src/route/route.js';
import type { RouteDoc } from '../src/route/types.js';

// Three decisions whose PROSE shares almost no tokens with the diffs that actually violate them --
// the exact real-ADR failure shape (an architectural-pattern decision described in its own register,
// not in the vocabulary a diff would use). BM25 alone cannot route these; cosine similarity over a
// semantic embedding (simulated here by hand-built vectors -- no model call in a unit test) can.
const DOC_SINGLETON: RouteDoc = {
  id: 'adr-singleton',
  title: 'Avoid the Singleton Pattern for Service Clients',
  summary: 'Service clients must be constructed via dependency injection, never a module-level singleton.',
  text: 'avoid singleton pattern service clients dependency injection module level instance',
  embedding: [1, 0, 0],
};
const DOC_CACHE: RouteDoc = {
  id: 'adr-cache',
  title: 'Cache Invalidation Strategy',
  summary: 'All caches must declare an explicit TTL; no cache may be invalidated only on process restart.',
  text: 'cache invalidation strategy ttl explicit process restart',
  embedding: [0, 1, 0],
};
const DOC_UNRELATED: RouteDoc = {
  id: 'adr-unrelated',
  title: 'Commit Message Format',
  summary: 'Commit messages must follow Conventional Commits.',
  text: 'commit message format conventional commits',
  embedding: [0, 0, 1],
};

// A diff that VIOLATES adr-singleton but never uses any of its words (shares zero lexical overlap
// with ANY of the three decisions -- BM25 alone returns nothing to route). Its embedding (hand-built,
// standing in for a real encoder's output) points the same direction as adr-singleton's.
// Deliberately zero lexical overlap with DOC_SINGLETON/DOC_CACHE/DOC_UNRELATED's `text` fields (every
// word checked against tokenize()'s stopword/camelCase rules) -- the real-ADR failure shape.
const DIFF_TEXT = 'export const db = new Pool(); // app boot grabs one shared connection for the whole program lifetime';
const DIFF_EMBEDDING = [0.98, 0.1, 0.05];

describe('routeDecisions: embedBoost (T120)', () => {
  it('with no embeddings/flag, a lexically-dissimilar true decision is still unrouted (documents the gap this fixes)', async () => {
    const r = await routeDecisions({ changeText: DIFF_TEXT, decisions: [DOC_SINGLETON, DOC_CACHE, DOC_UNRELATED] });
    expect(r.routed).toEqual([]);
    expect(r.bm25Candidates).toEqual([]); // zero BM25 score for every candidate -- the real-ADR routing miss
  });

  it('embedBoost off by default: passing embeddings without the flag changes nothing', async () => {
    const r = await routeDecisions({ changeText: DIFF_TEXT, decisions: [DOC_SINGLETON, DOC_CACHE, DOC_UNRELATED], changeEmbedding: DIFF_EMBEDDING });
    expect(r.routed).toEqual([]);
  });

  it('embedBoost on: a cosine-similar decision surfaces even with zero BM25 lexical overlap', async () => {
    const r = await routeDecisions({
      changeText: DIFF_TEXT,
      decisions: [DOC_SINGLETON, DOC_CACHE, DOC_UNRELATED],
      changeEmbedding: DIFF_EMBEDDING,
      embedBoost: true,
    });
    expect(r.tier).toBe('bm25');
    expect(r.routed.map((c) => c.id)).toEqual(['adr-singleton']);
  });

  it('embedBoost never excludes or ranks a zero-embedding-similarity candidate below its own BM25 rank (recall-ceiling rule)', async () => {
    // here BM25 DOES have signal: both decisions share the word "cache" with the change text.
    const changeText = 'cache the response but never set a ttl, restart clears it which is wrong per our cache policy';
    const withoutBoost = await routeDecisions({ changeText, decisions: [DOC_CACHE, DOC_SINGLETON] });
    const withBoost = await routeDecisions({
      changeText,
      decisions: [DOC_CACHE, DOC_SINGLETON],
      changeEmbedding: [0, 1, 0], // matches DOC_CACHE's embedding only
      embedBoost: true,
    });
    // DOC_SINGLETON has zero embedding similarity (orthogonal) and zero extra lexical help -- it must
    // not be promoted ahead of where plain BM25 already had it, and the BM25-strong winner is unchanged.
    expect(withBoost.routed.map((c) => c.id)).toEqual(withoutBoost.routed.map((c) => c.id));
  });

  it('a candidate with no embedding at all is never penalized below its BM25 rank (partial-coverage corpora)', async () => {
    const noEmbedDoc: RouteDoc = { ...DOC_CACHE, id: 'adr-cache-no-embed', embedding: undefined };
    const changeText = 'cache the response but never set a ttl';
    const r = await routeDecisions({
      changeText,
      decisions: [noEmbedDoc, DOC_UNRELATED],
      changeEmbedding: [0, 1, 0],
      embedBoost: true,
    });
    expect(r.routed.map((c) => c.id)).toEqual(['adr-cache-no-embed']); // still wins on BM25 alone
  });

  it('embedBoost is a no-op with no changeEmbedding (falls back to plain BM25 order, never throws)', async () => {
    const r = await routeDecisions({ changeText: DIFF_TEXT, decisions: [DOC_SINGLETON, DOC_CACHE], embedBoost: true });
    expect(r.routed).toEqual([]);
  });
});

describe('routeDecisions: useGovernsSummary doc-expansion (T120)', () => {
  const DOC_NO_SUMMARY: RouteDoc = {
    id: 'adr-queue',
    title: 'Outbox Pattern for Async Jobs',
    summary: 'Every side-effecting job must be enqueued via the outbox table, never fired inline.',
    text: 'outbox pattern async jobs enqueue side effect inline',
  };
  const DOC_WITH_SUMMARY: RouteDoc = {
    ...DOC_NO_SUMMARY,
    id: 'adr-queue-2',
    // doc2query-style: vocabulary a DIFF would actually use (handler/endpoint call-site terms), generated
    // once at capture time -- deliberately disjoint from DOC_NO_SUMMARY.text's own prose register.
    governsSummary: 'incoming http request handler notifications mail sender queueing task',
  };

  it('useGovernsSummary off by default: the field has no effect on BM25 scoring', async () => {
    const changeText = 'incoming http request handler for notifications directly calls mail sender instead of queueing the task';
    const r = await routeDecisions({ changeText, decisions: [DOC_NO_SUMMARY, DOC_WITH_SUMMARY] });
    expect(r.routed).toEqual([]); // neither decision's indexed `text` shares any token with changeText
  });

  it('useGovernsSummary on: a decision whose governsSummary shares vocabulary with the diff is now found', async () => {
    const changeText = 'incoming http request handler for notifications directly calls mail sender instead of queueing the task';
    const r = await routeDecisions({ changeText, decisions: [DOC_NO_SUMMARY, DOC_WITH_SUMMARY], useGovernsSummary: true });
    expect(r.routed.map((c) => c.id)).toEqual(['adr-queue-2']);
  });

  it('a decision with no governsSummary is unaffected (never penalized) when the flag is on', async () => {
    const changeText = 'outbox pattern async jobs enqueue side effect inline'; // matches DOC_NO_SUMMARY's own text
    const r = await routeDecisions({ changeText, decisions: [DOC_NO_SUMMARY, DOC_WITH_SUMMARY], useGovernsSummary: true });
    expect(r.routed.map((c) => c.id)).toEqual(['adr-queue']);
  });
});

describe('routeDecisions: embedBoost + useGovernsSummary combine with existing scopeBoost/mentionBoost (T120)', () => {
  it('all four RRF signals can be active at once without throwing or dropping a candidate', async () => {
    const r = await routeDecisions({
      changeText: DIFF_TEXT,
      decisions: [DOC_SINGLETON, DOC_CACHE, DOC_UNRELATED],
      changeEmbedding: DIFF_EMBEDDING,
      embedBoost: true,
      useGovernsSummary: true,
      scopeBoost: true,
      mentionBoost: true,
      changedFiles: ['src/db/pool.ts'],
    });
    expect(r.routed.map((c) => c.id)).toEqual(['adr-singleton']);
  });
});
