# T22 M14 key (R1: frozen in the red commit, before any implementation commit)

```notes
key                     packages/verify/bench/keys/m14-key.json (committed: no private text, only test names of Mole + Excalidraw)
    sha256              aa433d0f2db6e32b4acf7d5f9e1923b7a76639a4439820ae86ba630e9dc144b1
    written             2026-10-29T11:57:35.727Z (06:57 CDT, `written` field, make-key --freeze)
    made by             packages/verify/bench/make-key.mjs: the repo's own vitest runner, no @mole/verify or @mole/indexer code
                        Mole truth in a detached worktree at 70a2989 (built with tsc -b after each patch); Excalidraw truth in an
                        APFS copy of the coordinator clone at e7b5346
    frozen (10)         m06 telemetryEnabled · m07 symbols tokens (JSDoc) · m08 isStale · m11 missingEvidence · m12 symbolsOfText endLine
                        x02 polygonIncludesPoint · x03 _reverseDarkModeInvert · x04 parseTokens NFC · x06 orderByFractionalIndex · x07 BinaryHeap
    failing tests       3 · 2 · 1 · 5 · 1 · 2 · 7 · 1 · 2 · 5 (all confirmed by 3 flake filters, see README)
    reach (denominator) 57 · 67 · 3 · 3 · 67 · 2470 · 2459 · 2307 · 2256 · 2470 test cases (`vitest related`, patch applied)
    full suite          181 (Mole) · 2632 (Excalidraw) tests run per row
replaced (invalid)      m01 m02 m03 m04 m05 m09 m10 x01 x05: no test fails with the patch (see 2 insights.md); m13, x08 valid but after the
                        first five of their repo in id order. m01-m04, m09, m10 and x01 rows come from the first make-key version (no
                        unpatched-rerun filter); a stricter filter can only remove failures, so they stay invalid
rules                   key `definitions` (caught, failing, reach, share, run all, run none) + packages/verify/bench/README.md
check                   packages/verify/bench/m14.ts refuses a patch whose sha256 differs from the key (R2); target caught >= 9/10 and
                        mean share <= 1/3
red tests               packages/verify/test/verify.test.ts sha256 94e04140bc9ceb115ce137423440163ff9acad21326840091c55012f81be919e
bench                   packages/verify/bench/m14.ts sha256 e17564340bfab1da8dc66256cab8ef764a9bc9d187ea6c9c18981cde5ecffe14
```
