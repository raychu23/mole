# T11 key / check observations (R2: nothing in the key or red tests was edited)

```notes
2026-10-28 21:26  bench recall wording            no key change
    observation             m1.js counts a note that could not be placed as "flagged", so the red run prints recall 100% (136/136) while every note failed
    why it is not loosening  at_target also requires "notes not placed 0" and synthetic exact t/t, so the red run still exits 1; the detail field carries "notes not placed 1294"
    reviewer                 read recall together with the detail field; not edited (R2/R7)
2026-10-28 21:26  runs.jsonl red line "check" field   log formatting only
    observation             run-check.sh's regex caught "Failed Tests 12 ⎯⎯" instead of the summary; regex fixed in run-check.sh, the red line's check field rewritten to the summary vitest printed in that run ("Tests 12 failed | 62 passed (74)")
```

```notes
2026-10-28 22:02  CLI test timeout (proposed, NOT applied; needs a fresh reviewer's ruling)
    test                    packages/memory/test/memory.test.ts > 'mole note add / mole memory --json via the CLI' (red commit 8a065c6), vitest default 5 s timeout
    observed on main        npm run check 7 runs 21:48-22:01: 4 failed 1 test (this one 4x; once also history CLI test; once apps/vscode debounce), load avg 23-38
                            load is outside Mole: RStudio rsession 185% + 94%, a RooGen pilot.py, Hermes renderer (ps -r 22:01)
    cause                   3 sequential node CLI spawns, each loads the TypeScript compiler (~0.35 s idle); x4 under contention + parallel vitest workers > 5 s
    already done            cli.ts lazy-loads memory/history/server (check 0.45 → 0.11 s, help 0.10 s); memory still needs typescript (0.36 s)
    proposal                give that one test an explicit timeout (e.g. 20_000) — the assertions stay identical, only wall-clock budget changes
```
