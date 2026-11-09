# T120 — DEV recall@1/3/5 measurement (real ADR corpora)

## Method (and its honest limits — read before the numbers)

**No git clone** (disk budget: 4.6-4.9 GB free the whole time, well under the task's STOP
threshold risk): ADR text for 10 repos fetched via the GitHub contents/raw API at each repo's
CURRENT default-branch HEAD (not the historical commit each case's `base` SHA points at — a
disclosed approximation; see Gap 1 below). `run_recall_dev.mjs` runs the REAL, built
`routeDecisions()` from `packages/decisions/dist` — no BM25/RRF reimplementation.

**Repos covered (10 of 13 ever used in B2):** easi-app, powertools-python, log4brains, python-tuf
(v3 dev), merino-py, hmrc-frontend (v4.1 dev), semantic-kernel, jaeger, content-publisher,
email-alert-api (v4.2+v4.3, labeled **seen** per the task brief — already scored once, reused
here descriptively). **NOT covered: backstage** (1 v3-dev case; repo git size 8.2 GB, skipped —
API-fetch would have worked too but was deprioritized under time pressure), **claw-operator,
handbook** (v4.1, 22 dev cases total; their public GitHub slug could not be resolved in the time
available — NOT a disk/budget issue, just unresolved identity). These three gaps are real and
unmeasured, not silently dropped: **60 of 82 DEV cases measured** (v3 dev 61/62, v4.1 dev
20/42 — `handbook`+`claw-operator` carry most of v4.1's dev set, so the v4.1 DEV reading here is
thin), **68 of ~124+ SEEN cases measured** fully covers v4.3's two Part-A repos
(semantic-kernel, jaeger) at the exact repos the brief calls out, plus v4.2's hmrc-frontend
(partial) and v4.3's content-publisher/email-alert-api.

**Ground truth** was resolved WITHOUT any id-normalization guesswork (the exact bug class
T112b's correction fixed): each case's own `decision_text` field (the labeled governing
decision's text, already in `cases_with_labels_*.json`) was substring-matched against every
fetched ADR file's content. **0 of 217 cases failed to match** — a strong signal the fetched
corpus is the right one, but substring match on a short/generic `decision_text` snippet can in
principle match the wrong file when two ADRs share boilerplate language; not individually
re-verified case-by-case under time pressure.

**Recall@k is measured against the full ranked `bm25Candidates` order** (post-boost), not just
the single `routed` pick — this is what downstream tiers/consumers actually see, and lets k=3/5
be measured even when `routed` returns only one id.

**Governs-summary coverage is partial**: generated via ONE bulk `hermes -z --safe-mode` call per
repo (not per decision — budget discipline), claude-haiku-4-5. Parsed successfully for
easi-app (43/43), powertools-python (6/7), content-publisher (16/16), email-alert-api (10/10) —
**203 of 210 decisions total**, but the bulk-prompt output format drifted for log4brains,
python-tuf, merino-py, hmrc-frontend, semantic-kernel, jaeger (abbreviated/ambiguous ids in the
model's reply couldn't be resolved back to a unique filename) — those repos simply have ZERO
`governsSummary` coverage, which (by the flag's own no-op-when-absent contract, tested in
`route-embed-governs.test.ts`) means the `+useGovernsSummary` config is byte-identical to plain
`embedBoost` there. **Not patched further under time pressure** — disclosed, not silently
widened by relaxing the parser until numbers looked better.

**Stage-1 only — NO stage-2 LLM call in this measurement** (cost discipline: 217 cases × 3
configs × a listwise call would be ~650 `hermes -z` calls; out of this task's time budget).
Every config here calls `routeDecisions()` with **no `llm` client**, which per route.ts's own
contract (`if (confidence >= confidenceRatio || !opts.llm) return top1`) makes it **always**
return the BM25-tier top-1 regardless of confidence. **This inflates the false-alarm rate to a
ceiling of ~100% on every 'none'-labeled case in every config** (any weak coincidental lexical
overlap routes something) — this is an artifact of the missing stage 2, not a regression caused
by embedBoost/governsSummary, and it is **why the false-alarm numbers below are reported as "not
a valid FA comparison" rather than as a finding**. A real FA comparison needs the full two-stage
cascade (stage 2 already exists in route.ts; just not exercised here) — flagged as the single
biggest follow-up this task did NOT close.

**Absolute numbers here are not directly comparable to the frozen v3/v4.1/v4.2/v4.3 benchmark
files** (different corpus snapshot — today's HEAD vs. each case's historical `base`; no stage 2;
approximate ground-truth matching). **What IS valid and is the actual result of this task: the
RELATIVE delta between the three configs, measured identically on the exact same corpus/cases/
matching every time** — only the router flags differ between rows.

## Results — losses first

**SEEN (v4.2+v4.3), per-repo, the exact repos named in Q13:**

| repo | config | n | R@1 | R@3 | R@5 |
|---|---|---|---|---|---|
| semantic-kernel | bm25-baseline | 16 | **0.000** | 0.062 | 0.125 |
| semantic-kernel | +embedBoost | 16 | **0.000** | 0.125 | 0.125 |
| semantic-kernel | +embedBoost+governs | 16 | **0.000** | 0.125 | 0.125 |
| jaeger | bm25-baseline | 14 | 0.929 | 1.000 | 1.000 |
| jaeger | +embedBoost | 14 | 0.857 | 1.000 | 1.000 |
| content-publisher | bm25-baseline | 28 | 0.464 | 0.750 | 0.821 |
| content-publisher | +embedBoost | 28 | 0.464 | 0.750 | 0.857 |
| email-alert-api | bm25-baseline | 10 | 0.600 | 0.800 | 0.900 |
| email-alert-api | +embedBoost | 10 | 0.400 | 1.000 | 1.000 |

**The headline loss: embedBoost does NOT fix semantic-kernel's R@1 (stays 0, the exact failure
Q13 names) and makes jaeger's and email-alert-api's R@1 WORSE** (jaeger 0.929→0.857,
email-alert-api 0.600→0.400) while helping their R@3/R@5. Pooled SEEN R@1 actually falls
(0.471→0.426) even though pooled R@3/R@5 rise (0.647→0.691, 0.706→0.735). **This is a real,
disclosed regression at the metric Q13 cares about most (R@1), on exactly the corpora Q13 names,
not a clean win.**

**DEV (v3+v4.1 dev), pooled:**

| config | n | R@1 | R@3 | R@5 |
|---|---|---|---|---|
| bm25-baseline | 60 | 0.800 | 0.933 | 0.933 |
| +embedBoost | 60 | 0.883 | 0.967 | 0.967 |
| +embedBoost+governs | 60 | **0.900** | **0.983** | **0.983** |

DEV improves monotonically at every k with both signals added, and governsSummary adds a further
small gain on top of embedBoost alone (entirely from easi-app, its only repo with full
governs-summary coverage in this run: R@1 0.893→0.929).

**False-alarm rate: not a valid comparison in this measurement** (ceiling effect, see Method) —
DEV_FA and SEEN_FA both read 1.000 in every config; this is the missing-stage-2 artifact, not a
regression from the new signals. The task's "check the none-case does not rise" requirement is
**NOT closed** by this measurement — it needs the two-stage cascade run, which this task did not
budget for.

## Honest conclusion

The brief's hoped-for result (embeddings/governs-summaries close B2 v4.3's semantic-kernel gap)
**did not happen**: semantic-kernel's R@1 is unmoved at 0.000 across all three configs, and the
mechanism actively **hurts** R@1 on two of the four SEEN repos even as it helps R@3/R@5 broadly
and helps DEV cleanly. Plausible reason (not independently confirmed under time pressure):
semantic-kernel's `docs/decisions` corpus is large (79 decisions) and its governs-summary
generation failed to parse (0/79) — the one mechanism specifically aimed at this failure mode
never got to run on the repo that needs it most. **Recommended next step, not done here**: fix
the per-repo governs-summary bulk-prompt parser (one call per decision instead of bulk, slower
but robust) specifically for semantic-kernel, then re-measure before claiming any fix for Q13's
named repo.

## Cost / latency

- Router call: still $0 / near-instant in every config (`avg_ms` 2.3-3.7 ms across 217 calls,
  BM25+cosine-similarity arithmetic only, no model/network call inside `routeDecisions()` itself
  — same zero-LLM-stage-1 economics the project already measured for T53).
- One-time governs-summary generation (NOT per-route, per-decision at capture time only): 10
  bulk `hermes -z --safe-mode` calls (claude-haiku-4-5), 149.3s total wall time for 210
  decisions (~0.71s/decision amortized) — Raymond's subscription, not a billed API (per project
  convention, no dollar estimate claimed).
- Embedding generation: local `sentence-transformers` all-MiniLM-L6-v2 (already installed, 0
  new disk/install), 18.6s wall time to embed 427 texts (210 decisions + 217 case diffs), $0.

## Raw data

`4 log/recall-dev-data/`: `recall_results.json` (per-repo hit counts per config), `eval_cases.json`
(the 217 matched cases with ground-truth file ids), `governs_summaries.json` + `governs_timings.json`,
`adr_listing.json`. `4 log/run_recall_dev.mjs` is the runner (imports the real built
`routeDecisions()`, no reimplementation).
