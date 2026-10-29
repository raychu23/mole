```notes
T19 key-change request 1      mole-builder-2      2026-10-29 01:40 CDT      waits for the coordinator / reviewer (R2)
    item                    m9-key.json thresholds.renamedChangedMin = 0.55 (body similarity alone) vs the M9 target >= 95% right, 0 wrong
    status                  NOT changed. implementation follows the key as written: M9 right 88.9% (32/36), wrong 0, silent-fresh 0, synthetic 10/10
    evidence                4 misses are hand-labelled rename+change rewrites whose similarity (key measure: token-bigram Dice, own name -> $SELF) is below 0.55
                                excalidraw-51ca8abd-16 isOutsideViewPort -> doBoundsExceedViewport              0.395   (its caller was renamed too)
                                excalidraw-3f5fdec0-12 normalizeGroupElementOrder -> defragmentGroups          0.444
                                excalidraw-a9186480-78 getRenderOpacity -> resolveElementRenderState           0.448
                                excalidraw-c10499ee-86 renderHoveredArrowTextAnchor -> renderTextToolHover     0.499
                            the closest negatives that are their old symbol's best one-to-one match: 4850bf33-85 0.510, d331bb49-55 0.464
                            → no body threshold reaches 95% (35/36) with 0 wrong: 0.499 positive < 0.510 negative
                            measured with node + declsOfText over the key's pairs (scratch tsim.mjs); numbers also visible in m9.js --details
    why not just fix it     lowering 0.55 after seeing results loosens a check (R7); a second, below-threshold path adds a constant chosen after the run
                            and the task brief says below the threshold → deleted/orphaned
    option A (proposed)     allow 'renamed + changed' between 0.40 and 0.55 only with call-graph evidence: >= 1 surviving caller of the old name now calls
                            the candidate, one-to-one (no rival vanished symbol), never for tiny bodies; outcome is always stale
                            measured as a throwaway patch of dist/ (reverted, not committed): right 97.2% (35/36), wrong 0, silent-fresh 0, synthetic 10/10
                            risk: 0.40 is fitted on this key; would need fresh held-out renames (e.g. another repo) to trust it
    option B                keep 0.55 and accept M9 = 88.9% as the honest result (rewrites below 0.55 read as deleted/orphaned, the safe side)
    option C                reviewer re-judges the 4 labels (they are judgment calls: generalizations/rewrites); I labelled them before writing code and did not change them
```
