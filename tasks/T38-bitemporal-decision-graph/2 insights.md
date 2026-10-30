```notes
T38 insights      bitemporal decision graph      mole-builder-11      2026-10-29
    review-1 fixes      (fresh subagent, R5, 2 P0 + 1 P1; see tasks/T38-bitemporal-decision-graph/4 log/review-1.md)
        boundary        0 start.md's boundary says "packages/server/src read-only unless T33 is integrated"; no
                         packages/server exists in this repo (T33's server is in a separate worktree, not yet
                         integrated). The user's direct task assignment (this task's own brief, step 4) explicitly said
                         "Expose one MCP tool (mole_decisions_asof) by one import + one call in packages/mcp/src" --
                         the live shared MCP file every other tool (mole_map, mole_check, mole_decisions) registers
                         in, following the exact same pattern T29 used for mole_decisions. 0 start.md's boundary text
                         is stale (predates knowing packages/server wouldn't exist yet); followed the explicit
                         instruction instead. Diff is minimal (one tool, ~36 lines, one dependency line, one tsconfig
                         reference), the existing tool-list test uses toContain (not an exact set, per the shared-file
                         rule), and other builders in packages/mcp touch different tools -- real merge-conflict risk
                         is low but not zero; integration step merges main first and reruns checks regardless.
        .mole/decisions  done-when 1 names BOTH decisions.jsonl and ".mole/decisions git history" as sources; the
                         first version of this insights file incorrectly said the loader already read both. Fixed:
                         src/loader.ts now has loadMoleDecisionsGit(pool, repoRoot) (real git log --follow + git show
                         per .mole/decisions/*.md, parsing the front-matter `status` field per commit) in addition to
                         loadDecisionsJsonl. It loads real history (exercised in bench/m32.ts, real run count logged
                         in runs.jsonl as "+N .mole/decisions git-history facts loaded") but is intentionally NOT
                         added to the frozen key's own loading in test/temporal.test.ts (R2: no new call in the
                         already-ruled test diff) -- the 10 .mole/decisions/*.md records don't carry the explicit
                         replaced_by/decided/amended chains decisions.jsonl's prose does, so they add no "what held on
                         date T" questions worth hand-labelling into the frozen key; they do add real facts under
                         different ids (e.g. '0014-agent-states-read-only'), so this never changes the key's scoring.
        closeFact        schema.sql's comment claimed "nothing here is ever UPDATEd" -- not quite accurate: closeFact
                         performs exactly one UPDATE per row, bounding the still-open row's valid upper end. Comment
                         corrected: value/kind are never changed or removed; the one allowed mutation is that single
                         bound-setting UPDATE, matching Graphiti's own "invalidate, never delete" pattern (an UPDATE
                         of invalid_at, not a new edge or a deletion).
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
                 is a column-constraint rewrite only (schema.sql comment says so at the constraint). Confirmed by the fresh
                 reviewer: this is real, database-enforced integrity (a genuine constraint violation caught via
                 .rejects.toThrow()), not an app-level pre-check.
    append-only history   value/kind are never changed or removed once written. The one controlled exception is closeFact:
                          a still-open row's valid UPPER BOUND is set exactly once (one UPDATE of that bound, never of
                          value/kind, never a DELETE) -- matching Graphiti's own "invalidate, never delete" pattern (an
                          UPDATE of invalid_at, not a deletion or a new edge).
    0 model calls   loader reads .mole/decisions/*.md + its git history (loadMoleDecisionsGit) + decisions.jsonl
                    (loadDecisionsJsonl) with plain parsing (git log/show, JSON.parse); queries are SQL; no LLM anywhere on the
                    write or read path (R6 test + bench both assert 0 fetch calls).
    scale + concurrency   M32's "100k facts" bench seeds synthetic fact history in-process (not decisions.jsonl, which has
                          ~46 real decisions) -- labelled in bench/m32.ts. The "1,000 concurrent conflicting writes" are
                          issued through a 15-connection bounded worker pool, not 1,000 unbounded simultaneous sockets: this
                          machine's Postgres has max_connections=100, shared live with several other builders' worktrees
                          (T33's team server among them), and an unbounded Promise.all of 1,000 raw inserts against ONE
                          contended row was measured to take 6+ minutes and barely progress (Postgres's EXCLUDE-constraint
                          tuple locking serializes heavily under single-key contention) before being killed -- a real,
                          reproducible finding, not a guess. Bounding concurrency (the same shape any production client of a
                          shared Postgres uses, e.g. PgBouncer) brought the same 1,000-writer, 0-overlap result down to ~2
                          seconds without changing correctness. runs.jsonl's metric line reports attempted, committed and
                          rejected counts so this is never hidden behind the raw "0 overlaps" figure.
    final bench run   M32 all targets met: as-of 100.0% (64/64) vs latest-only baseline 45.3% (29/64; latest-only is wrong on
                      the other 35/64, which is the whole point of the comparison); overlaps 0/1000; p95 as-of 0.26ms indexed
                      vs 13.73ms sequential (53.0x) at 100k facts (EXPLAIN ANALYZE plans under 4 log/plans/: the
                      sequential-scan baseline required dropping the EXCLUDE constraint's own backing GiST index too, in the
                      disposable bench db only, since an exclusion constraint always keeps one index and the planner would
                      otherwise still use it); model calls 0.
```
