# T119 design study -- confidence-gated wider-candidate-set fallback (Q12), DEV-ONLY, NO CODE

```notes
status   DESIGN STUDY ONLY. No code changed, no router/cascade behavior changed. Dev-only numbers
         (v3 dev n=62, v4.1 dev n=40). B2 v4.2 held-out stays untouched and unused for tuning.
```

## 0. The question, restated precisely

Router's current `confidence = top1/(top1 + top2)` (route.ts:172-174) already gates BM25-only vs. a
listwise LLM pick at `confidenceRatio` (default 0.75, over the top-5 BM25 candidates only). Q12 asks: if
instead (a) a THIRD trigger ("no decision routes" = zero BM25 candidates, currently never escalated --
route.ts:167-169 returns confidence=1 early) and (b) escalation runs against a WIDER candidate set (more
than top-5, up to "all decisions" in the repo) using the cascade's STRICTER per-decision prompt
(`ESCALATE_PROMPT`, cascade.ts:44-55: full decision text + real diff, not the router's own
title+summary-only `LISTWISE_PROMPT`) -- can Mole close its recall gap to RAG-reads-all (B2 v4.2a:
Mole recall 0.700-0.765 vs RAG 1.000, FA gap still significant at p=0.0078/0.0313) without reproducing
RAG's higher false-alarm rate?

## 1. What dev data can and can't answer

T118 already established (on the FROZEN v4.2 held-out set, not reused here) that of B2 v4.2's 4 real
misses, 3/4 are brand-new or existing files the ADR's own text NEVER names (conceptual/semantic misses --
"lexical routing can't fix them" by construction, no path/identifier signal of any kind exists to widen
toward). That finding stands and is not re-derived here. What THIS task adds, from dev data only, is: of
the misses dev data DOES have, how many are separable from correct picks and 'none' cases by the
router's own margin -- i.e., is the proposed TRIGGER even selective enough to be worth building, before
asking whether the wider-candidate-set ACTION would fix them.

## 2. Margin analysis on v3 dev + v4.1 dev

Method: `4 log/measure_margin_dev.mjs` re-scores the SAME dev cases T118's `measure_baseline_recall.mjs`
already measured (identical BM25 index-building code, same corpora, scopeBoost/mentionBoost both OFF --
this is the router's deployed default), adding per-case `margin = top1/(top1+top2)` (route.ts's own
formula) and `zeroCandidates` (bm25Candidates.length === 0, route.ts's existing "no decision routes"
early-return). Raw rows: `4 log/margin_rows_dev.json`. Full console output: `4 log/margin_dev_output.txt`.

**Finding 1 -- the "no decision routes" trigger never fires on dev.** Zero cases (0/72 with-target rows,
0/30 'none' rows, pooled) have `zeroCandidates = true` on EITHER dev split. BM25 with a real ADR/decision
corpus always returns >=2 nonzero-score candidates for every dev case. This means dev data cannot
estimate the "no decision routes" half of Q12's trigger at all -- it is a genuine gap, not a zero result;
flagged as **NOT MEASURABLE from dev, NOT RUN**, same as T118's held-out protocol being pre-registered
rather than run. (It may well fire on the conceptual-miss cases T118 found on v4.2 held-out, since "ADR
never names the file" is exactly the condition that could also produce near-zero lexical overlap -- but
checking that needs the frozen held-out set, which this task does not touch.)

**Finding 2 -- recall@1 misses vs. margin, pooled dev (n=18 misses / 72 with-target / 30 'none', out of
102 total dev cases):**

| margin threshold (escalate if margin < t) | misses caught | 'none' cases ALSO escalated (FA risk) | correct picks ALSO escalated (pure extra cost) |
|---|---|---|---|
| 0.55 | 14/18 (78%) | 17/30 (57%) | 10/54 (19%) |
| 0.60 | 16/18 (89%) | 19/30 (63%) | 17/54 (31%) |
| 0.65 | 17/18 (94%) | 23/30 (77%) | 25/54 (46%) |
| 0.70 | 18/18 (100%) | 27/30 (90%) | 38/54 (70%) |
| 0.75 (= today's `confidenceRatio` default) | 18/18 (100%) | 30/30 (100%) | 46/54 (85%) |

(v3 dev and v4.1 dev split out in `4 log/margin_dev_output.txt`; v4.1 dev alone separates a little better
at low thresholds -- e.g. 0.55 catches 4/8 misses at only 2/8 'none' escalated -- but the pooled numbers
are what a single pre-registered threshold has to work across, since the real deployment sees both
decision-text styles.)

**Reading this table**: at 0.75 (today's existing stage-2 gate, already live), the router ALREADY
escalates every single recall@1 miss AND every single 'none' case AND 85% of its own correct picks --
i.e. today's gate is not selective at all, it escalates almost everything. Lowering the threshold trades
miss-recovery for selectivity, but even the MOST selective useful point (0.55) still drags 57% of 'none'
cases and 19% of correct picks into the expensive tier alongside 78% of real misses. **There is no
margin threshold in this sweep where misses are cleanly separated from 'none' cases** -- the two
distributions overlap almost completely in the mid-0.50 range (most miss margins cluster at 0.50-0.55,
see the per-case detail below; most ambiguous 'none' cases cluster there too, for the same reason: BM25
scores several near-equally-irrelevant decisions almost identically when nothing good matches).

**Finding 3 -- WHERE the wider-candidate-set action would actually matter.** Of the 18 pooled misses,
only **5/18 (28%)** have the true target ranked beyond the router's EXISTING topK=5 window (ranks 6, 19,
20, 26, 6 -- `v3-pt-millisecond-compliant`, `v3-easi-typescript-violate`, `v3-easi-typescript-compliant`,
`v3-easi-cra-compliant`, `v4-hb-0001-violate`). The other **13/18 (72%)** already sit within rank 2-5,
i.e. within the candidate window the router's EXISTING (already-live) stage-2 listwise LLM call already
sees -- for those, "widen the candidate set" buys nothing; the question for them is only whether the
listwise pick itself is accurate, a different question this task does not re-measure. **This means Q12's
specific lever (widen beyond top-5 / go to "all decisions") is only structurally relevant to ~28% of
dev misses**, not the 78-100% the margin-trigger table above might suggest at first glance.

## 3. Extra cost estimate

Real $/check numbers read verbatim from existing raw held-out run outputs (cost-only reference, NOT an
accuracy claim, NOT a re-run; `4 log/cost_reference.py` + `4 log/cost_reference_output.txt`):

| arm | mean $/check | escalates on |
|---|---|---|
| RAG reads-all (v4.1 heldout, full decision-set text every check) | $0.0479 (max $0.0876) | always (100%) |
| T53 cascade today, v4.1 heldout (BM25 route + listwise/escalate as currently wired) | $0.0113 total ($0.0013 route-only, $0.0120 when it escalates) | 35/42 (83%) |
| T53 cascade today, v3 heldout | $0.0054 total ($0.0013 route-only, $0.0056 when it escalates) | 66/89 (74%) |

The proposed stricter `ESCALATE_PROMPT` (full decision text + diff, cascade.ts's own tier-1 call) over a
WIDE candidate set is architecturally the SAME shape as the RAG arm restricted to the candidate set --
its per-check cost scales toward RAG's $0.048-$0.088/check as the candidate set widens toward "all
decisions" (more full-text decisions in the prompt = more input tokens, the same driver of RAG's own
cost). At the 0.70 threshold (needed to catch 100% of dev misses), **70% of correct picks and 90% of
'none' cases would ALSO pay this cost** on top of the 18 misses -- i.e. roughly 83/102 pooled dev cases
(81%) would escalate to something RAG-shaped. That is not a cascade saving a cheap stage's cost on most
queries (FrugalGPT's favorable regime, prior-art.md #6); it is reproducing RAG's cost on most queries
while keeping Mole's name on it.

## 4. Does it close the recall gap without RAG's false alarms?

Even granting the OPTIMISTIC case -- the wider-candidate-set + full-text judge perfectly recovers every
miss it's given a chance at (an assumption this design study cannot verify without actually running the
LLM judge, which is out of scope for a no-code design study) -- the mechanism only has a *structural*
chance to help the 5/18 (28%) misses that are outside the current top-5 window (Finding 3) PLUS whatever
fraction of the 13/18 in-window misses the stricter full-text prompt reads better than the current
title-only listwise prompt (unmeasured; plausible but not demonstrated here). Meanwhile it drags in
57-100% of 'none' cases (Finding 2) into a judge call that reads full ADR text + diff and is asked
VIOLATES/COMPLIANT -- exactly RAG's own prompt shape and (per B2 v4.2a's measured RAG FA rate of
0.25-0.30 under the SAME judge posture) exactly RAG's own false-alarm risk profile, on the very cases
where Mole's current conservatism (FA rate 0.10-0.12, B2 v4.2a) is its whole value proposition relative
to RAG. **A margin-gated fallback that triggers on most 'none' cases imports RAG's false-alarm exposure
onto exactly the subset of checks the gate can't tell apart from a real miss** -- the overlap in Finding
2 is the mechanism, not a corner case.

## 5. Pre-registered thresholds (for a future, properly run held-out test -- NOT run by this task)

If a narrower, bounded pilot is run later (own task, own branch, own frozen held-out comparison), these
are the dev-derived candidates to pre-register, in order of preference:

- **Primary candidate: margin < 0.55 AND candidateCount > 0** (i.e. margin-trigger only, "no decision
  routes" trigger excluded since dev shows it's unmeasurable and untested) -- catches 78% of dev misses
  at the lowest 'none'-escalation rate (57%) and lowest extra-correct-pick cost (19%) in the sweep.
- **Candidate set width: capped at the FULL repo corpus, never literally unbounded** -- dev candidateCount
  tops out at 35 (easi-app); cap at e.g. 20 candidates/call with `MULTI_ESCALATE_PROMPT`'s existing
  per-decision budget split (cascade.ts:69-82, already built, already handles N>1 decisions in one call)
  rather than N separate full-text calls, to avoid the N-separate-calls cost blowup T49's ledger already
  found and fixed once (prior-art.md item 6, cascade.ts:68-72 comment).
- **Report separately, not pooled:** miss-recovery rate, 'none'-escalation (FA-risk) rate, and $/check,
  exactly the three numbers this task reports on dev, so a held-out run's result is directly comparable
  to this design study's prediction.

## 6. Recommendation: NO-GO (as specified), conditional narrow pilot only

**NO-GO** on building Q12 as specified (margin-gated escalation to "all decisions" with the stricter
cascade prompt), for three dev-measured reasons:

1. No threshold in the 0.55-0.75 sweep separates real misses from 'none' cases (Finding 2) -- any
   threshold selective enough to catch most misses (>=0.65) also escalates >=77% of 'none' cases, which
   on the stricter full-text VIOLATES/COMPLIANT prompt is RAG's own false-alarm mechanism, undermining
   the entire reason B2 prefers Mole over RAG (lower FA, p=0.0078/0.0313).
2. The "no decision routes" trigger (half of Q12's proposed gate) literally never fires on either dev
   split (Finding 1) -- it cannot be tuned or validated from available data; shipping it would be
   un-pre-registered guesswork on exactly the kind of decision T118's review process exists to prevent.
3. Only 5/18 (28%) of dev misses are structurally outside the router's EXISTING top-5 escalation window
   (Finding 3) -- "widen to all decisions" is overbuilt for 72% of the misses it's aimed at, and its cost
   (Section 3: ~81% of pooled dev cases would reach RAG-shaped per-check cost) is paid regardless of
   which 28%/72% split a given real case falls into, since the trigger can't tell them apart in advance.

**Narrow pilot, if pursued (separate task, own branch):** margin < 0.55 trigger only (no zero-candidate
trigger), capped candidate width (<=20, batched MULTI_ESCALATE_PROMPT), run ONCE on a newly frozen
held-out set (not B2 v4.2, already spent) with the three numbers from section 5 reported before any
"it works" claim, per AGENTS.md's loss-first / never-fabricate-a-number contract.
