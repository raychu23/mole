```notes
T38 key-changes      R2 process      2026-10-29      mole-builder-11
    bug found      test/temporal.test.ts "M32 as-of accuracy" block seeds every key.questions[i].decisionId with ONE flat
                   dummy fact ('seed-not-loaded', valid 2026-01-01..infinity) instead of calling a loader that reconstructs
                   each decision's real history. No implementation of asOf() could ever pass: every query would return the
                   same dummy value for every date, which never equals bench/m32-key.json's per-date `expected`. This is a
                   setup bug in the red commit, not a target or scoring change: targets (>=100% as-of accuracy, baseline
                   reported beside it) and the key itself (64 questions, dates, expected/baselineLatestOnly) are UNCHANGED.
    also fixed     the same loop calls insertFact() once per QUESTION, and most decisionIds repeat across several questions
                   with identical (factId, attr, value, valid) -- the second call for a repeated id would hit the
                   EXCLUDE USING gist constraint (same overlap-rejection the integrity test checks) and throw. Fix:
                   insertFact() is idempotent for an exact duplicate (same fact_id, attr, value, valid) -- a no-op, not an
                   INSERT -- but still throws on a genuine overlap with a DIFFERENT value (the integrity test is unaffected,
                   see test's first describe block, unchanged).
    fix            replace the dummy per-question seed loop with one call: `await loadDecisionsJsonl(pool, jsonlFixturePath)`,
                   a new exported loader (src/loader.ts) that independently parses decisions.jsonl's own prose fields
                   (status/date/replaced/decided/amended/answered) into real valid-time history per decision -- the same
                   method the task's done-when 5 asks for ("loaded from .mole/ records + ... decisions.jsonl"), built fresh
                   from the raw file, not by reading bench/m32-key.json (so the key's truth and the loader's parse remain
                   two independent readings of the same source, per R1).
    diff           test/temporal.test.ts: 3-line loop -> 1-line loader call + 1 new import. No assertion, target, or score
                   line changed. src/index.ts: insertFact gains an idempotent-duplicate check (implementation only).
    ruling         fresh-subagent review requested below; applied only after a pass verdict (see 4 log/key-change-ruling.md).
```
