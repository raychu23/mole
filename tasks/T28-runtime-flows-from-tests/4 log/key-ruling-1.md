# T28 key ruling 1 (reviewer-T28-r1, 2026-10-29) on 4 log/key-changes.md "E16 label"

```notes
ruling                  NO EDIT NEEDED. The key stays frozen as committed in 66f2c76 (R2); E16's "exercised = no"
                        is recorded as a hand-trace labelling error, and the bench result stands as reported
finding confirmed       E16 ElementsDelta.validate -> ElementsDelta.satisfiesRemoval IS exercised by the 3 Excalidraw
                        files: the flows-0 store records it in every test (align 50/50, flip 38/38, zindex 20/20)
mechanism (corrected)   not mainly scene replacement as key-changes.md says. The recorded path is
                        History.record -> HistoryDelta.inverse -> StoreDelta.inverse -> ElementsDelta.inverse ->
                        ElementsDelta.create -> ElementsDelta.validate -> satisfiesRemoval.
                        delta.ts:1286-1291 inverse() passes the inverted `added` deltas as `removed`
                        (`ElementsDelta.create(removed, added, updated)`), and create (delta.ts:1085-1088, test env)
                        runs validate(delta, "removed", this.satisfiesRemoval), which calls the callback for each entry
                        (delta.ts:1143-1157). So any test that adds an element and records history exercises E16.
                        Real call, dynamic (callback parameter), not in the static graph -> not invented
why no edit             relabelling to exercised=true moves E16 into the recovery denominator as an edge that is
                        already recorded: 22/22 -> 23/23. The metric verdict cannot change in either direction, so an
                        edit would only spend the R2 freeze for nothing. Report it as "E16 label error, would be 23/23"
evidence                node packages/flows/dist/bench/m20.js (reviewer run, exit 0) -> "note E16 labelled not exercised
                        but recorded: ...ElementsDelta.validate -> ...ElementsDelta.satisfiesRemoval";
                        sample path from .mole/local/flows/bench/excalidraw/flows-0/tests, test
                        "z-index manipulation > send back"
```
