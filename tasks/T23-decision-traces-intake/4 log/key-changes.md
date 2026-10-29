# T23 key changes (R2)

Two changes to artifacts after the initial draft, logged per loop rule R2 for Raymond's ruling:

1. **Seeded fixture syntax fix (not a key-value change).** `bench/seeded/*.md`'s `source:` front-matter field
   originally had unquoted values containing a colon (e.g. `source: seeded flaw S1 (bench/m30-key.json): scope
   path does not exist`). YAML parses `key: value: value` as a nested mapping, which the shared `@mole/decisions`
   parser (correctly) rejects as a problem, so none of the 10 seeded records loaded at all (0/10 caught). Fixed by
   quoting the `source:` value. The *expected flags* in `m30-key.json` were not touched; only the fixture files'
   YAML became parseable.
2. **`stale_citation` scope narrowed to explicit `confirmed:` citations only.** The first implementation reused
   `@mole/decisions`' `scope_changed` reason unconditionally, which also fires on its fallback path (the record's
   own last-touch commit, when no `confirmed:` field is given). That fallback is sensitive to unrelated edits
   elsewhere in the repo made *during this task's own development* (this task added a line to
   `packages/daemon/src/cli.ts`, which 0007 and 0013 both scope to; 0011 was touched by another concurrent ledger
   task on `packages/memory/src/notes.ts`), producing 3 false flags on the real 10-record corpus for a reason that
   has nothing to do with those records' own wording. `m30-key.json`'s `real` section was not changed — it still
   expects `[]` for all 10 real records; the implementation was restricted to match that expectation using the
   record's own explicit claim (`confirmed:`) rather than the citator's best-effort fallback.

Both are implementation/fixture fixes under R2's "needed change" clause, not a loosening of the targets (R7): the
`m30-key.json` `targets` block (`seededRecallMin: 9`, `realFalseFlagsMax: 1`, `evidencePrecisionPct: 100`) and
every seeded/real record's expected check list are unchanged from the first draft. Raymond: please rule on whether
narrowing (2) is the right general policy for `@mole/decisions`' citator too, or whether it should stay T23-local.
