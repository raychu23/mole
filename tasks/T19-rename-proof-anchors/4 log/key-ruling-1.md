```notes
core      T19 key ruling 1 on key-changes.md request 1 (m9-key.json renamedChangedMin 0.55 vs M9 >= 95%)
    verdict                 B now · A only through held-out gate · C rejected (all 4 labels stand)      → §verdict
    labels                  3 clearly right, 1 borderline but defensible, none relabelled      → §labels
    why                     0.40 + caller rule fitted on the frozen key, band holds ~2 negatives, so its 0 wrong says little      → §reasoning
    conditions              frozen key untouched · held-out key from hermes-agent ui-tui first · fixed constants · 1 run · both sets reported      → §conditions
    new                     2026-10-29      first ruling
```
```notes
T19 key ruling 1      reviewer-T19-ruling-1 (fresh session, did not see implementer transcript)      2026-10-29 CDT
    verdict
        B now               m9-key.json stays as is (0.55, body only)      honest M9 on it = right 88.9% (32/36), wrong 0, silent-fresh 0, at_target false
        A gated             call-graph path allowed ONLY if every condition in §conditions holds      else B is final for T19
        C rejected          labels written before code, re-read by me, all 4 stand      relabelling after results would be R7 loosening anyway
    labels                  my own read of each commit in the excalidraw clone (head e7b5346)
        3f5fdec0-12         normalizeGroupElementOrder → defragmentGroups      AGREE rename+change
                            same signature (readonly ExcalidrawElement[]), same sole caller normalizeElementOrder switched, same bail-out guard + error text renamed      only the group-ordering algo rewritten
        51ca8abd-16         isOutsideViewPort → doBoundsExceedViewport      AGREE rename+change
                            same predicate, mathematically equal (viewport coord delta = scene delta × zoom), moved scroll.ts → viewport.ts
                            note: its caller calculateScrollCenter was renamed too, so option A cannot recover it (and 0.395 < 0.40)
        a9186480-78         getRenderOpacity → resolveElementRenderState      AGREE rename+change
                            frame × element opacity + pending-erasure dimming carried over      both call sites (renderElement, App.tsx) switched
                            widened: returns {opacity, offset} not number      offset comes from a new helper, no old symbol merged in → not the "merged" not-rename rule
        c10499ee-86         renderHoveredArrowTextAnchor → renderTextToolHover      AGREE, BORDERLINE
                            old body is verbatim the "arrow" case of a 3-case switch (~1/3 of new body)      sole call site switched      state hoveredArrowTextAnchor → textToolHover
                            closest to the "generalized symbol" not-rename rule, but no other old symbol merged in, so labelRules[1] (callers switched) wins
    reasoning
        1 no body cut works  positives 0.395-0.499 vs negative 4850bf33-85 at 0.510      any single threshold trades a miss for a wrong
        2 A is post-hoc      the 0.40 floor and the caller rule were designed after seeing these 4 misses      measured 97.2% is in-sample, not evidence
        3 tiny band          only 25 must-stay-unanchored old symbols in the key      request names 2 negatives in 0.40-0.55 (0.510, 0.464)      "0 wrong" in the band rests on a handful of cases
        4 circularity risk   labelRules[1] counts "callers switched" as rename evidence      A detects via callers switched      held-out positives must also show body/role continuity
        5 A is sound in kind call-graph neighbors are named in the T19 goal      the rule (surviving caller, one-to-one, stale only, minTokens) fails safe      so worth testing, not worth trusting yet
        6 B is safe side     below-threshold rewrites read deleted/orphaned, never wrong or silently fresh      matches brief "below the threshold → deleted/orphaned"
    conditions              implementer must follow in this order      any skipped step → B
        1 frozen key         never edit packages/memory/bench/m9-key.json, m9.ts or the red tests      body-only floor stays 0.55
        2 held-out key       new file packages/memory/bench/m9-heldout-key.json from ~/.hermes/hermes-agent ui-tui TS/TSX history (read-only, pinned head sha recorded)
                            pairs made mechanically (same rules as m9-key-builder: same-file, git -M, cross-file Jaccard >= 0.5), newest commits first
                            stop rule fixed up front and on label counts only: walk back until >= 20 expected re-anchors (rename or rename+change)
                            hand-labelled with the same 3 labelRules + a reason per pair      each positive reason must cite body/role continuity, not only switched callers
                            no similarity scores, reanchor runs or A code on these pairs before the key commit
        3 commit order       commit A: held-out key + a new bench file (e.g. bench/m9-heldout.ts, key path fixed, same scoring as m9.ts) + written date      no impl change in it
                            commit B (later): the A implementation      the reviewer checks A's sha is after the held-out key's sha
        4 constants fixed    exactly as in key-changes.md: band 0.40 <= sim < 0.55 · >= 1 caller of the old name in the parent that still exists in the child now calls the candidate
                            · one-to-one (no rival vanished symbol / no rival candidate) · never under minTokens 16 · outcome always renamed+changed (stale), never fresh
                            no tuning after the held-out run      1 scored run counts, logged in runs.jsonl
        5 pass bar           held-out: right >= 95%, wrong 0, silent-fresh 0      frozen key with A: wrong 0, silent-fresh 0, synthetic 10/10, no case that was right turns wrong
                            held-out band check: report how many held-out old symbols have best candidate in 0.40-0.55 (pos + neg)      if < 5 → inconclusive → B
        6 headline           report both sets, never 97.2% alone:
                            "M9 frozen key (body-only per key) 88.9% · with call-graph path 97.2% (path added after seeing key) · held-out hermes ui-tui X% (labelled before path), wrong 0"
        7 if gate fails      revert A, keep 0.55 body-only, M9 = 88.9% at_target false, hand-in says target not met      no further threshold or label requests in T19
    reviewer                reviewer-T19-ruling-1
    date                    2026-10-29
    evidence used           git show 3f5fdec0, 51ca8abd, a9186480, c10499ee in excalidraw clone · m9-key.json cases + labelRules · node packages/memory/dist/bench/m9.js --details (32/36, 25 ok-none, 4 miss, right sims 0.576-1.0)
```
