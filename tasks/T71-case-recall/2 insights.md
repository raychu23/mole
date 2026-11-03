## Summary

`mole recall` and MCP `mole_recall` return past decisions/incidents that resemble a new proposal/draft or an
existing record, ranked nearest-first, with a note that always says "similar case -- check whether it applies",
never a causal claim. It's plain BM25 (route/bm25.ts, the named baseline), reused unmodified, over loadGraph's
existing decision/incident nodes. A title+body hybrid BM25 was built and measured as the one candidate custom
matcher; on the rebuilt, held-out eval set (18 real relation pairs across 9 vendored corpora -- see Review 1
fixes below) it did NOT beat BM25 on the strong (authored-relation) signal held-out, so per the task's STOP
rule we ship BM25 and say so plainly. Review 1 found the original 3-pair, 2-corpus eval set's "exhaustive"
claim false; it has been rebuilt (eval-set-v2.json) from every relation Mole's own loadGraph models, across
every vendored corpus named in the finding, with same-scope pairs kept as a separately-labelled weaker signal.

```notes
T71-case-recall    case recall ("resembles" relation)    packages/decisions + daemon cli + mcp
    prior art       tasks/T71-case-recall/4 log/prior-art.md -- Klein 1989 RPD, Aamodt & Plaza 1994 CBR,
                     Robertson/Walker Okapi BM25, Carbonell/Goldstein 1998 MMR, Graphiti (getzep) hybrid
                     search, ai-memory ARCHITECTURE.md -- 6 primary sources, all fetched+dated 2026-11-03

    eval set        context/product-plan/systems/metrics-proof/case-recall/eval-set-v2.json (v1 eval-set.json
                     SUPERSEDED, kept not deleted -- see SUPERSEDED-eval-set-v1.md); both gitignored-private
                     in main; written inside this worktree, listed here per the task's boundary note
                     · 173-doc corpus pool from EVERY vendored corpus the review named: bench/corpora/
                       {govuk-aws,backstage,m29-adrtools,m29-madr,m29-speckit} + bench/{m24,m24v2}/
                       {govuk-infrastructure,backstage} -- built by the SHIPPED loadGraph, unmodified
                     · 18 relevance pairs, two signals reported separately: 7 strong (authored relation --
                       supersedes x5, amends x2, from loadGraph's own edges + a supplementary full-text scan
                       for 2 phrasings graph.ts's line-anchored regex misses) + 11 weak (same-scope, .mole-
                       format corpora only) -- see eval-set-build.md's "eval-set-v2 build report" for the
                       exact counts-per-signal and every pair found
                     · dev/held-out split frozen before scoring, strong/weak split independently: 13 dev /
                       5 held-out (2 strong, 3 weak)
                     · sha256 bc52bf619d5428fae81e6983f9f997bf9972ebb3b3312fa37c116cb582dc9012, written in
                       eval-set-v2.sha256 before packages/decisions/bench/t71-recall-eval-v2.ts ever ran

    held-out result tasks/T71-case-recall/4 log/results.md (v2): strong signal (n=2) BM25 recall@5=1.0
                     MRR=0.667 vs. hybrid recall@5=1.0 MRR=0.667 -- TIE, did NOT beat BM25. Weak signal (n=3)
                     hybrid did beat BM25 recall@5 (0.667 vs 0.333) but weak/same-scope is not the STOP rule's
                     signal and is reported separately, never merged in. STOP rule verdict unchanged: ship
                     BM25 unmodified, say so (done, this is what recall.ts calls). Wilson 95% CIs on both are
                     wide at this n -- reported as directional, not a strong statistical claim (see results.md).

    tests            red: tasks/T71-case-recall/4 log/red.txt (packages/decisions/test/recall.test.ts,
                     "Cannot find module '../src/recall/recall.js'"); review-1's 3 added tests (empty repo x2,
                     1000-record perf) ran green on first try against already-correct code -- stated plainly
                     in red.txt, not fabricated as a red-green cycle
                     green: 10/10 recall.test.ts (was 7/7, +3 review-1), 398/398 full targeted run
                     (packages/decisions + packages/mcp reasoning-tools + tool-annotations-schema)
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
                     packages/decisions/bench/t71-recall-eval.ts   v1 one-shot scorer (superseded, kept)
                     packages/decisions/bench/t71-eval-build.ts    review-1: rebuilds eval-set-v2.json from
                     loadGraph's own edges (+ a supplementary full-text scan, see the file's header comment)
                     across every vendored corpus the review named; reports counts per signal before scoring
                     packages/decisions/bench/t71-recall-eval-v2.ts  review-1: one-shot scorer against
                     eval-set-v2.json, strong/weak signal scored and reported separately, Wilson CI included

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

## Review 1 fixes

- finding: the eval set's "exhaustive" claim was false -- missed Amends/Amended-by pairs (govuk-aws
  0010<->0017; m29-adrtools 0005<->0009, corpus never included), never used m29-madr/m29-speckit, never used
  the `.mole-format` corpora under `bench/m24*` where same-scope pairs exist (gi-0002/0005/0011 cluster on
  `terraform/deployments/cluster-infrastructure/main.tf`; gi-0023/0024 on the gatekeeper files; bs-adr002/008
  on `catalog-info.yaml`).
  fix: new `packages/decisions/bench/t71-eval-build.ts` loads EVERY vendored corpus the finding named via the
  SHIPPED `loadGraph` (unmodified), extracts the strong signal from every `EdgeType` graph.ts models between
  two case records (plus a supplementary full-text scan, same script, for 2 phrasings graph.ts's line-
  anchored regex misses -- see the file's header), and extracts same-scope pairs as a SEPARATE weak signal.
  Writes `eval-set-v2.json` + `eval-set-v2.sha256` before any scoring; the old `eval-set.json`/`.sha256` are
  kept, not deleted, marked superseded (`SUPERSEDED-eval-set-v1.md`). Corrected the exhaustiveness wording
  everywhere it appeared (this file, `eval-set-build.md`).
  proof: `node dist/bench/t71-eval-build.js` output, pasted verbatim into `eval-set-build.md`'s "eval-set-v2
  build report" -- 173 case-record docs, 7 strong pairs (amends: 2, supersedes: 5, including both findings'
  named pairs and both named weak-signal clusters confirmed present by direct read of the source `.md` files
  in `packages/decisions/bench/corpora/govuk-aws`, `.../m29-adrtools`, and `.../m24/{govuk-infrastructure,
  backstage}`), 11 weak pairs, sha256 `bc52bf619d5...` written before `t71-recall-eval-v2.ts` ran.

- finding: STOP rule unchanged -- custom matcher must beat BM25 on held-out or BM25 ships; losses first;
  confidence interval / small-n caveat must be reported honestly.
  fix: new `packages/decisions/bench/t71-recall-eval-v2.ts` scores the frozen, dev/held-out-split
  eval-set-v2.json once, strong and weak signal reported in SEPARATE tables (never merged), with a Wilson
  95% CI on each held-out recall@5 and an explicit small-n caveat line.
  proof: `node dist/bench/t71-recall-eval-v2.js` output written verbatim to `results.md` (v2) -- strong
  signal held-out (n=2): BM25 recall@5=1.000 [0.342,1.000], hybrid recall@5=1.000 [0.342,1.000], TIE, did NOT
  beat BM25; weak signal held-out (n=3): hybrid 0.667 vs BM25 0.333 (hybrid did beat BM25 on the weaker
  signal, reported separately, not used to override the STOP rule verdict). STOP rule verdict: ship BM25
  unmodified -- unchanged from v1, now backed by a materially broader eval set.

- finding: add tests -- empty repo / no decisions returns empty cases (not error); 1000 synthetic records
  answer in < 2s.
  fix: two new `describe` blocks in `packages/decisions/test/recall.test.ts` (empty repo with no `.mole/` at
  all, and an empty-but-present `.mole/decisions`+`.mole/incidents`; a 1000-synthetic-decision perf test).
  proof: `npx vitest run packages/decisions packages/mcp/test/reasoning-tools.test.ts
  packages/mcp/test/tool-annotations-schema.test.ts` -> 39 files, 398/398 tests passed, including
  `recall.test.ts` 10/10 (both empty-repo tests, and the perf test logging 793ms for 1000 records, under the
  2000ms bar). `red.txt` states plainly that these 3 tests ran green on first try (the existing
  `recallSimilar` already handled both cases correctly) rather than fabricating a red-green cycle for
  already-correct code. `npx tsc -b` (root) exits 0.

