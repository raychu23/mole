# T120 prior art — routing recall on real ADR corpora

Problem (from B2 v4.3, dated 2026-11-08): T53's two-stage BM25-then-listwise-LLM router
(`packages/decisions/src/route/route.ts`) misses the governing decision for most routing
failures on real-world ADR corpora — semantic-kernel recall 0.375 [0.137, 0.694] (genuine
routing miss, confirmed independent of the id-matching bug fixed the same day), and 17/19 of
the pooled v4.2+v4.3 misses are routing failures (top-5 BM25 candidates never contain the true
decision), not a judge/verdict problem. Searched (recent first), >=3 independent queries, each
with >=1 fetched primary source, dated:

## 1. Dense vs. BM25 vs. hybrid (RRF) for document routing/retrieval

- **Strich et al., "From BM25 to Corrective RAG: Benchmarking Retrieval Strategies for
  Text-and-Table Documents," arXiv:2604.01733 (accepted EACL 2026; fetched 2026-11-08).**
  T2-RAGBench (23,088 queries / 7,318 financial docs). BM25 *beats* dense retrieval
  (text-embedding-3-large) on every metric except Recall@20 (R@5: BM25 0.644 vs dense 0.587) —
  domain-specific precise terms (identifiers, names) favor lexical match, same shape as our ADR
  ids/paths. Hybrid RRF (R@5 0.695) beats both single-method baselines at every k, with the
  **gap widening at small k** (exactly our regime: topK=5). Hybrid + a cross-encoder/LLM rerank
  on top is the strongest single result (R@5 0.816). Also: "Contextual Retrieval" (prepending an
  LLM-generated context summary to each doc at index time) improves dense +2.8pp and hybrid
  +2.2pp R@5 — direct prior art for the "governs summary written once at capture" idea in this
  task's brief.
  **Fits us:** yes — our router is already RRF-shaped (scopeBoost/mentionBoost, T118); adding a
  dense/embedding signal as one more RRF-fused rank is the smallest, best-evidenced next step,
  not a replacement of BM25.
- **Turnbull, D. (2025), "Hybrid Search: BM25, Vector & Reranking," summarized by Digital Applied
  (2026-01, fetched 2026-11-08), WANDS e-commerce benchmark.** BM25 and pure dense are
  *statistically indistinguishable* alone (NDCG 0.6983 vs 0.6953); basic RRF (no tuning) already
  wins at 0.7068; field-boosted hybrid reaches 0.7497. Confirms RRF is a safe, no-retune default —
  matches T118's existing RRF-fusion architecture (Cormack et al. 2009, k=60), so the new signal
  slots into the same `rrfFuse` with no risk to the recall-ceiling-preserving contract already
  tested for scopeBoost/mentionBoost.
- **r/Rag thread, "Hybrid search (BM25+vectors+RRF) barely improved..." (2025, fetched
  2026-11-08).** A real practitioner report that hybrid gains are *not universal*: on some corpora
  RRF barely moves the needle over BM25 alone. Caveat kept in this task's write-up: measure, don't
  assume, per repo.

## 2. Small local embedding models (bge-small / all-MiniLM / nomic-embed)

- **Nogueira/Nomic team, "Nomic Embed: Training a Reproducible Long Context Text Embedder,"
  arXiv:2402.01613 (TMLR 2025-02, fetched 2026-11-08).** nomic-embed-text-v1 (137M params)
  beats OpenAI ada-002 and text-embedding-3-small on MTEB; among open models it trails only
  BGE-base. Strong small-model option, but 137M + 8192-ctx is heavier than needed for
  short ADR titles/summaries.
- **Terhechte, B., "Benchmarking Local Embeddings" (2025-09-13, fetched 2026-11-08).**
  Practitioner benchmark for "does X appear in Y" (our exact shape: does this ADR's topic appear
  in this diff's change text) rather than full semantic nuance: **all-MiniLM models are
  "lightweight and surprisingly good at finding information and not finding not-existing
  information"**; bge-small captures less semantic nuance but is also good at
  contains/not-contains. Qwen-class models win only at large context, which we don't need (ADR
  index text is already clipped).
  **Decision:** all-MiniLM-L6-v2 (22M params, ~90MB quantized, already satisfiable from the
  machine's installed `sentence-transformers==5.1.2` + `transformers==4.57.3` — zero new install,
  stays inside the task's disk/no-paid-API budget) for the embedding signal; documented as
  injectable (no hard dependency from `packages/decisions` itself — see Fit below).

## 3. LLM reranking of top-k (listwise)

- **Sun et al., RankGPT (2023); surveyed in "How Good are LLM-based Rerankers?"
  arXiv:2508.16757 (2025-08, fetched 2026-11-08).** Listwise LLM reranking (numbered candidate
  list -> model returns a permutation/pick) is still the standard shape for LLM-in-the-loop
  reranking; RankGPT-gpt-4 leads but 7B distilled variants (RankZephyr, RankVicuna) get most of
  the way there.
- **Zhang et al., "Rank-without-GPT" (ECIR 2025, fetched 2026-11-08).** Open-source listwise
  rerankers reach 97% of GPT-4's effectiveness without any GPT dependency — but need
  purpose-built listwise training data; off-the-shelf general chat models (what T53 already uses,
  Haiku) are a weaker approximation of this, which matches why T53's *existing* stage-2 LLM call
  does not fully close the routing gap on its own (the candidate list it reranks already lacks the
  true decision in these misses — reranking a bad shortlist cannot recover it; the fix has to be
  upstream, in what makes the shortlist, not the listwise pick itself).
  **Fits us:** confirms route.ts's existing architecture choice (listwise-pick, RankGPT-shaped)
  is sound; the gap is PRECISELY that the shortlist (BM25 top-5) doesn't contain the right
  candidate for lexically-dissimilar real ADRs, which a lexical-only stage-1 cannot fix no matter
  how stage 2 reranks. This routes the fix to stage 1 (new dense/expansion signals before top-5 is
  cut), not to stage 2.

## 4. Document expansion (doc2query / "what code this governs" summaries)

- **Nogueira et al., Doc2Query (2019); Gospodinov et al., "Doc2Query--: When Less is More,"
  arXiv:2301.03266 (fetched 2026-11-08).** Appending model-generated queries/paraphrases to a
  document BEFORE indexing closes lexical vocabulary mismatch for first-stage (BM25) retrieval —
  up to 16% retrieval-effectiveness improvement when filtered for relevance, generated ONCE at
  index time (not per-query), which is exactly the "ADR governs-summary generated once at
  capture time" shape this task's brief asks to consider.
  **Fits us:** an ADR's prose rarely repeats the exact tokens of the code/diff it governs (that's
  the whole vocabulary-mismatch problem BM25 cannot solve). A short, once-generated "what code
  this governs" summary (file/module/pattern-level, written in the vocabulary a DIFF would use —
  not the ADR's own prose register) is a cheap, zero-per-query-cost doc2query-style expansion of
  the BM25 index text. This is this task's second concrete lever, alongside the embedding signal,
  and the two combine (Strich et al.'s "Contextual Retrieval" result: expansion AND a dense signal
  both help, non-redundantly).

## 5. How code-review / rule-selection agents pick which guideline applies

- **Cursor, "Rules" docs (cursor.com/docs/rules, 2025, fetched 2026-11-08).** Cursor's own rule
  router is exactly a two-signal scheme: path globs (`globs:`, exact-match, like our existing
  `scopeGlobs`/T118) PLUS a natural-language `description` the agent semantically matches against
  intent when no glob applies (`Apply Intelligently`). This is independent confirmation that our
  existing glob-based scope signal is right but insufficient alone — real tools add a semantic/
  NL-match fallback for exactly the case a path glob can't express, which is our semantic-kernel
  failure mode (an ADR about an architectural pattern, not a specific path).
- **rules-mcp (github.com/rules-mcp/rules-mcp, fetched 2026-11-08) and Cursor's own
  "Reviewing Code" product page (cursor.com/for/code-review, fetched 2026-11-08).** Same split in
  practice: `QueryRules(activeFiles, tags)` does path/tag matching first; natural-language
  "Check against standards" prompts fall back to full-text/semantic matching when no file-level
  rule applies. Also explicitly warns results are *guesses* when semantic ("the more specific your
  rules files, the more useful"), matching the existing house rule (ledger-task-workflow skill:
  "agent-facing text built from a heuristic match must say it's a guess").

## Decision taken

Two additive, opt-in-flagged signals into the existing RRF-fusion router, same contract as
T118's scopeBoost/mentionBoost (never excludes/penalizes a candidate below its BM25 rank; a
candidate with no embedding/no governs-summary just gets no boost — recall-ceiling-preserving):

1. `embedBoost` — an injected embedding signal (cosine similarity rank, RRF-fused), model-agnostic
   at the `packages/decisions` package boundary (no new runtime dependency — same posture as the
   existing `llm?: LlmClient` injection point). Measured offline with local
   `sentence-transformers` all-MiniLM-L6-v2 (already installed, 0 new install, $0 cost, no
   network/paid API — fits the "hermes -z --safe-mode only, no paid embedding APIs" budget).
2. `governsSummary` — an optional one-time, capture-time field folded into the BM25 index text
   (doc2query-style expansion), generated via `hermes -z --safe-mode` once per decision (not per
   query) — fits the "only hermes -z" budget and keeps route-time cost at $0 for the BM25-only
   tier, same economic story B2 already measured for the LLM stage-2 tier.

Both signals are measured together and separately in `4 log/recall-dev.md`.
