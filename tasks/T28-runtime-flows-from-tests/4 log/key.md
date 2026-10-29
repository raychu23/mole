# T28 M20 key (R1: written before any recorder code)

```notes
key                     packages/flows/bench/m20-key.json (committed: no private text in it)
    sha256              a2d75d6778d969de0aec019106a381c6b534608a147895ad52ea0a95d7d09d30
    written             2026-10-29T05:31:53-05:00, by the T28 implementer, before src/ had anything but throwing stubs
    items               50 call edges (25 dynamic, 25 static) + 11 non-edges · Mole 15 edges + 3 non-edges, Excalidraw 35 + 8
    pinned              Mole 5b447f7 (branch base) · Excalidraw e7b5346 (shared read-only clone, install log ended "exit 0")
    test files          Mole: agentstate/test/agentstate.test.ts, questions/test/questions.test.ts, indexer/test/indexer.test.ts
                        Excalidraw: element/tests/align.test.tsx, element/tests/zindex.test.tsx, excalidraw/tests/flip.test.tsx
how made                hand trace, not the recorder: for each edge I read the call site (evidence column, file:line) and
                        the test that reaches it (test name / helper chain), and labelled exercised yes/no. Candidates were
                        found with a throwaway scan for "function passed as a value" sites (TS checker) plus reading the
                        Excalidraw action manager, Scene, Store/delta and zindex code; the scan only proposed, labels are by hand.
                        Every id was checked to exist as a node of the static graph (@mole/indexer) before freezing.
    exercised = no      E16 validate->satisfiesRemoval (no test in the 3 files deletes an element) · E25 formatRun->stepLine
                        (reached only through the spawned CLI). Neither counts in the recovery denominator.
    uncertainty         E13/E14/E18/E19 (store/delta callbacks) assume the align test's drawing + aligning makes durable
                        store increments with added and updated elements; read from store.ts:183-245 + delta.ts, not run.
static misses           computed by the bench (TsIndexer calls edges, Mole with @mole/* mapped to src so cross-package
                        calls resolve), not assumed: at freeze time E24 (test file -> clickable) is also a static edge, so
                        the recovery denominator is 22 dynamic edges.
definition              in the key ("definition"): caller = the node the static graph attributes the calling code to;
                        constructors are the class (or Base.constructor via super()); a registry lambda counts as its variable
invented                recorded edge = a key non-edge, or an id that is not a static-graph node -> invented. Recorded edges
                        touching key symbols that are neither key edges nor static edges are written to
                        .mole/local/bench/m20-details.json "unverified"; each is hand-checked against the source after the
                        run and the result is recorded in 2 insights.md (a not-real one counts as invented).
check                   packages/flows/bench/m20.ts reads the key, verifies 50 edges / ~half dynamic / written in the past,
                        and the Excalidraw clone sha; R2: the key and packages/flows/test/flows.test.ts are not edited after
                        the red commit (changes go to key-changes.md)
```
