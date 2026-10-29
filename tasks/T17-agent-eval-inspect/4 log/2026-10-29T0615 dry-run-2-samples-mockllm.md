dry run 2 samples mockllm (mockllm/model, 2026-10-29T06:15:33-05:00)

mock model: plumbing check only (sandbox, Claude Code, bridge, both arms, scorer, report). The mock never edits code, so these rates say nothing about Mole.

| arm | n | regressions | rate | 95% interval (Wilson) | kept / regressed / build_broken / guard_unrunnable | tokens per run | seconds per run |
|---|---|---|---|---|---|---|---|
| none | 1 | 1 | 1.00 | 0.21 to 1.00 | 0 / 1 / 0 / 0 | 24996 | 91.8 |
| mole | 1 | 1 | 1.00 | 0.21 to 1.00 | 0 / 1 / 0 / 0 | 52364 | 136.7 |

rate(none) - rate(mole) = 0.00, 95% interval -0.79 to 0.79 (Newcombe); Mole better shown: no

| sample | epoch | label | tokens | seconds |
|---|---|---|---|---|
| B3-review-mole | 1 | regressed | 52364 | 136.7 |
| B3-review-none | 1 | regressed | 24996 | 91.8 |
