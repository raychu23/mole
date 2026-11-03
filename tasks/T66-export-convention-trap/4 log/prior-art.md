# T66 prior art (done-when 1), read before any code

Bug under fix: `isExportConventionTitle` (packages/decisions/src/check/options.ts) treats ANY title term that merely
*starts with* `export` as "this record is about the JS module-export convention" -- a bare substring/prefix test with
no phrase context. `pr-check.ts` option 4 uses that to grant a scope:[] record a generic AST content anchor
(`exportConventionRanges`), and `cascade.ts`'s `isCrisp` treats any `export-convention` anchor hit as crisp (decide
outright, zero LLM, no escalation -- T49's own doctrine: "the pattern IS the violation signal"). A decision titled
"Audit every data export" names a REST/CSV data-export feature, not the JS `export` keyword; its title still contains
the token "export", so today it gets the same no-judge, auto-"violates" treatment as a real module-export ADR the
moment any new TS `export` appears in the diff. That is a title-vocabulary false positive being treated as crisp.

## 1. Backstage ADR003 "Avoid Default Exports and Prefer Named Exports" + ADR004 "Module Export Structure" (primary
source; the actual two decisions that motivated option 4, T32 round 3) -- fetched fresh 2026-11-03 from
`raw.githubusercontent.com/backstage/backstage/master/docs/architecture-decisions/{adr003-avoid-default-exports,
adr004-module-export-structure}.md` to confirm current wording (also already vendored into this repo's bench overlay
at `packages/decisions/bench/m24/backstage/.mole/decisions/bs-adr00{3,4}.md`, `source: backstage/backstage@e8c4d056`).
ADR003's title: "Avoid Default Exports and Prefer Named Exports" -- names "default exports" and "named exports" as a
pair. ADR004's title: "Module Export Structure" -- names "module" + "export" together, decision body: "each exported
symbol traceable through index files... only index files will have re-exports" (barrel/index vocabulary). **Both real
motivating titles use export vocabulary in a multi-word, module/code-structure phrase ("default/named exports",
"module export [structure]"), never the bare word "export" alone the way a title about a data/CSV/report export
would.** This is the evidence the task asks for: a title classifier that requires one of these phrase shapes (not a
bare `export`-prefixed token) keeps both real cases crisp and drops the "Audit every data export" false positive to a
routed-but-not-crisp hit.

## 2. GitHub CODEOWNERS "the most specific pattern takes precedence" (primary source; already load-bearing precedent
in this codebase -- `codeowners.ts` and the options.ts round-3 comments cite the same doctrine for option 6's
file-scoped narrowing). Re-fetched 2026-11-03 from `docs.github.com/.../about-code-owners`: "Order is important; the
last matching pattern takes the most precedence." The generalizable lesson already in use here: a broad, cheap match
is fine as the FIRST-PASS filter (keep the decision in the candidate/routing set -- never silently drop it), but the
decision of WHAT GOVERNS/DECIDES belongs to the more specific test. T66 applies the identical shape: keep the broad
`isExportConventionTitle` substring test for ROUTING (so "Audit every data export" still becomes a candidate and
still gets an AST anchor hit -- nothing about routing recall changes), and add a narrower, phrase-level test that
gates only whether that hit is CRISP (decides with no judge) vs. must escalate.

## 3. typescript-eslint `naming-convention`'s `custom`/`filter` option (primary source; fetched 2026-11-03 from
`typescript-eslint.io/rules/naming-convention/`): accepts `{ regex, match }` as a SEPARATE, finer-grained gate layered
on top of the broad `format` check specifically "to have a bit more finer-grained control over identifiers, letting
you ban (or force) certain patterns and substrings" -- i.e. the established lint-rule shape for "the cheap broad test
decides eligibility, a second regex decides the specific claim" is exactly a two-regex composition, not a rewrite of
the first regex to be impossibly precise. T66 borrows that shape directly: `isExportConventionTitle` (broad, for
routing) stays; a new `isModuleExportTitle` (title mentions `export(s)` together with `default`/`named`/`module`/
`barrel`/`index`/`re-export`, grounded in source #1's actual vocabulary) decides crispness.

## 4. Review-1 fix (HIGH): evidence for a wider module-export vocabulary, fetched fresh 2026-11-03
Review-1 found the round-3 `isModuleExportTitle` (requiring "export(s)" + one of default/named/module/barrel/
index/re-export in the SAME title) too narrow in two ways: (a) it has no word for "convention(s)" itself, so a
title literally named after the convention ("Export conventions", "Export Convention") failed its own gate; (b) its
`\bre-?export\b` word-boundary test cannot match "re-exporting" (the trailing "ing" breaks the closing `\b`), so
"Barrel files re-exporting" only passed by accident, via "barrel", in cases that lack a bare "barrel"/"index"/etc.
word. Evidence gathered to fix the vocabulary from real-world wording, not ad hoc:
- `github.com/import-js/eslint-plugin-import/blob/main/README.md` (fetched 2026-11-03): rule names/descriptions
  `no-default-export` ("Forbid default exports"), `prefer-default-export`, `no-named-export`, `no-named-default`,
  `no-anonymous-default-export` ("Forbid anonymous values as default exports"), `group-exports` ("Prefer named
  exports to be grouped together in a single export declaration") -- all pair "export(s)" with default/named/
  anonymous/grouped vocabulary, confirming default/named stay central and adding no new words needed beyond what
  round 3 already had.
- `github.com/luciocabrera/lcabrera-stack/blob/main/docs/decisions/ADR-007-barrel-export-boundaries.md` (fetched
  2026-11-03): a real ADR titled "Barrel Export Boundaries", body talks about "public API" and "stable module
  boundaries" -- confirms "barrel" + "public api" as real module-export-ADR title vocabulary.
- `github.com/danielsimonjr/MemoryJS/blob/master/docs/development/ARCHITECTURE_DECISIONS.md` (fetched 2026-11-03):
  ADR-008 titled "Barrel Export Pattern" -- a second independent real ADR confirming "barrel" + "export" as a
  title pairing distinct from any data-export sense.
- Backstage ADR004's own body (already quoted in #1 above): "only index files will have re-exports" -- confirms
  "index files" is genuine module-structure phrasing, used as the basis for deliberately NOT adding "file"/"files"
  to the data-export exclusion list (unlike the task description's example list), since that would make "Barrel
  files re-exporting" and "index files" false negatives for no real-corpus benefit (no bench/task data-export title
  contains "file").
Fix: widened `isModuleExportTitle`'s module-vocabulary alternation to add `convention(s)`, `entry point`, `public
api`, `api surface`, and moved the re-export alternative outside the `\b...\b` wrapper as `re-?export(?:s|ing)?` so
it matches "re-exporting"/"re-exports" too. Added a `dataVocab` exclusion (data/csv/report(s)/download(s)/
endpoint(s)/job(s)/pipeline(s)/user(s)/excel/pdf, deliberately NOT "file") as a safety net for titles that mix both
registers (e.g. "Default export of CSV report data"), kept as a strictly later/independent check so none of the six
review-1 negative titles needed it (all six already fail at the module-vocabulary step with no module word present).

## What we borrow / what does not fit
Borrow: CODEOWNERS' "broad test picks the candidate set, a more specific test decides the outcome" layering (#2), and
typescript-eslint naming-convention's two-regex composition shape for implementing it (#3), applied to the exact
vocabulary real ADR titles use (#1) -- never invented, both titles are read verbatim from the Backstage ADRs that are
already this repo's own bench fixtures for option 4.
Does NOT fit: rewriting `isExportConventionTitle` itself to be the narrow test. Routing (which decisions become
`prCheck` candidates and get an AST hit at all) and crispness (whether that hit decides alone, no judge) are different
questions with different costs of being wrong -- losing a routing hit silently drops a decision from `governed`
entirely (T49's recall-ceiling finding, already diagnosed and fixed once by T53's semantic routing addition); losing
crispness only means one more case asks the LLM tier instead of free-deciding, i.e. exactly the task's own preferred
option ("let the export-convention hit route the decision and the cascade judge decide"). No model-quota cost here:
the fix and its test both stay zero-LLM (fake `LlmClient`s only), nothing in this task needs a real model call.
