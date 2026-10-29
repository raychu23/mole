
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
