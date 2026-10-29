# T11 key / check observations (R2: nothing in the key or red tests was edited)

```notes
2026-10-28 21:26  bench recall wording            no key change
    observation             m1.js counts a note that could not be placed as "flagged", so the red run prints recall 100% (136/136) while every note failed
    why it is not loosening  at_target also requires "notes not placed 0" and synthetic exact t/t, so the red run still exits 1; the detail field carries "notes not placed 1294"
    reviewer                 read recall together with the detail field; not edited (R2/R7)
2026-10-28 21:26  runs.jsonl red line "check" field   log formatting only
    observation             run-check.sh's regex caught "Failed Tests 12 ⎯⎯" instead of the summary; regex fixed in run-check.sh, the red line's check field rewritten to the summary vitest printed in that run ("Tests 12 failed | 62 passed (74)")
```
