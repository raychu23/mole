```notes
T38 insights      bitemporal decision graph      mole-builder-11      2026-10-29
    M32 key      bench/m32-key.json (64 questions, >=40 required): hand-read from context/product-plan/systems/decisions.jsonl's
                 own prose fields (status/date/replaced/replaced_by/decided/amended/answered), never from running this package's
                 loader -- a different method than the code under test (R1). D6 -> D20 -> D22 -> D24 replace chain, D26 decided
                 via D28, D24 + D34 amended all land in the key with real timestamps where the text gives one.
        INFERENCE  a record's status before its first named event (replaced/decided/amended) is assumed OPEN: every REPLACED/
                   DECIDED/amended record in decisions.jsonl started life as an open proposal and the file never records an
                   explicit OPEN->OPEN no-op, so there is no contradicting evidence, but it is not written down either.
        INFERENCE  same-day event times: used a time-of-day substring in the record's own text when present (D26 '21:25' from
                   its source message, D34 '10:04' / '15:30'); otherwise a fixed placeholder (noon for replaced/decided, 15:00
                   for amended, 10:00 for answered). decisions.jsonl is date-only for most rows; this is the best available
                   resolution without re-deriving timestamps from chat logs the task says not to preload.
    schema       maps 1:1 to PG 18's PRIMARY KEY (fact_id, attr, valid WITHOUT OVERLAPS): on PG 16 this is EXCLUDE USING gist
                 (btree_gist) over (fact_id, attr) WITH =, valid WITH && -- same integrity guarantee, same shape, upgrade later
                 is a column-constraint rewrite only (schema.sql comment says so at the constraint).
    never UPDATE/DELETE history   closeFact never rewrites a row; it only ever inserts a new version with a bounded valid range,
                                  so the fact_versions table is append-only (asserted by test/temporal.test.ts "never rewrites").
    0 model calls   loader reads .mole/decisions/*.md + its git history + decisions.jsonl with plain parsing (yaml/git log),
                    queries are SQL; no LLM anywhere on the write or read path (R6 test asserts 0 fetch calls).
    scale assumption   M32's "100k facts" and "1,000 concurrent writes" bench targets are run against a disposable local
                        Postgres database (mole_t38_bench, dropped after the run) seeded with synthetic fact history generated
                        in-process (not drawn from decisions.jsonl, which has ~46 real decisions) -- labelled in bench/m32.ts.
