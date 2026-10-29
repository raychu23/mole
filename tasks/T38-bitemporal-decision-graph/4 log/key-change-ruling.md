```notes
T38 key-change ruling      fresh subagent (no prior transcript), 2026-10-29
    verdict      PASS
    reason       dummy flat seed makes the M32 test unpassable by any correct implementation (time-invariant
                 value vs time-varying expected); fix only swaps it for a loader call; loader parses
                 decisions.jsonl independently of bench/m32-key.json; no target/expected/baseline value
                 changed; integrity test's assertions untouched.
    applied      test/temporal.test.ts M32 block now calls loadDecisionsJsonl(); src/index.ts insertFact is
                 idempotent on an exact duplicate (fact_id, attr, value, valid), still throws on real overlap.
```
