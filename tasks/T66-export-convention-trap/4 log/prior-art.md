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
