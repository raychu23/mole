# T55 prior art — bulk graph construction (2026-11-02)

## Summary
Reuse Mole's existing validated `buildGraph` and full `runGrounded` once at initialization; keep incremental invalidation for later edits. Do not replay incremental invalidation for every edge of a graph that already exists. This is initialization/derived-state separation, not a new argumentation algorithm. No new dependency is justified for this small constructor fix.

```notes
field        bulk graph construction / derived-state initialization
sources      fetched full primary sources into research/ before code; URLs and byte counts in research/sources.json
    NetworkX DiGraph source     constructor initializes adjacency storage then converts incoming graph data
    NetworkX convert source     from_edgelist constructs graph then populates edges, not an expensive reasoner per edge
    CPython graphlib source     collect predecessor graph first, prepare ready state afterwards
    Graphology Graph source     validates/imports nodes and edges; this library emits mutations but does not run our semantic evaluator
    Boost adjacency_list docs   range-of-edges constructor builds vertices + edges from an existing graph
fit          Mole constructor currently invokes public addArg/addAttack, each recomputing graph labels
             borrowed principle: build adjacency first; initialize derived labels once
             reuse local buildGraph validation and runGrounded, not install Python/C++/Graphology in a TS engine
against      batching only valid when initial graph already supplied; public edits still need incremental recomputation
             filtered raw attacks must be retained so later remove/re-add remains coherent
test         constructor avoids per-edge public mutators; dense saved ICCMA case finishes, labels equal full evaluation
             after attack edits, with cycles/self-attacks/duplicate edges/value filtering/empty and invalid inputs
baseline     one saved dense graph previously skipped: 5,178 arguments and 134,016 attacks
```
