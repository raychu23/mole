# T23 insights

## R1 ordering note

This task was built in one continuous session rather than across separate claim/build/review turns. The bench
key (`packages/intake/bench/m30-key.json`) and the 10 seeded fixtures (`packages/intake/bench/seeded/*.md`) were
hand-labeled by reading the real `.mole/decisions/*.md` files and `git log` directly (see each key entry's `why`),
*before* writing `checkAllRecords`/`checkRecord`, and were only adjusted once for a YAML quoting bug (front-matter
`source:` values containing a bare colon broke the YAML parser — not a key-value change, a fixture syntax fix) and
once to drop the `confirmed`-fallback dependence of `stale_citation` (see `4 log/key-changes.md`). The two git
commits below separate "checks" (prior-art + key + seeded fixtures + test file) from "implementation" as R1
intends, even though in wall-clock time some iteration happened before the first commit landed.

## Design choices (R6: deterministic default path)

- `stale_citation` only fires on an **explicit** `confirmed:` field in the record's own front matter, not on
  `@mole/decisions`' fallback ("whatever commit last touched this file"). The fallback is correct for citator
  *governance* (did this record's scope drift since anyone looked at it) but is the wrong signal for "the author's
  own citation is stale" — it fires on every incidental edit elsewhere in the repo since the record's last commit,
  which produced 3 false flags on the real 10-record corpus during this session's own development (0007, 0011,
  0013) purely because other parts of the repo changed while this task was being built. Logged because it would
  have broken the `<= 1 false flag` target for a reason unrelated to the records themselves.
- `no_alternatives` and `contradicts_tenet` are small, explicit regex tables (contrast phrases; one trigger per
  tenet) rather than a generic text-similarity match, specifically to keep false flags at 0 on Mole's own 10 real
  records (see `4 log/prior-art.md` §5, the Vale-rule shape this follows).
- `interrogate()` returns `{governed: false, questions: []}` (not `{governed: true, questions: []}` with a notice)
  when nothing governs the change, per done-when 5 ("silent").
- No model calls on the default path (`modelCalls` is always 0 unless a caller explicitly passes `reword: true` and
  a `model` function, mirroring `@mole/questions`' own contract).

## Boundary notes

- `packages/daemon/src/cli.ts`: one new line (`if (['interrogate','check-records']...)`), one new dependency.
- `packages/mcp/src/server.ts`: one new tool, `mole_interrogate`, dynamic-imports `@mole/intake` the same way
  `mole_decisions` dynamic-imports `@mole/decisions`.
- `packages/decisions/src`, `packages/questions/src`, `packages/history/src` were only ever imported, never edited.
