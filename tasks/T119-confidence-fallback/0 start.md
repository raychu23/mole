status (2026-11-08)  DESIGN STUDY DONE, no code changed. Recommendation: NO-GO on Q12 as specified;
                      conditional narrow pilot proposed (section 5/6 of design.md) for a future task.
owner: queue-agent-q12
repo: /Users/a1/Desktop/CS Code/Project/Mole
branch: ledger/t119-confidence-fallback
base: main

```notes
T119-confidence-fallback   Q12 (queue/brief.md)
    goal              Design study (no code): can a confidence-gated fallback -- escalate to a wider
                      candidate set (or all decisions) with the stricter T53/cascade escalation prompt
                      when the router's top-score margin is low or no decision routes -- close Mole's
                      recall gap to RAG reads-all (B2 v4.2a: 0.700-0.765 vs 1.000) without reproducing
                      RAG's higher false-alarm rate? Dev-only (v3 dev, v4.1 dev); B2 v4.2 held-out
                      untouched.

    prior-art         4 log/prior-art.md, 7 dated sources recent-first: retrieval score-distribution
                      confidence/abstention (Bacellar 2026, Holdcroft et al. 2026), calibrated
                      retrieval-budget allocation (arXiv:2606.29959, 2026), adaptive-k (Taguchi et al.,
                      EMNLP 2025), cascade routing (Dekoninck et al. 2024), FrugalGPT (Chen et al.
                      2023/TMLR 2024), learning-to-defer/reject (Mohri et al. 2016, Madras et al. 2018).

    method            4 log/measure_margin_dev.mjs: re-scores v3 dev (62) + v4.1 dev (40) with
                      route.ts's own BM25 index + margin formula (top1/(top1+top2)), no boosts (deployed
                      default). Raw rows 4 log/margin_rows_dev.json, console 4 log/margin_dev_output.txt.
                      Cost reference (existing held-out run outputs, cost-only, not an accuracy claim):
                      4 log/cost_reference.py + _output.txt.

    key findings      (1) the "no decision routes" (zero BM25 candidates) trigger NEVER fires on either
                      dev split -- unmeasurable, flagged NOT RUN. (2) no margin threshold in 0.55-0.75
                      cleanly separates misses from 'none' cases: catching 78-100% of dev misses escalates
                      57-100% of 'none' cases too (FA risk, RAG's own failure mode). (3) only 5/18 (28%)
                      of dev misses are outside the router's EXISTING top-5 escalation window -- "widen to
                      all decisions" is overbuilt for the other 72%. (4) extra cost at a useful threshold
                      approaches RAG's own $/check on ~81% of pooled dev cases (design.md §3).

    recommendation    NO-GO on Q12 as specified (design.md §6). Narrow pilot proposed: margin<0.55 only
                      (drop the unmeasurable zero-candidate trigger), candidate width capped <=20 via the
                      EXISTING batched MULTI_ESCALATE_PROMPT, run once on a NEW frozen held-out set
                      (design.md §5) -- not built or run by this task.

    boundary          design/analysis only; no packages/decisions/** changes.
    harness           hermes
```
