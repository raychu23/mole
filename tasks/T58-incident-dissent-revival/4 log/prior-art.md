# T58 prior art — incidents that revive recorded dissent

## Summary
An incident should not flip a decision by itself. Mature memory systems (Graphiti, ai-memory) find *candidate* facts a new
event may contradict, by graph neighbourhood plus similarity, and leave the change to a later, gated step. In
argumentation terms, "reviving a losing argument" is Dung's reinstatement: add an argument that attacks the dissent's
attackers, and the grounded semantics puts the dissent back in. T58 borrows both: structural candidates + deterministic
text overlap (no LLM), a person accepts or dismisses, and acceptance is a new attack argument in the records.

```notes
source                      what it does                                                     we borrow
Graphiti main@16bf514       get_edge_invalidation_candidates (graphiti_core/search/          candidates must SHARE a node with the new
(Apache-2.0, 2026-10-20     search_utils.py:1598): edges sharing an endpoint with the        event (here: a decision or a scope path),
 v0.31.2)                   new edge, ranked by embedding similarity ≥ min_score, limit      ranked by similarity with a floor; we use
                                                                                             char-3gram Jaccard (T51 dedupe) instead of
                                                                                             embeddings: deterministic, offline
Graphiti + ai-memory        invalidation/supersession is a separate, gated step;             suggest = read-only advice · accept/dismiss
(plan update 11-01 §6)      "flag, don't auto-resolve"                                       = the person's step, both recorded
Dung 1995 (AIJ 77)          an argument is acceptable w.r.t. S if S attacks each of its      accept writes <incident> -> every IN
                            attackers; grounded extension = least fixed point               attacker of the dissent; engine
                                                                                             (@mole/reasoning) reinstates it
Argdown (T48)               `<A>: text` + indented `-> <B>` = A attacks B                   accepted incidents live in
                                                                                             .mole/arguments/incidents.argdown
Mole plan update 11-01 §6   1 event in · 2 find targets · 3 advisory flag · 4 person accepts this task = steps 1-5 · step 6 (draft
                            · 5 re-justify · 6 re-open as a new draft revision (D67)         revision) = run accept inside a
                                                                                             mole-proposals branch (T56)
```

## Fit check
- Graphiti's candidates come from an LLM-extracted entity graph; ours from explicit records (decisions:, scope:, cites,
  attacks). Shared-node rule holds better here (explicit links, no extraction error); similarity is weaker (no
  embeddings) → used only to RANK structural candidates, never to admit one. INFERENCE.
- Reinstatement needs the incident itself to be unattacked; if someone later records a counter-argument, the engine
  re-labels normally. No special case.
