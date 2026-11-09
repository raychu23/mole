# T119 prior art: confidence-gated fallback / selective prediction (cascades, deferral, retrieval abstention)

Design study only, no code. Dated sources, recent first.

1. **Bacellar, "Predictable Failure in Multi-Hop Retrieval: Score-Distributional Confidence Scoring and
   Abstention"** (arXiv:2609.22056v2, posted 2026, revised 18 Oct 2026). Retrieval failures cluster in
   structurally predictable subpopulations; a calibrated Retrieval Confidence Score (logistic over
   query/ANN-score-distribution features, zero extra LLM calls) drives an abstain/escalate decision.
   Directly on point for Q12's trigger half: "low margin" is exactly a score-distribution confidence
   feature (their Score Gap s1-s2 family), not raw magnitude. Relevant warning used below: their own
   prior finding (Holdcroft et al., next item) is that raw top-score magnitude is a weak abstention
   signal on reasoning-heavy, not pure lexical-overlap, misses -- close to Mole's "ADR never names the
   file" miss type.

2. **Holdcroft, Abdallah, Jatowt, "The Magnitude Mirage: Rethinking Confidence for Reasoning-Intensive
   Retrieval"** (arXiv:2609.15578, 2026). Across 11 retrievers / 28 datasets: raw top-score magnitude
   abstention collapses toward random on reasoning/constraint-violating-but-lexically-similar queries;
   Score Gap (s1-sk, i.e. exactly route.ts's `top1/(top1+top2)` margin shape) beats magnitude by a large
   margin on exactly this failure mode. Used below to frame why a margin-gated trigger can catch
   *ambiguous* misses but is not expected, by this paper's own finding, to catch misses where the top
   candidate is confidently wrong because of a conceptual (not lexical) mismatch -- T118's "new file the
   ADR text never names" miss type.

3. **Anonymous, "Know Before You Fetch: Calibrated Retrieval-Budget Allocation for RAG"**
   (arXiv:2606.29959, 2026). Formulates adaptive-k/abstain RAG as calibrated-probability budget
   allocation (closed-book / k=1 / k=5 / abstain) instead of raw uncertainty thresholds; reports that
   gating is not uniformly cheaper (latency can increase 27% on a small reader) -- the direct analogue of
   this task's "extra cost" question: escalating is not free even when it's the right call, and the
   net win depends on how often the gate fires, which is exactly what section 2 below measures.

4. **Taguchi et al., "Efficient Context Selection for Long-Context QA: ... Adaptive-k"** (EMNLP 2025;
   arXiv:2506.08479, accepted main 2025, revised Sep 2025). Single-pass adaptive-k: look at the gap in
   the similarity-score distribution to decide how many passages to keep, no iterative LLM calls, up to
   10x fewer tokens than full-context while keeping ~70% of relevant passages. Model for Q12's "wider
   candidate set" action: widen k adaptively from the SAME score distribution that already triggers the
   gate, rather than jumping straight to "all decisions" (which this task's numbers below show is
   closer to RAG's full cost than to Mole's current router cost).

5. **Dekoninck, Baader, Vechev, "A Unified Approach to Routing and Cascading for LLMs" ("cascade
   routing")** (arXiv:2410.10347, submitted 14 Oct 2024, revised through 2026). Formalizes LLM
   cascading (sequentially escalate to a stronger stage only when a cheap stage's own quality estimator
   is below a threshold) and proves an optimal-threshold condition; explicitly names "good quality
   estimators" (here: BM25 top1/(top1+top2), i.e. the router's existing `confidence`) as the critical
   factor determining whether cascading/routing helps at all. route.ts's own `confidenceRatio` gate
   (stage1 BM25 -> stage2 listwise LLM) is already a 2-stage cascade in this sense; Q12 proposes a THIRD
   stage (wider-candidate-set + full-text judge) gated on the same quality estimator.

6. **Chen, Zaharia, Zou, "FrugalGPT: How to Use Large Language Models While Reducing Cost and Improving
   Performance"** (arXiv:2305.05176, submitted May 2023; TMLR 2024). Canonical LLM-cascade paper: a
   cheap model's own reliability score decides whether to accept its answer or escalate to the next,
   more expensive model/stage, learned per-query thresholds rather than one global cutoff. Prior art
   T53/T49 already cite for the cascade shape; cited again here because Q12's design is the same
   cascade pattern one tier further out (router confidence gates a 3rd, pricier tier), and FrugalGPT's
   own numbers (50-98% cost savings only when the cheap stage is reliable on MOST queries) is the
   caution this task's section 2/3 numbers bear out: Mole's dev data shows the cheap stage is NOT
   reliably separable from the cases that need the expensive tier (section 2's FA-risk/no-benefit
   overlap), unlike FrugalGPT's favorable regime.

7. (classic, foundational) **Mohri, Rostamizadeh, Cortes, "Learning with Rejection"** (ALT 2016, cs.NYU
   pub cs.nyu.edu/~mohri/pub/rej.pdf) and **Madras, Pitassi, Zemel, "Predict Responsibly: Improving
   Fairness and Accuracy by Learning to Defer"** (NeurIPS 2018). Foundational selective-prediction /
   learning-to-defer framing: a classifier (or router) that abstains/defers when its own confidence is
   below a learned threshold, trading coverage for accuracy. Cited because the PRE-REGISTER step below
   (thresholds chosen on dev, evaluated on a frozen held-out set, never re-tuned after seeing it) is
   this literature's standard protocol for a deferral threshold, not a Mole-specific invention.

## Framing for this task

Q12's proposed mechanism is not new relative to T53/T49's own cascade (stage1 BM25 -> stage2 listwise
LLM already gates on the identical `confidence = top1/(top1+top2)` formula at ratio 0.75, route.ts:174).
What's new is (a) a SEPARATE "no decision routes" trigger (bm25Candidates.length === 0, currently routed
as confidence=1 / no escalation at all, route.ts:167-169) and (b) swapping the escalation's CONTENT from
the router's own lightweight listwise prompt (title+one-line-summary only) to the cascade's stricter
`ESCALATE_PROMPT` (cascade.ts:44-55: full decision text + real diff, VERDICT: VIOLATES/COMPLIANT), over a
WIDER candidate set than the router's topK=5 window. Items 1-2 above predict this should help genuinely
ambiguous (close-margin) misses but not the conceptual "new file never named" miss type T118 already
confirmed in 3/4 of B2 v4.2's real held-out misses; items 3-6 predict the net cost/benefit depends
entirely on how cleanly the margin threshold separates misses from correct picks AND from 'none' cases --
measured directly on dev data in `4 log/design.md` section 2.
