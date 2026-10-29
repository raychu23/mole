
```notes
T21 key-change note 2      mole-builder-3      2026-10-29 05:20 CDT      no key or test edit asked; reading of the key's definition, for the reviewer
    what happened           after merging main, M11 real false alarms went 0/9 → 4/13: chat fc6c6dc0 resumed at 03:33 CDT, its [first, last] window
                            now spans 21:12-03:43, so 4 runs that worked only during its 5-h idle gap became 'parallel' (the key labels them not, or
                            39d6ac07 'not: 79 min gap')
    reading                 key.definition.window = "[first complete step, last complete step]" was written when every key run was one continuous
                            stretch; the labels' reason ('non-overlapping windows', '79 min gap') is about being live at the same time
    code change             liveness = activity segments (complete steps split at idle gaps > N); the [first, last] test stays as a first filter
                            M11 back to recall 16/16, false alarms 0/16 at be95f3c; new test packages/agentstate/test/collisions-gap.test.ts
    bench drift (open)      the real half reads live state.db + today's checkouts, so any key run resuming later changes its input again;
                            proposal for a later ruling: cut each real run at key.written (needs an 'until' option + an m11.ts edit) · not done here
```

```notes
T21 key-change request 3      mole-builder-3      2026-10-29 06:35 CDT      blocks T21's ledger integrate (combined checks on main)
    item                    2 tests owned by integrated tasks, not T21, time out at vitest's default 5 s under outside load:
                                packages/agentstate/test/langgraph-export.test.ts 'CLI: mole run <id> --export langgraph ...' (T20): 3 CLI spawns
                                packages/telemetry/test/key-guard.test.ts 'allows a change only with an APPROVE ruling ...' (T16)
    evidence                fail on main 3cb1485 WITHOUT T21 too (reviewer-T21-r3 confirmed; my run 05:29, load 41); T20 test alone 5.4-5.9 s at load 40-60
                            ledger integrate refused twice (05:44 load 128, 06:32 load 90): 197/199, only these 2, 'Test timed out in 5000ms'
                            neither contract (T16, T20) names a speed for these tests; 3 builders + a tool trial run at once tonight (load 30-157)
    ask                     raise the per-test timeout of exactly these 2 tests to 30_000 ms (third argument of it()), no other change
    why not cut the cost    each mole CLI spawn costs ~1.4 s wall at load (node ESM load of the daemon CLI, 0.95 s CPU); T20 runs 3 spawns, so ~4-5 s is its floor
    R7                      the assertions stay identical; only the wall-clock budget changes (metric-gated-build-loop R2 allows this by ruling)
```
