# T71 held-out result (losses first, reported once)

Scored once on 2026-11-03 against the frozen eval set (sha256 in eval-set.sha256), after the dev/held-out split was fixed.

dev alpha search (tuned on dev split ONLY, before touching held-out): best alpha = 0, dev MRR = 0.750, dev ranks (hybrid) = [1, 2], dev ranks (baseline) = [1, 2]

## Held-out (scored once)

| matcher | recall@5 | MRR | ranks |
|---|---|---|---|
| BM25 (baseline, route/bm25.ts, unmodified) | 1.000 | 1.000 | [1] |
| title+body hybrid BM25 (custom, alpha=0) | 1.000 | 1.000 | [1] |

**Result: the custom matcher did NOT beat BM25 on held-out (tie counts as not-beating).**

Per the task's STOP rule, we ship BM25 unmodified (route/bm25.ts, already the production code recall.ts calls) and say so: the hybrid was explored, tied on held-out, not adopted.

Caveat (stated plainly): the frozen held-out split has exactly 1 query (3 real superseded-ADR pairs total; 2 dev / 1 held-out -- see eval-set-build.md for why this is the full set of real relevance labels available, not a subsample). A result on n=1 is not a strong statistical claim either way; it is reported as-is, losses first, per the task's own instruction, not dressed up.
