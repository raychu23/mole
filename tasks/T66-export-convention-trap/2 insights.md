## Summary
`isExportConventionTitle` flagged any title term starting with "export" as a JS module-export rule; combined with
cascade's `isCrisp`, a decision like "Audit every data export" got zero-LLM auto-"violates" treatment the moment any
new TS `export` appeared, with no judge. Fixed by keeping the broad title test for ROUTING only and adding a new
`isModuleExportTitle` (requires "export(s)" paired with default/named/module/barrel/index/re-export in the SAME
title) that `cascade.ts`'s `isCrisp` now requires before treating an `export-convention` hit as a no-judge signal.
Measured: new 3-test suite went red->green; the title "Audit every data export" now escalates to the LLM tier
(routing untouched -- it still gets the AST hit); every real export-titled decision across every bench corpus
(bs-adr003/004 in m24, m24v2, m19-excalidraw) uses "default/named/module" vocabulary and stays crisp. Full packages/
decisions suite: 358/358 green. Open: the actual M24 bench score run (clone backstage, score before/after) is NOT RUN
(no network clone available this session) -- covered instead by exhaustively checking every export-titled decision
text in every bench fixture directory against the new gate (all pass).

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
  isModuleExportTitle's vocabulary list (default/named/module/barrel/index/re-export) is grounded in the two real
  ADR titles that exist today, not an exhaustive taxonomy of every way a title could legitimately mean "JS module
  export convention" -- a future ADR titled e.g. "ESM export compatibility" would route (isExportConventionTitle
  still broad) but might not be judged crisp until a judge call confirms it, which is the intended fallback (escalate,
  never silently drop), not a regression.
```
