# T53 prior art (checked 2026-11-02)

```notes
source                              what it does                                        what T53 takes / leaves
aurelio-labs/semantic-router         embeds an incoming query, compares against          leaves: needs an embedding model + vector index,
(github, MIT, v1.x main branch,      per-route example-utterance vectors in vector        a network call either way. T53 has no embeddings
checked 2026-11-02)                  space (or a small "decision model" call) to pick     budget on the zero-LLM tier (done-when 3 says
                                     a route in milliseconds; falls through to a          zero-LLM stage FIRST) -- BM25 is the zero-LLM,
                                     slower router only when unsure (`Chain`).            zero-network stand-in for "semantic but cheap".
                                     Confirms the fallthrough/cascade shape (cheap         takes: the two-tier "fast+cheap first, slow+sure
                                     stage first, LLM stage only when unsure) T53          only on low confidence" shape -- same as this
                                     copies for stage1(BM25)->stage2(listwise LLM).        task's stage1/stage2 split.

RouteLLM (Ong et al. 2024,           routes a QUERY to a strong vs. weak MODEL (not to    leaves: this is model selection for one answer,
arXiv:2406.18665, ICLR 2025)         a document/decision) using a trained preference      not retrieval of which of N reference docs a
                                     router; routing between two LLM tiers by predicted    query is ABOUT. Different problem shape (2-way
                                     query difficulty, >2x cost cut on MMLU/MT-Bench at    model choice vs. k-way decision choice).
                                     near-parity quality.                                  takes: the framing "a router is worth it only if
                                                                                            it is cheaper AND not much worse than always
                                                                                            paying for the expensive path" -- T53's done-when
                                                                                            4 (cost <= 30% of RAG, recall >= 0.90) is that
                                                                                            same trade quantified for THIS task.

RankGPT (Sun et al. 2023,            listwise LLM rerank of retrieved passages: give      leaves: RankGPT reranks ~10-20 passages' FULL
arXiv:2304.09542, "Is ChatGPT good   the LLM a numbered list of candidate passages in     text per window (sliding window over 100), paid
at search?")                        ONE prompt, ask for a permutation ("[2] > [3] >       once per query -- too expensive for "one call per
                                     ..."), sliding-window when candidates exceed the      PR check, every check". takes: the core mechanic
                                     context budget. State-of-the-art zero-shot listwise   (ONE call, numbered candidate list, ask for an
                                     LLM reranking, later work (PE-Rank arXiv:2406.14848,   ordered/selected subset back) -- T53's stage 2
                                     Rank-without-GPT arXiv:2312.02969) compresses the     sends only ONE-LINE summaries of the top-k BM25
                                     same idea to control cost/latency.                     candidates (not full decision text), closer to
                                                                                            PE-Rank's "compress the candidate, not the whole
                                                                                            call" fix than to RankGPT's original full-text cost.

Agentless (Xia et al. 2024,          SWE-bench fault localization WITHOUT an agent loop:   leaves: Agentless's file-level step uses an LLM
arXiv:2407.01489, github.com/        hierarchical localization -- file, then class/        over the repo's file skeleton (one call, cheap
openautocoder/agentless)             function, then edit line -- each step narrowing       relative to a full agent, still an LLM call on
                                     the candidate set before the (expensive) repair       the zero-LLM tier T53 wants to try first).
                                     step runs. Localization-before-repair, not            takes: the hierarchical narrow-then-decide shape --
                                     search-the-whole-repo-every-time.                      BM25 narrows (all N decisions -> top-k candidates)
                                                                                            before the costlier stage (LLM pick) ever runs,
                                                                                            same "localize cheap, act expensive" split.

BM25 / Okapi BM25 itself              classic lexical ranking function (Robertson &         takes: the formula itself, reimplemented in ~60
(wink-bm25-text-search, winkjs,        Sparck Jones), scores a query against a document     lines (no new runtime dependency; packages/decisions
github.com/winkjs/                    corpus by term frequency saturation (k1) + length     has none today and T53's boundary is this package
wink-bm25-text-search; also           normalization (b) + inverse document frequency.       only) rather than pulling wink-bm25-text-search in --
winkjs/wink-nlp's BM25Vectorizer)      wink-bm25-text-search is the closest off-the-shelf    same algorithm, zero added dependency surface,
                                       JS implementation (same algorithm, k1=1.2/b=0.75      easier to tune the tokenizer to code-shaped text
                                       defaults).                                            (paths, camelCase/kebab-case, hunk lines) in place.
```

## Why this shape for T53 (not a bigger swing)

- T49/results.md already diagnosed the recall ceiling: routing accuracy 0.36 because many decisions have `scope: []`
  (no path/folder/symbol anchor at all) -- an *author-time* gap, not a search-algorithm gap. A router that reads
  MEANING (title + summary + rationale key terms) instead of requiring an authored path anchor is the fix the T49
  report named as the next lever ("routing accuracy is the number that would have to improve").
- BM25 (not embeddings) for stage 1 because it needs zero model calls, zero network calls, and zero new runtime
  dependency (own ~60-line Okapi implementation) -- matches done-when 3's "zero-LLM BM25 stage first" and the
  RAG baseline's own failure mode this task must beat: RAG pays $0.0255/check by giving the LLM EVERY decision's
  full text; a stage-1 lexical narrow-down is the cheap substitute for "read everything", same Agentless shape.
- Stage 2 (listwise LLM pick) only on top-k candidates' ONE-LINE summaries, modeled on RankGPT's listwise-pick
  mechanic but deliberately NOT sending full decision text (that is RAG's cost, the thing T53 must beat) -- closer
  to PE-Rank/Rank-without-GPT's later "compress the candidate" fix than RankGPT's original full-passage cost.
