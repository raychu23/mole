# T71 held-out result v2 (review-1 fix: rebuilt eval set, losses first, reported once)

Scored once on 2026-11-03 against eval-set-v2.json (sha256 in eval-set-v2.sha256), after the dev/held-out split was fixed (see eval-set-build.md's report for how the split and both signals were built).

dev alpha search (tuned on dev split ONLY, both signals combined, before touching held-out): best alpha = 0.2, dev MRR = 0.558

## Held-out (scored once, strong and weak signal reported SEPARATELY -- never merged into one number)

### Strong (authored relation: supersedes/amends) signal held-out (n=2)

**Small-n caveat (stated plainly, not glossed over): with n<10 the Wilson 95% CI below is wide; a
result here is directional, not a strong statistical claim either way.**

| matcher | recall@5 | 95% CI (Wilson) | MRR | ranks |
|---|---|---|---|---|
| BM25 (baseline) | 1.000 | [0.342, 1.000] | 0.667 | [3, 1] |
| title+body hybrid (custom, alpha=0.2) | 1.000 | [0.342, 1.000] | 0.667 | [3, 1] |

**Strong (authored relation: supersedes/amends): custom matcher did NOT beat BM25 on held-out (tie counts as not-beating).**

### Weak (same-scope, no authored relation) signal held-out (n=3)

**Small-n caveat (stated plainly, not glossed over): with n<10 the Wilson 95% CI below is wide; a
result here is directional, not a strong statistical claim either way.**

| matcher | recall@5 | 95% CI (Wilson) | MRR | ranks |
|---|---|---|---|---|
| BM25 (baseline) | 0.333 | [0.061, 0.792] | 0.206 | [7, 3, 7] |
| title+body hybrid (custom, alpha=0.2) | 0.667 | [0.208, 0.939] | 0.219 | [5, 3, 8] |

**Weak (same-scope, no authored relation): custom matcher BEAT BM25 on held-out (tie counts as not-beating).**

## STOP rule verdict (unchanged: custom matcher must beat BM25 on held-out, or BM25 ships)

The custom matcher did NOT beat BM25 on held-out (strong signal, the primary one; weak signal reported above for completeness). Per the task's STOP rule, BM25 ships unmodified (route/bm25.ts, already what recall.ts calls); the hybrid was explored, did not beat it, not adopted.

**Caveat (stated plainly): held-out strong-signal n=2, weak-signal n=3. This is the full set of real relation pairs loadGraph itself extracts (plus a supplementary full-text scan for the two phrasings the shipped ADR-dir regex misses -- see eval-set-build.ts's comment) across every vendored ADR/MADR/adr-tools/spec-kit/.mole-format corpus in the repo, not a subsample -- but it is still a small-n result. Treat the verdict as directional, not a strong statistical claim, exactly as the dev/held-out split and the Wilson CIs above show.**
