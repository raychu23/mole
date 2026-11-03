## Summary

`mole recall` and MCP `mole_recall` return past decisions/incidents that resemble a new proposal/draft or an
existing record, ranked nearest-first, with a note that always says "similar case -- check whether it applies",
never a causal claim. It's plain BM25 (route/bm25.ts, the named baseline), reused unmodified, over loadGraph's
existing decision/incident nodes. A title+body hybrid BM25 was built and measured as the one candidate custom
matcher; on the frozen held-out ADR pair it tied BM25 (did not beat it), so per the task's STOP rule we ship
BM25 and say so plainly.

```notes
T71-case-recall    case recall ("resembles" relation)    packages/decisions + daemon cli + mcp
    prior art       tasks/T71-case-recall/4 log/prior-art.md -- Klein 1989 RPD, Aamodt & Plaza 1994 CBR,
                     Robertson/Walker Okapi BM25, Carbonell/Goldstein 1998 MMR, Graphiti (getzep) hybrid
                     search, ai-memory ARCHITECTURE.md -- 6 primary sources, all fetched+dated 2026-11-03

    eval set        context/product-plan/systems/metrics-proof/case-recall/eval-set.json (gitignored-private
                     in main; written inside this worktree, listed here per the task's boundary note)
                     · 53-doc corpus from 2 real public ADR corpora already vendored in-repo (govuk-aws,
                       backstage, under packages/decisions/bench/corpora/)
                     · 3 relevance pairs: the ONLY "superseded by"/"supersedes" links either corpus contains
                       (exhaustively grepped, not sampled -- see eval-set-build.md)
                     · dev/held-out split frozen before scoring: 2 dev (alpha-tuning) / 1 held-out (scored once)
                     · sha256 06074cff2be6492d900eb8afdcf31bc3ca1c3ae82a0131811cac96f659ac30dc, written in
                       eval-set.sha256 before packages/decisions/bench/t71-recall-eval.ts ever ran

    held-out result tasks/T71-case-recall/4 log/results.md: BM25 recall@5=1.0 MRR=1.0 vs. title+body hybrid
                     recall@5=1.0 MRR=1.0 on the single held-out pair -- TIE, custom matcher did NOT beat
                     BM25 -> STOP rule: ship BM25 unmodified, say so (done, this is what recall.ts calls)

    tests            red: tasks/T71-case-recall/4 log/red.txt (packages/decisions/test/recall.test.ts,
                     "Cannot find module '../src/recall/recall.js'")
                     green: 7/7 recall.test.ts, 33/33 packages/decisions full targeted run after adding it
                     (377/377 whole package), 18/18 packages/mcp reasoning-tools + tool-annotations
                     `npx tsc -b` clean (root)

    code             packages/decisions/src/recall/recall.ts      recallSimilar(root, {text|record}, {limit,
                     adrDirs}) -- reuses Bm25Index (route/bm25.ts) + indexTextOf (route/index-text.ts) +
                     loadGraph (graph.ts); candidates = every decision/incident node already in the graph,
                     no new case store
                     packages/decisions/src/cli.ts                recallCli -- `mole recall <text> | --record
                     ID [--adr-dir D[,D]] [--limit N] [--json]`, always JSON (same convention as `mole
                     incident suggest`/`mole priorities`)
                     packages/daemon/src/cli.ts                    `recall` command wired to recallCli
                     packages/mcp/src/reasoning-tools.ts           mole_recall tool, READ_ONLY_ANNOTATIONS,
                     text|record input, structuredContent = library's RecallResult
                     packages/mcp/test/tool-annotations-schema.test.ts  mole_recall added to READ_ONLY_TOOLS
                     packages/decisions/bench/t71-recall-eval.ts   one-shot scorer against the frozen eval
                     set, reusing the SHIPPED Bm25Index/indexTextOf (no second BM25 implementation)

    not run          nothing -- every claim above ran for real (tsc -b, vitest, the CLI smoke test, the
                     eval scorer). MMR (prior-art #4) and Graphiti's embedding leg (#5) were investigated and
                     explicitly scoped OUT (not implemented): MMR needs ≥2 gold answers per query to show a
                     diversity effect and this eval set has exactly 1 per query; Graphiti's embedding leg
                     needs a vector store + embedding model call, outside the zero-model-call boundary.

    reversible defaults (evidence)
                     limit=5 default: matches the task's own "recall@5" cutoff, not a separate choice
                     dev/held-out split = alphabetical-by-query-id (not picked after seeing scores): frozen
                     in eval-set-build.md before packages/decisions/bench/t71-recall-eval.ts ran once
                     hybrid alpha search range 0.0-1.0 step 0.1, MRR as the dev selection metric: both
                     reversible, overridable in t71-recall-eval.ts if a bigger eval set later changes the
                     answer
```
