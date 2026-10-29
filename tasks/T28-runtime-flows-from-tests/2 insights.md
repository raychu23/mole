# T28 insights

```notes
assumptions (Raymond away, nobody to ask)
    store                   .mole/local/flows/ (gitignored): run.json (meta) + tests/*.json (one per test file per worker)
    test sets               M20 uses 3 Mole + 3 Excalidraw test files (key "repos"), not whole suites: the bench runs
                            each set 6 times (3 plain + 3 instrumented) and must stay minutes, not an hour
    static graph of Mole    indexed with @mole/* mapped to packages/*/src (bench/mole-graph.tsconfig.json); without it,
                            cross-package calls are unresolved and would count as "dynamic misses" that are not dynamic
    edge semantics          lexical caller, like the static graph: a lambda's calls belong to the node that contains it;
                            calls through library code (Array.map, EventEmitter.emit, React) count for the innermost repo
                            frame; a callback run later by the event loop is a root. Written into the key "definition".
    red stubs               src/index.ts exports the API with throwing stubs so tsc -b and the bench compile (T18 pattern)
