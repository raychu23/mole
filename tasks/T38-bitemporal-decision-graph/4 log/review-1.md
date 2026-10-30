```notes
T38 review-1      fresh subagent (R5, no prior transcript), 2026-10-29
    verdict      not clear to integrate as submitted; 2 P0 + 1 P1 (no code defects, no fabricated numbers)
    P0-1 boundary      packages/mcp touched; 0 start.md names packages/server/src (doesn't exist). fix: documented
                       the user's explicit instruction in 2 insights.md "review-1 fixes > boundary"; kept the change.
    P0-2 insights claim   2 insights.md claimed the loader read .mole/decisions git history; it didn't. fix: added
                          src/loader.ts loadMoleDecisionsGit (real git log/show), exercised in bench/m32.ts,
                          insights.md corrected.
    P1 closeFact wording   schema.sql said "nothing here is ever UPDATEd"; closeFact does one UPDATE of a bound.
                           fix: comment + insights.md corrected to the precise claim (value/kind never touched;
                           one bound-setting UPDATE allowed, never a value rewrite or a delete).
    P2 (both applied)   runs.jsonl metric line now reports committed/rejected counts and notes bounded concurrency;
                        .mole git-history fact count logged.
    verified sound (reviewer's own check)   EXCLUDE USING gist is real database-enforced integrity; latest-only
                        baseline independently computed from decisions.jsonl (29/64 = 45.3%, matches runs.jsonl);
                        EXPLAIN ANALYZE plans are real, not fabricated; test-diff key-change matches key-changes.md.
```
