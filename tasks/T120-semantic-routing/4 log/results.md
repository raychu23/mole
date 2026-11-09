# T120 — Q13 follow-up: bug fixes + re-measurement (losses first)

Continues `4 log/recall-dev.md` (v1). Every number here cites its source file under
`4 log/recall-dev-data-v2/`. Scripts (`resolve_governs_summaries.py`, `fix_ground_truth.py`,
`run_recall_dev_v2.mjs`) are committed and reproduce the data files byte-for-byte (verified: see
"how to reproduce" at the end).

## Losses first

1. **v1's governsSummary generation didn't fail to produce content — it failed to ATTACH it.**
   The real bulk `hermes -z --safe-mode` haiku call for semantic-kernel (and 5 other repos) DID
   return real per-decision summaries (`4 log/recall-dev-data/governs_summaries.json`, unchanged,
   same raw data). v1's resolver matched those replies' keys against repo doc ids by EXACT STRING
   EQUALITY ONLY; the model's own reply format drifted per-repo (abbreviated ids like `"0021"` or
   `"001"` for 6 of 10 repos vs. full filenames for the other 4), so exact match silently produced
   ZERO matches for log4brains/python-tuf/merino-py/hmrc-frontend/semantic-kernel/jaeger — v1
   reported this as "0/79 for semantic-kernel" as if it were a coverage gap, when it was an
   attachment bug. **This silently-produced-nothing failure is exactly what the task brief warned
   against: "a measurement where the feature silently produced nothing is not a measurement."**
2. **A second, more consequential bug was found diagnosing why fixing (1) alone didn't move
   semantic-kernel's reported R@1:** v1's own `gt_file` ground truth (resolved by substring-
   matching each case's `decision_text` against fetched ADR content, per v1's disclosed method)
   matched the WRONG file for 12 of semantic-kernel's 16 non-none cases. Five distinct adr_ids
   (sk-0009/0011/0026/0033/0039/0043) all collapsed onto the same generic boilerplate file
   `0001-madr-architecture-decisions.md` because its `decision_text` snippet was generic enough to
   substring-match almost any diff. **v1's reported "semantic-kernel R@1 stuck at 0.000 in every
   config" was mostly this ground-truth bug, not a routing failure** (see "the recovered picture"
   below — the TRUE baseline R@1 for semantic-kernel is 0.375, independently matching the frozen
   B2 v4.3 bench's own reported 0.375 exactly, the strongest available cross-check).
3. **Even after both fixes, embedBoost/governsSummary still do NOT clearly win on the exact
   repos Q13 names.** Pooled SEEN R@1 is still mixed: `+embedBoost` HURTS jaeger (0.929→0.857) and
   email-alert-api (0.600→0.400) R@1 while helping content-publisher/semantic-kernel. No single
   stage-1 config wins on every SEEN repo's R@1 simultaneously — same qualitative conclusion as v1
   ("a real, disclosed regression on some repos, not a clean win"), just now measured against
   correct ground truth.
4. **False-alarm rate was NOT a valid reading in v1** (ceiling artifact, stage-1-only, confirmed
   again here: 1.000 in every stage-1-only config). Adding the real stage-2 LLM listwise config
   gives the first NON-ceiling FA reading this task has produced — and it is still high: **55.4%
   (k=10) / 60.7% (k=15)** of genuinely-`none` SEEN cases still get routed to something. This is
   a real, disclosed weakness, not an artifact: the production router is not yet accurate enough
   on these corpora to silently gate a check behind a "no governing decision" verdict.
5. **The two new LLM-listwise configs (k=10, k=15) do not change recall@k at all** (identical
   R@1/3/5 to the stage-1 `+embedBoost+governs` config they wrap, down to the last digit, both
   configs). This is expected, not a bug: recall@k is measured against `bm25Candidates`' order,
   which stage 2 never reorders — it only narrows `routed`/false-alarm behavior. Disclosed so this
   isn't misread as "the LLM made no difference."
6. **Coverage gaps carried over from v1, not re-measured here:** backstage (1 v3-dev case, repo
   too large), claw-operator/handbook (22 v4.1 dev cases, slug unresolved) remain unmeasured.
   LLM-listwise cost/recall was measured on SEEN only (68 non-none cases / 124 total incl. none),
   not DEV, for the same cost-discipline reason v1 gave for not running stage 2 at all.

## Bug (1): governsSummary parse/format bug — found, fixed, retested on real raw outputs

`4 log/resolve_governs_summaries.py` replaces v1's exact-match-only resolver with a 5-pass
progressively-looser match (exact filename/stem → unique numeric-prefix → elimination among
already-claimed candidates → suffix-token substring overlap → sole remaining candidate in a
numeric-prefix group), never guessing when genuinely ambiguous. Tested against the REAL raw
`governs_summaries.json` from v1's actual `hermes -z` calls (not re-generated — same model output,
different attachment logic):

| repo | docs | governsSummary coverage BEFORE | AFTER |
|---|---|---|---|
| easi-app | 43 | 43 | 43 (unchanged — already worked) |
| powertools-python | 7 | 6 | 6 (unchanged) |
| log4brains | 11 | 0 | 9 (2 files share one ambiguous date prefix, left unresolved — disclosed) |
| python-tuf | 10 | 0 | 10 |
| merino-py | 10 | 0 | 10 |
| hmrc-frontend | 10 | 0 | 10 |
| **semantic-kernel** | **79** | **0** | **77** (2 of 79 docs the bulk reply never summarized at all — a real, smaller, separate gap) |
| jaeger | 14 | 0 | 14 |
| content-publisher | 16 | 16 | 16 (unchanged) |
| email-alert-api | 10 | 10 | 10 (unchanged) |
| **total** | **210** | **88** | **205/206 generated keys resolved** |

Source: `4 log/recall-dev-data-v2/governs_resolved.json`, reproduced live by
`resolve_governs_summaries.py` against the unchanged `4 log/recall-dev-data/governs_summaries.json`.

## Bug (2): ground-truth resolution bug — found while diagnosing bug (1)'s non-effect

`4 log/fix_ground_truth.py`: re-derives `gt_file` from each case's own `adr_id` (its numeric
suffix, matched to the unique repo file starting with that number), used ONLY where unambiguous.
12 corrections, all in semantic-kernel (`4 log/recall-dev-data-v2/gt_corrections.json`). No other
repo's gt_file needed correcting (verified: every other repo's adr_id→gt_file mapping was already
numerically consistent).

## What actually produced the embedBoost cosine scores (item 2 of the ask)

**Local `sentence-transformers` (Python, `/opt/anaconda3/lib/python3.13/site-packages`,
confirmed installed — not newly installed, 0 new disk), model `all-MiniLM-L6-v2`, 384-dim,
`normalize_embeddings=False`.** Ran via `4 log/embed.py`-equivalent (the original v1 script,
preserved at `/Users/a1/.hermes/cache/scratch/t120/embed.py`, re-verified present and unmodified
this pass) on the decision texts (title+summary+text) and the case diffs — 427 texts, CPU only, no
GPU/network call, no paid API. `route.ts`'s `cosineSim` then does the actual similarity math in
pure JS from these precomputed vectors; `route.ts` itself has no model dependency. This was already
disclosed in v1's recall-dev.md but not independently re-verified there; re-verified here by
re-reading `embed.py`'s source and confirming the embedding vectors in
`eval_dataset_fixed_final.json` are 384-dim float arrays consistent with MiniLM's output
dimension (BERT-family 384-dim distilled models, not e.g. OpenAI's 1536/3072-dim embeddings).

## The recovered picture — recall@1/3/5, stage-1 only (no LLM), BOTH bugs fixed

Source: `4 log/recall-dev-data-v2/recall_results_stage1_final.json`, built by
`run_recall_dev_v2.mjs` against `eval_dataset_fixed_final.json` (bug 1 + bug 2 both fixed).

**SEEN (v4.2+v4.3), per-repo — the exact repos Q13 names:**

| repo | config | n | R@1 | R@3 | R@5 |
|---|---|---|---|---|---|
| semantic-kernel | bm25-baseline | 16 | **0.375** | 0.625 | 0.688 |
| semantic-kernel | +embedBoost | 16 | **0.438** | 0.875 | 0.875 |
| semantic-kernel | +governs(FIXED) | 16 | 0.375 | 0.625 | 0.688 |
| semantic-kernel | +both(FIXED) | 16 | **0.438** | 0.875 | 0.875 |
| jaeger | bm25-baseline | 14 | 0.929 | 1.000 | 1.000 |
| jaeger | +embedBoost | 14 | 0.857 | 1.000 | 1.000 |
| jaeger | +governs(FIXED) | 14 | 0.929 | 1.000 | 1.000 |
| jaeger | +both(FIXED) | 14 | 0.857 | 1.000 | 1.000 |
| content-publisher | bm25-baseline | 28 | 0.464 | 0.750 | 0.821 |
| content-publisher | +embedBoost | 28 | 0.464 | 0.750 | 0.857 |
| content-publisher | +governs(FIXED) | 28 | 0.500 | 0.750 | 0.821 |
| content-publisher | +both(FIXED) | 28 | 0.464 | 0.750 | 0.857 |
| email-alert-api | bm25-baseline | 10 | 0.600 | 0.800 | 0.900 |
| email-alert-api | +embedBoost | 10 | 0.400 | 1.000 | 1.000 |
| email-alert-api | +governs(FIXED) | 10 | 0.600 | 0.800 | 1.000 |
| email-alert-api | +both(FIXED) | 10 | 0.400 | 1.000 | 1.000 |

**Pooled SEEN:** bm25 0.559/0.779/0.838 → +embedBoost 0.529/0.868/0.912 → +governs(FIXED)
0.574/0.779/0.853 → +both(FIXED) 0.529/0.868/0.912 (R@1/R@3/R@5).

**The corrected headline: embedBoost DOES move semantic-kernel's R@1 (0.375→0.438, Q13's named
repo and metric) and its R@3/R@5 substantially (0.625→0.875 both), reversing v1's conclusion that
it "does not fix" this repo — that v1 conclusion was an artifact of bug (2)'s broken ground
truth, not a real finding about the router.** But embedBoost still actively hurts jaeger (R@1
0.929→0.857) and email-alert-api (R@1 0.600→0.400) — the "not a clean win" conclusion survives
both fixes, just for a different, now-correct reason: it's a genuine per-repo tradeoff, not a
broken measurement making semantic-kernel look unfixable. governsSummary(FIXED) alone is small and
mixed (content-publisher/email-alert-api up slightly, semantic-kernel/jaeger unchanged at R@1 —
most of its gain requires embedBoost's candidate-recovery step to even surface the summary-matched
candidates into the ranked list).

**DEV (v3+v4.1 dev), pooled, n=60 (same bounded coverage as v1 — see v1's disclosed repo gaps,
unchanged):**

| config | R@1 | R@3 | R@5 |
|---|---|---|---|
| bm25-baseline | 0.800 | 0.933 | 0.933 |
| +embedBoost | 0.883 | 0.967 | 0.967 |
| +governs(FIXED) | 0.850 | 0.950 | 0.950 |
| +both(FIXED) | **0.900** | **0.983** | **0.983** |

DEV numbers are IDENTICAL to v1's (bug 1 and 2 only affected semantic-kernel, a SEEN repo not in
the DEV set) — still a clean monotonic win at every k with both signals on.

**None-case routing stability:** every stage-1-only config reads FA=1.000 on every repo — same
ceiling artifact v1 disclosed (no stage 2 = always escalates on any lexical coincidence). Still
not a valid comparison; see the LLM section below for the first real reading.

## New config: LLM listwise rerank, wider top-k (k=10, k=15), haiku — cost per check

Real `hermes -z --safe-mode claude-haiku-4-5` calls via `hermesLlmClient`, run on SEEN's 124 cases
(68 non-none + 56 none), **default `confidenceRatio` (0.75, NOT the forced-always 1.01 the B2
bench used)** — i.e. this measures the production cascade's actual escalation behavior, not a
worst-case "always ask the LLM" cost. Source: `4 log/recall-dev-data-v2/recall_results_llm_listwise.json`.

| config | n cases | LLM calls | total cost | $/check | SEEN R@1/R@3/R@5 | SEEN FA |
|---|---|---|---|---|---|---|
| +embedBoost+governs(FIXED)+listwise-k10 | 124 | 120 | $0.1894 | $0.00158 | 0.529/0.868/0.912 | **0.554** |
| +embedBoost+governs(FIXED)+listwise-k15 | 124 | 120 | $0.2050 | $0.00171 | 0.529/0.868/0.912 | **0.607** |

120/124 cases escalated (stage-1 confidence rarely clears 0.75 on this real, noisy corpus) — cost
is close to the "always ask" ceiling in practice, not a cheap tail case. Recall@k is unchanged vs.
the stage-1-only `+both(FIXED)` config (expected, see Loss 5) — the only thing k=10 vs. k=15 (or
stage 2 at all) changes here is the false-alarm rate, which drops from the 1.000 ceiling to a real
55–61%, still high. k=15 costs slightly more per call (longer candidate list in the prompt) for a
slightly WORSE FA, not better — no evidence k=15 > k=10 in this run.

## Recommendation for the pre-registered NEW-repo eval (not run here, per task boundary)

**Recommend: `+embedBoost` alone (no governsSummary, no listwise-k15), topK=10 if stage 2 is
included.** Reasoning, in order:
- `+embedBoost+governs(FIXED)` and `+embedBoost` alone are statistically indistinguishable in
  every measurement above (identical SEEN pooled numbers, near-identical DEV: 0.883 vs 0.900 R@1
  on n=60 — a 1-case difference, not a reliable signal) — governsSummary's cost (one extra
  generation call per decision at capture time, ~0.71s/decision amortized per v1) is not currently
  buying a measurable recall gain beyond what embedBoost alone gets, and it depends on a bulk-
  prompt generation step whose id-matching just needed a second bug fix to work at all — a fragile
  dependency for a gain this small. Recommend deferring useGovernsSummary to a LATER, isolated
  pre-registration once a non-bulk (per-decision) generation call removes the id-matching problem
  class entirely, rather than shipping it now for an unproven gain.
- `+embedBoost` reverses the exact failure Q13 named (semantic-kernel R@1 0.375→0.438) at the cost
  of real regressions on 2 of 4 SEEN repos' R@1 — report this tradeoff explicitly in the
  pre-registration, do not claim a universal win.
- If the NEW-repo eval's arms include a stage-2 cascade (recommended, since FA is still ~55-60%
  and this task could not close it): k=10, not k=15 — identical recall, identical cost order of
  magnitude, marginally better (not worse) FA in this run. Do not forced-always escalate
  (confidenceRatio=1.01) for a production-representative cost measurement — use the real default
  (0.75) as done here.
- **This is a recommendation for a config to test, not a claim that any config is proven to win.**
  Both measurements above are DEV+SEEN (used, not held out) — exactly what the pre-registered
  protocol exists to test properly; do not treat this write-up's numbers as substituting for it.

## How to reproduce

```
python3 "tasks/T120-semantic-routing/4 log/resolve_governs_summaries.py" \
  /path/to/eval_dataset.json "tasks/T120-semantic-routing/4 log/recall-dev-data/governs_summaries.json" \
  /tmp/step1.json
python3 "tasks/T120-semantic-routing/4 log/fix_ground_truth.py" /tmp/step1.json /tmp/step2.json
node "tasks/T120-semantic-routing/4 log/run_recall_dev_v2.mjs" /tmp/step2.json /tmp/out.json
node "tasks/T120-semantic-routing/4 log/run_recall_dev_v2.mjs" /tmp/step2.json /tmp/out_llm.json SEEN_LLM
```

`eval_dataset.json` (the un-fixed v1 harness input, with real ADR text + real embeddings) is the
only large input not re-committed here (it is v1's own `eval_dataset.json`, built by v1's fetch +
`embed.py` pipeline, unchanged by this pass); the FIXED output of the full pipeline IS committed at
`4 log/recall-dev-data-v2/eval_dataset_fixed_final.json` (4.3 MB, includes the 384-dim embeddings)
so this measurement is independently re-runnable without re-fetching or re-embedding anything.
