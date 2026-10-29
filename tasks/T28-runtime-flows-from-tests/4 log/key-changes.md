# T28 key changes (R2: the key is not edited; disputes and label errors are recorded here for the reviewer)

```notes
E16 label "exercised = no" is wrong (found 2026-10-29 by the first full bench run, not by editing the key)
    key says            ElementsDelta.validate -> ElementsDelta.satisfiesRemoval not exercised by align/zindex/flip tests
    recorded            the edge, in every test of all 3 files (flows-0 store, bench note "labelled not exercised but recorded")
    why the label erred I only looked for tests that delete an element through the UI; elements also leave the store
                        snapshot when a test replaces or resets the scene (render / API.setElements / populateElements),
                        which yields removed-element deltas -> validate(delta, "removed", satisfiesRemoval) (delta.ts:1087)
    effect on M20       none: E16 is outside the recovery denominator either way (if it were relabelled exercised,
                        it is recorded, so recovery would go up, not down); it is a real call, so not invented
    repro               node packages/flows/dist/bench/m20.js --repo excalidraw --runs 1  -> "note E16 labelled not exercised but recorded"
    proposed ruling     keep the key frozen; count E16 as a key labelling error of the hand trace
```
