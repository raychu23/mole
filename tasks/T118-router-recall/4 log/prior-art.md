# T118 prior art — routing recall (≥5 dated sources, recent first)

Task: B2 v4.2 miss analysis found every T53 miss was `routedCorrectly=false` (wrong/no decision handed to the
check). Goal: raise routing recall@k without raising false alarms. Below: what's out there for (a) hybrid
lexical+dense retrieval fusion, (b) reranking, (c) query expansion from a diff, (d) path/glob-based routing, (e)
what adjacent coding-agent tools do for rule/context selection — and which of these is actually usable inside
T53's constraints (zero-LLM stage-1 must stay zero-cost and zero-network; stage-2 is already a listwise LLM
rerank, not a new idea).

1. **Reciprocal Rank Fusion / weighted RRF for hybrid retrieval** — "Do Static Embeddings Add Value to Hybrid
   Dutch Retrieval?" (arXiv 2608.02112, 2026-08) and "A Reference Architecture for Agentic Hybrid Retrieval in
   Dataset Search" (arXiv 2604.16394, 2026-04) both use RRF (`1/(k+rank)`, Cormack et al. 2009 origin, k=60
   commonly used) to combine independently-scored rankings (BM25 + dense, or BM25 + dense + KG) without needing
   comparable score scales. **Used here**: RRF is the fusion mechanic for T118's `scopeBoost` — it combines the
   existing BM25 rank with a second "scope-glob-match rank" for the SAME reason these papers use it (no embedding
   model is available at T53's zero-LLM stage, but two independently-computed *rankings* over the same candidate
   set compose cleanly via RRF regardless of score scale). Dense embeddings themselves are NOT adopted (no
   network/model call is allowed at this tier; see `aurelio-labs/semantic-router`'s cheap-then-slow posture
   T53 already follows).

2. **Cross-encoder reranking** — "Releasing High-Performance Japanese Rerankers" (hotchpotch.dev, dated article)
   and the LangChain `CrossEncoderReranker` docs describe a bi-encoder-retrieve-then-cross-encoder-rerank
   pipeline (retrieve top-20 via embeddings/BM25, rerank to top-5 with a cross-encoder that jointly scores
   query+doc pairs). **Not adopted**: T53's stage 2 IS a cross-encoder-shaped step already (a single LLM call
   jointly reasoning over the change + candidate summaries, RankGPT-style listwise pick) — this is the same
   idea T53 shipped under T53 already; nothing new to add here for the zero-LLM tier.

3. **Agentless: file-path + embedding localization from an issue description** (arXiv 2407.01489, NeurIPS 2024) —
   localizes to suspicious FILES first using the repo's directory structure + the issue text (no full-file
   embedding of the whole repo), citing 77.7% file-level localization just from that step; explicitly treats
   file PATHS as a privileged, structural signal distinct from free-text embedding similarity. **Used here**:
   motivates treating a decision's own file-path scope (`scope:`/`in:` globs) as a privileged routing signal
   fused alongside prose-term BM25, not just more text to tokenize.

4. **CODEOWNERS / GitHub & GitLab docs (ongoing, current)** — path-glob rule routing is a mature, well-specified
   pattern (gitignore-style globs, `**`, negation via `!`, "more specific pattern can be overridden" semantics).
   GitLab's docs explicitly show narrower patterns taking precedence over broad ones (`*.rb` vs `!/config/**/*.rb`).
   **Used here**: confirms path-glob routing is a standard, low-risk mechanism when kept path-based and scoped
   — AND that specificity/precedence between a broad and a narrow pattern is a recognized concern CODEOWNERS
   itself has to handle (not unique to Mole). This directly informed the self-review fix below (§6).

5. **Cursor `.cursor/rules` glob-scoped rule selection** (cursor.com/docs/rules, current; morphllm.com and
   axonbuild.com best-practices posts, 2026) — rules are auto-attached when their `globs` match a file in
   context; best-practice guidance explicitly warns against overly broad globs ("scope each rule to the code it
   protects... globs instead of always-on rules") and recommends testing a glob against one real file path
   before trusting it. **Used here**: directly informed the specificity floor (§6) — a glob like `pkg/**` is
   exactly the "too broad, matches everything" anti-pattern these guides warn against; T118 enforces a minimum
   literal-prefix depth before a scope glob counts toward the boost.

6. **Aider's repo-map (tree-sitter / ctags + PageRank-style graph ranking over files)** (aider.chat/2023/10/22,
   aider.chat/2023/05/25) — ranks files by a dependency-graph centrality score, not raw text similarity, to fit
   a token budget. **Not directly adopted**: no call-graph infrastructure exists in `packages/decisions` for
   decisions (decisions aren't code symbols); noted as a *future* direction if routing ever needs to rank by
   decision-to-decision reference structure (e.g. `supersedes`/`applies_to` edges `graph.ts` already parses).

## What was actually built (T118), and what prior art does NOT cover

None of the above sources discuss combining a *lexical* ranking with a *structural path-glob* ranking via RRF
specifically for an "is this decision governed by this diff" routing problem — that combination (§1 + §3/§4,
with the §5-motivated specificity floor) is this task's own synthesis, built and measured against B2 v3/v4.1 DEV
splits (see `0 start.md` and `measure_scopeboost_recall.mjs` / `false_alarm_check_v3dev_none.mjs` in this log
dir), not copied from a single paper or tool.

## Step B addendum (2026-11-08): scopeBoost is a no-op on real ADRs (0/54 v4.1 decisions declare `scope:`) —
## path/identifier MENTION extraction from the ADR's own TEXT, prior art for the specific signal added

Problem restated: B2 v4.2's only 4 real misses were all `routedCorrectly: false`; of those, exactly ONE
(`v42-claw-0018-violate`) is a case where the ADR's own "Key files" prose names the diff's exact touched file —
scopeBoost can never fire on it (no author-declared `scope:` field exists in this real, plain-markdown ADR
corpus). The other 3 misses touch/add files the ADR text never names at all (new, unmentioned files/
identifiers by construction) — no text-mention signal can fix those; stated plainly in `0 start.md`, not glossed
over.

7. **Antoniol, Canfora, Casazza, De Lucia, Merlo, "Recovering Traceability Links between Code and Documentation"**
   (IEEE TSE 28(10), 2002) — the foundational IR-based doc↔code traceability recovery method: links are found
   from shared VOCABULARY (identifiers, terms) between a design/requirements document and source code, no
   embedding model, just term overlap. **Used here**: directly motivates `route/mentions.ts` extracting path/
   identifier mentions from an ADR's own text as its own privileged signal, rather than relying on BM25's
   whole-text term overlap to surface the same evidence — same "shared vocabulary recovers a link" idea, applied
   at load time instead of query time.

8. **Yang et al., "SWE-agent: Agent-Computer Interfaces Enable Automated Software Engineering"** (NeurIPS 2024,
   arXiv 2405.15793) — the ACI's `find_file`/`search_file` commands localize by explicit path and string/
   identifier search over the repo BEFORE any patch is proposed, i.e. an agent-visible, privileged "does this
   name appear in the repo" signal distinct from free-text retrieval. **Used here**: reinforces Agentless's
   §3 point (path/identifier-first localization) specifically for an agentic tool's own interface design, not
   just a benchmark result — route/mentions.ts's `extractMentionedPaths` resolving against the real repo file
   list (never a guess) mirrors this "ground the mention in something that actually exists" posture.

9. **Saha, Lease, Khurshid, Perry, "Improving Bug Localization using Structured Information Retrieval" (BLUiR)**
   (ASE 2013) and **Robertson & Zaragoza, "The Probabilistic Relevance Framework: BM25 and Beyond"** (2009, BM25F)
   — both treat distinct TEXT FIELDS (a bug report's summary vs. description; a stack trace vs. free prose) with
   different weight/structure rather than concatenating everything into one bag of words, AND BM25's own IDF
   term already down-weights a word that appears in most documents in a collection (low discriminating power).
   **Used here, twice**: (a) motivates keeping mentionPaths/mentionIdentifiers as a SEPARATE signal fused via
   RRF rather than just re-tokenizing mentioned paths/identifiers into the same BM25 index text (they would be
   drowned out by the rest of the prose, same reasoning scopeGlobs already uses); (b) directly diagnosed and fixed
   a SELF-REVIEW regression found on real v4.1 dev data: a repo's own product name (`OpenClaw`, PascalCase,
   passes every code-identifier-shape heuristic) appeared in one ADR's prose and, coincidentally, in an unrelated
   diff's code comment too, and counting that single match as a privileged signal outranked the TRUE governing
   decision (v4-claw-0002-violate, recall@1 regression 0.75→0.594 before the fix). `route/mentions.ts`'s
   `dropCommonMentions` (corpus document-frequency filter) and `route.ts`'s `MIN_IDENTIFIER_MATCHES = 2` floor
   are this task's own fixes, directly modeled on BM25's own IDF down-weighting and BLUiR's field-weighting
   logic, not a mechanical copy of either (neither paper's method is invoked at runtime; the PRINCIPLE — a
   term's cross-document commonness bounds its discriminating power — is what transferred).

**What was actually built, step B**: `route/mentions.ts` (`extractMentionedPaths`, `extractMentionedIdentifiers`,
`dropCommonMentions`) + `route.ts`'s `mentionBoost` (fused into the SAME RRF pass as `scopeBoost`, see
`rrfFuse`/`applyBoosts`) is this task's own synthesis of §7–9 above, not a copy of any one paper or tool; the
corpus-level common-mention filter and the identifier-match floor were found and fixed by this task's own
self-review against real v3/v4.1 dev data, not by any source cited above predicting the exact failure mode.
