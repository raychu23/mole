# T71 prior art — case recall ("resembles" relation)

Sources fetched today (2026-11-03) via web_search unless marked "field knowledge" (matches this repo's own
convention, e.g. tasks/T38-bitemporal-decision-graph/4 log/prior-art.md line 13).

## 1. Klein 1989 — Recognition-Primed Decision (RPD) model
Gary A. Klein, "A Recognition-Primed Decision (RPD) Model of Rapid Decision Making" — fetched
2026-11-03: https://theisrm.org/documents/Klein%20(1989)%20A%20Recognition-Primed%20Decision%20Model%20of%20Rapid%20Decision%20Making.pdf
(fireground commanders study; also summarized at https://fs.usda.gov/eng/pubs/htmlpubs/htm95512855/page13.htm,
fetched 2026-11-03). Core claim: experienced decision-makers rarely compare options; they recognize a new
situation as "typical of" a past one, retrieve the action that worked, and mentally simulate whether it still
fits before committing. The recognition step is "this resembles case X", not "X caused this" — RPD explicitly
treats resemblance as a trigger for checking fit, never as an assertion that the past case explains or causes
the present one. **What we borrow**: the output shape. `mole recall` must phrase a hit as "this resembles a past
case, go check whether it still fits" — never "X happened because of Y" or "do what you did last time". **What
does not fit**: RPD's recognition is tacit/perceptual (a human expert's own memory); Mole has no expert memory to
model, only a text corpus, so we approximate "recognition" with lexical retrieval over past records, not a
simulated mental model.

## 2. Aamodt & Plaza 1994 — Case-Based Reasoning (CBR), the 4-step cycle
Agnar Aamodt & Enric Plaza, "Case-Based Reasoning: Foundational Issues, Methodological Variations, and System
Approaches", AI Communications 7(1), 1994 — fetched 2026-11-03:
https://www.iiia.csic.es/~enric/papers/AICom.pdf (open PDF; also indexed at
https://journals.sagepub.com/doi/10.3233/AIC-1994-7104). CBR's cycle is Retrieve → Reuse → Revise → Retain: a
new case is matched against a case base by similarity, the closest case's solution is adapted, the outcome is
checked, and the (possibly adapted) case is stored back for future retrieval. **What we borrow**: "Retrieve" —
case recall is explicitly scoped to retrieval only (done-when 4: "check whether it applies", never asserts
causation); we are building CBR's first step, not the full cycle. The case base is read from existing
.mole/decisions, .mole/incidents and ADR-folder records (graph.ts loadGraph), never a bespoke store. **What does
not fit**: Reuse/Revise/Retain are out of scope here — adapting a past solution or writing a new case back is a
person's act in Mole (same boundary incident-revive.ts already draws: suggest only, accept/dismiss are the
person's call), not something `mole recall` does.

## 3. Robertson & Walker — Okapi BM25 (the stock baseline, already in-repo)
S.E. Robertson, S. Walker et al., "Okapi at TREC-3", TREC-3 proceedings, 1994 — fetched 2026-11-03:
https://www.microsoft.com/en-us/research/wp-content/uploads/2016/02/okapi_trec3.pdf. This is the baseline named
in the ledger task (`packages/decisions/src/route/bm25.ts`, T53's own ~60-line reimplementation, k1=1.2/b=0.75
defaults, already used to route a change's text against decision index text). Per the task's STOP rule, this is
the baseline a custom matcher must beat on held-out, or we ship it as-is.

## 4. Carbonell & Goldstein 1998 — Maximal Marginal Relevance (MMR)
Jaime Carbonell & Jade Goldstein, "The Use of MMR, Diversity-Based Reranking for Reordering Documents and
Producing Summaries", SIGIR 1998 — fetched 2026-11-03:
http://www.cs.cmu.edu/~jgc/publication/The_Use_MMR_Diversity_Based_LTMIR_1998.pdf. MMR reranks a candidate list
to balance relevance against novelty (avoid 5 near-duplicate hits). **What we borrow**: considered as a
candidate re-ranker for case recall's top-k (so 5 past cases aren't 5 near-duplicate incidents). **What does not
fit, here**: our frozen eval set (3 superseded-ADR pairs, see eval-set.md) has exactly one gold answer per query,
so MMR's diversity objective cannot be scored against it (diversity vs. redundancy needs ≥2 gold answers per
query to show a difference) — not run; recorded only as a documented option for a case base large enough to need
it, not implemented in T71.

## 5. Graphiti (getzep) — hybrid retrieval over a temporal knowledge graph
"Searching the Graph", Graphiti docs — fetched 2026-11-03: https://help.getzep.com/graphiti/working-with-data/searching
and `graphiti_core/search/search_config_recipes.py` — fetched 2026-11-03:
https://github.com/getzep/graphiti/blob/main/graphiti_core/search/search_config_recipes.py. Graphiti's default
`search()` is a hybrid: BM25 full-text + cosine similarity over embeddings on nodes/edges/communities, combined
with Reciprocal Rank Fusion (RRF), with an LLM only for extraction when episodes are ingested, never in the
read path. **What we borrow**: the "no model in the read path" discipline (matches the task's "no model calls"
boundary) and RRF as a documented combination strategy. **What does not fit**: Graphiti's embedding leg needs a
vector store and an embedding model call per query — out of boundary (zero network/model calls, reuse
route/bm25.ts) — so only its BM25 leg and its "never assert causation, only retrieve related facts with
provenance" posture are reusable here, not the hybrid architecture itself.

## 6. ai-memory — FTS5 + entity-match + RRF, no vector store required
`docs/ARCHITECTURE.md`, akitaonrails/ai-memory — fetched 2026-11-03:
https://github.com/akitaonrails/ai-memory/blob/main/docs/ARCHITECTURE.md ("memory_query answers via FTS5 +
entity-match + link-neighbour RRF; when an embedder is configured, vector [search adds a fourth RRF stream]").
**What we borrow**: the same shape as Graphiti's RRF idea but keyword-first and embedding-optional — confirms
that a project's own Mole instance (this repo) uses the same "memory_query" tool pattern for retrieving past
decisions/corrections by full-text match, no model call required for the common case. This is consistent with
`mole recall` being BM25-first with no model call, matching what both reference systems treat as their
"always available, zero-cost" retrieval tier.

## What this means for T71
- RPD (#1) names the *contract*: a recall hit is "this resembles a past case", never a causal claim — `mole
  recall`'s output note must say exactly that, and tests must assert it never says "caused" or "because of".
- CBR (#2) names the *scope*: retrieval only, no reuse/revise/retain — matches the MCP tool being read-only
  (packages/mcp/src/reasoning-tools.ts's existing readOnlyHint pattern, T61).
- BM25 (#3) is the baseline to beat; MMR (#4) and Graphiti's embedding leg (#5) are out of scope (no eval
  signal / no model calls allowed); a title-weighted hybrid BM25 field (title BM25 + body BM25, see
  eval-set.md) was tried as the one candidate custom matcher within boundary.
- ai-memory/Graphiti (#5, #6) both put BM25/FTS ahead of any model call in their default retrieval path,
  which is the same ordering this task's boundary enforces (no model calls, reuse route/bm25.ts).
