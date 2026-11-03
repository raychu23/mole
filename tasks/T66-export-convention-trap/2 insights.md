## Summary
`isExportConventionTitle` flagged any title term starting with "export" as a JS module-export rule; combined with
cascade's `isCrisp`, a decision like "Audit every data export" got zero-LLM auto-"violates" treatment the moment any
new TS `export` appeared, with no judge. Fixed by keeping the broad title test for ROUTING only and adding a new
`isModuleExportTitle` that `cascade.ts`'s `isCrisp` now requires before treating an `export-convention` hit as a
no-judge signal. Review 1 (HIGH) found the first cut's vocabulary too narrow -- it missed "Export conventions"/
"Export Convention" (no word for "convention(s)" itself) and "Barrel files re-exporting" (the `\bre-?export\b`
word-boundary test can't match "re-exporting"'s trailing "ing"). Fixed by widening the module-vocabulary list
(convention(s), entry point, public api, api surface, a `re-?export(?:s|ing)?` form outside the `\b...\b` wrap)
and adding a `dataVocab` exclusion safety net for titles that mix module and data registers. Measured: a new
35-case table-driven test (`options-module-export-title.test.ts`) covering all 6 review-1 titles plus 10+ more of
each kind went red (6 failing against the pre-fix code) -> green; the original 3-test cascade suite and the
bs-adr003/004 titles in every bench corpus (m24, m24v2, m19-excalidraw, m22) are unaffected. Full packages/decisions
suite: 393/393 green (38 files). `npx tsc -b packages/decisions`: clean. Open: the actual M24 bench score run
(clone backstage, score before/after) is still NOT RUN (no network clone available this session) -- covered
instead by exhaustively checking every export-titled decision text in every bench fixture directory against the
widened gate (all pass, titles unchanged from round 3's audit).

```notes
code
  packages/decisions/src/check/options.ts   +isModuleExportTitle (new, exported); isExportConventionTitle unchanged
  packages/decisions/src/cascade/cascade.ts  isCrisp: `export-convention` hit crisp only if isModuleExportTitle(g.title)

tests (red -> green)
  new: packages/decisions/test/cascade-export-convention-title.test.ts (3 tests)
    red:   tasks/T66-export-convention-trap/4 log/red.txt (1 fail / 2 pass before the fix)
    green: `npx vitest run packages/decisions` -> 358 tests / 37 files, all green
  unaffected: pr-check-options.test.ts (option-4 AST detector, unchanged), cascade-worktree.test.ts
    (T65's own comment names this exact bug as T66's), cascade.test.ts, cascade-semantic-route.test.ts,
    cascade-batch.test.ts -- all still pass with the narrower isCrisp.

proof
  tasks/T66-export-convention-trap/4 log/prior-art.md  -- Backstage ADR003/004 (fetched 2026-11-03, raw.githubusercontent.com),
    GitHub CODEOWNERS "most specific wins" (fetched 2026-11-03), typescript-eslint naming-convention custom/filter
    two-regex composition (fetched 2026-11-03)
  tasks/T66-export-convention-trap/4 log/red.txt  -- red run before the fix
  bench-corpus audit (done-when 2, in lieu of the full M24 scored run):
    `grep -rl export packages/decisions/bench/{m24,m24v2,m19-excalidraw,m22/overlay}/**/.mole/decisions/*.md`
    then `grep "^title"` on every hit -> only 2 distinct titles anywhere, both pass isModuleExportTitle:
    "Avoid Default Exports and Prefer Named Exports", "Module Export Structure" (bs-adr003/bs-adr004, duplicated
    verbatim in m24, m24v2 and m19-excalidraw's overlays). No export-titled decision in any bench fixture loses its
    crisp catch.

NOT RUN
  the full m24-options.ts bench score (before/after metrics on a real backstage clone at the pinned head
  e8c4d056e3c850a467e34eba810a3ed00d62cfe2): no network clone of backstage available this session
  (`~/.hermes/cache/scratch/t32/backstage` does not exist). Covered instead by the bench-corpus title audit above
  (every export-titled decision text in every committed bench overlay, not just bs-adr004, checked against the new
  gate) plus the unit test replicating bs-adr003's exact title. Decision: acceptable per the task's own STOP clause
  ("any lost catch... without a written trade-off") -- there is no lost catch to trade off, zero export-titled
  decisions anywhere in the fixture set fail the new gate.
  the m2-conflict/v3 corpus specifically: `decisions_manifest_v3.json` has ZERO decisions whose title contains
  "export" (checked directly), so done-when 2's "zero-LLM part of m2-conflict v3 before/after, same catches" holds
  trivially (0 export-convention hits before, 0 after) -- the real motivating cases (bs-adr003/004) live in the M24
  bench, not M2, per the bench's own `source:` provenance field.

limits (INFERENCE)
  isModuleExportTitle's vocabulary list (default/named/module/barrel/index/re-export/convention(s)/entry point/
  public api/api surface) is grounded in real ADR and lint-rule wording gathered this round and last, not an
  exhaustive taxonomy of every way a title could legitimately mean "JS module export convention" -- a future ADR
  titled e.g. "ESM export compatibility" would route (isExportConventionTitle still broad) but might not be judged
  crisp until a judge call confirms it, which is the intended fallback (escalate, never silently drop), not a
  regression.
```

## Review 1 fixes

finding (HIGH) -- isModuleExportTitle required "export(s)" + one of default|named|module|barrel|index|re-export
in the SAME title; genuine module-export titles using only "convention(s)" ("Export conventions", "Export
Convention") or a hyphenated re-export verb form ("Barrel files re-exporting", which the old `\bre-?export\b`
word-boundary test can't match because the trailing "ing" breaks the closing `\b`) lost their crisp catch and
would wrongly escalate to the LLM tier.
  fix -- widened the module-vocabulary alternation (+ convention(s), entry point, public api, api surface) and
  moved the re-export alternative outside the `\b...\b` wrap as `re-?export(?:s|ing)?` so "re-exporting"/
  "re-exports" match too; added a `dataVocab` exclusion (data/csv/report(s)/download(s)/endpoint(s)/job(s)/
  pipeline(s)/user(s)/excel/pdf -- deliberately not "file"/"files", see prior-art.md #4) as a safety net for
  titles that mix module and data registers (e.g. "Default export of CSV report data"), independent of and after
  the module-vocabulary check.
  proof -- `tasks/T66-export-convention-trap/4 log/red.txt` ("review-1 fix round" section): the new
  `packages/decisions/test/options-module-export-title.test.ts` (35 cases: all 6 review-1 titles + 10 more
  module-export titles grounded in eslint-plugin-import rule names and two real "Barrel Export
  Boundaries"/"Barrel Export Pattern" ADRs + 13 more data-export titles including 2 mixed-register cases) run
  against the pre-fix code: 6 failed (the exact 3 review-1 titles plus 2 mixed-register cases we added to prove
  the dataVocab safety net is load-bearing, plus 1 self-inflicted test-data bug fixed before counting as the real
  6). After the fix: `npx vitest run packages/decisions` -> 393/393 tests, 38/38 files green, including the
  original 3-test `cascade-export-convention-title.test.ts` (bs-adr003-shaped title still crisp, data-export title
  still escalates, routing unaffected) and the bs-adr003/bs-adr004 titles exactly as they appear in every bench
  corpus (m24, m24v2, m19-excalidraw, m22) -- confirmed via `grep -rl export .../**/.mole/decisions/*.md` then
  `grep "^title"`, same two titles as round 3's audit, both still pass the widened gate. `npx tsc -b
  packages/decisions`: clean (no new type errors).

finding (secondary, caught while building the table) -- "Barrel files re-exporting" and "index files" are genuine
module-structure phrasing (ADR004's own body: "only index files will have re-exports"), so a literal reading of
the task's example data-vocabulary list (which includes "file") would reintroduce a false negative on the exact
review-1 title it's meant to fix.
  fix -- deliberately excluded "file"/"files" from `dataVocab`; verified no bench/task data-export title needs it
  (none of the 6 review-1 negatives or the 13 additional negative titles contain "file").
  proof -- `options-module-export-title.test.ts`'s full table, all 35 cases green; documented in prior-art.md #4
  and in `isModuleExportTitle`'s own doc comment.
