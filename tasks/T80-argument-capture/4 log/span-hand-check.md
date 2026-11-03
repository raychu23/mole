# T80 span hand-check (5 real MADR records, `packages/decisions/bench/corpora/m29-madr/docs/decisions/`)

Full extraction output: `real-run-5-madr-records.json` (produced by `captureAdrArguments`, built dist, no
model). Every row below was found by opening the real file at the stated line and comparing it CHARACTER
FOR CHARACTER against `span.exact`/`span.startChar`/`span.endChar` -- all 95 rows re-verified
programmatically after the review-fix re-run below (0 mismatches).

**Review HIGH 2 re-run (this pass):** `derive-adr.ts`'s `sameName()` now normalizes every quote kind
(straight/curly single+double, backtick), so a chosen option phrased with nested single quotes is finally
recognized as "the chosen one" and excluded from the considered-option attackers -- this changed 3 of the
5 real records' counts (0009 29->28, 0015 10->9, 0016 9->8; 0008 and 0012 unchanged, neither had the
mismatch). Total 98->95 captured arguments. `capture/arguments.ts` also gained its own defensive guard
(independent of `sameName`'s own exclusion) that strips a claim-attack from any considered-option row whose
normalized text equals the record's own chosen option, verified on 0015 and 0016 directly in
`argument-capture.test.ts`.

## 0008-add-status-field.md (34 captured arguments)
- `::claim` line 24: file reads `Chosen option: "Use YAML front matter", because comes out best (see
  below).` -- `span.exact` is that exact string, `startChar:0 endChar:75`, confirmed.
- `::option:1` line 16: file reads `* Use badge` -- `span.exact` = `"Use badge"`, `startChar:2 endChar:11`
  (after the `* ` marker), confirmed.
- pro under `### Use table`, text `Good, because history can be included` at line 84 (`* Good, because
  history can be included`): confirmed startChar 2.

## 0009-support-links-between-adrs-inside-an-adrs.md (28 captured arguments, up from 7 before the
fenced-code-block fix, now down from 29 to 28 after the review HIGH 2 quote-normalization fix)
- `::pro:2` line 45: file reads `* Good, because easy to write` -- `span.exact` matches, `startChar:2
  endChar:29`, confirmed.
- This file's own `## Pros and Cons of the Options` section (starting real-content line 28) contains a
  ```markdown example fence (lines 34-38) that itself has the TEXT "## More Information" inside it -- not
  a real heading. `extractProsCons`'s first version used the first `/^##\s+/` match to end the section
  scan and stopped there (only 7 arguments found); fixed to track fence state (`` ``` `` toggles) and skip
  heading/bullet matching while inside a fence -- confirmed by re-running: 29 arguments (then), all 6 real
  `### <option>` subsections covered.
- **Review HIGH 2 (this pass):** the chosen option is `Chosen option: "Include in section 'More
  Information'"`, nesting single quotes around "More Information" inside the outer double quotes, while
  the bullet is `Include in section "More Information"` -- the SAME single-quote mismatch as 0015/0016
  below. Before the fix this showed up as an EXTRA `::option:N` attacking the claim; after the fix it is
  correctly excluded -- 29 -> 28 captured arguments, re-verified character-for-character.

## 0012-use-curly-braces-to-denote-placeholder.md (16 captured arguments)
- `::con:1` line 40: file reads `* Bad, because confusion with markdown notation for links.` --
  `span.exact` matches, `startChar:2 endChar:58`, confirmed.
- pro at line 39 (`* Good, because used in MADR 1.x and MADR 2.x.`) confirmed supports
  `::option:1` ("Use square brackets"). No quote-nesting in this record's Decision Outcome -- unaffected by
  the review HIGH 2 fix, count unchanged at 16.

## 0015-include-consulting-informed-of-raci.md (9 captured arguments, down from 10 before the review HIGH
2 fix)
- `::claim` line 28: file reads `Chosen option: "Include 'Consulted' and 'Informed' of RACI", because
  comes out best (see below).` -- `span.exact` matches, `startChar:0 endChar:96`, confirmed.
- **Fixed (review HIGH 2):** `* Include "Consulted" and "Informed" of RACI` (line 22) is the record's OWN
  CHOSEN option -- its bullet uses `"`/`"` quoting while the Decision Outcome line quotes the SAME option
  with `'`/`'` (single quotes) around each inner phrase. `sameName()` used to strip `"`/`\u201c\u201d` but
  not `'`, so the two strings never normalized equal and this bullet was wrongly treated as a REJECTED
  option (`::option:1`, attacking its own claim). After normalizing every quote kind, `sameName()` now
  matches them and `deriveAdrArgumentFramework`'s own `chosenIdx` exclusion correctly drops this bullet --
  confirmed: the captured rows now have ONLY 2 considered-options (the genuinely rejected "Include all
  fields of RACI" and "Do not include anything of RACI"), neither of which is the chosen text, and the
  capture-level guard independently confirms no considered-option's `attacks` contains the claim id with
  the chosen option's own text (`argument-capture.test.ts`'s "real record 0015" test).
- `::pro:1` line 34: file reads `* Good, because these two roles of RACI are well understood.` -- confirmed.

## 0016-outcome-before-detailed-pros-cons.md (8 captured arguments, down from 9 before the review HIGH 2
fix, up from 3 before the earlier fence fix)
- Same fenced-example issue as 0009: the record's `### Section "..." before "Decision Outcome"` subsection
  (real content at lines 50-51) is preceded by its own illustration fence (lines 57-69 belong to the NEXT
  subsection, but an earlier short fence inside line ~34-48 region also exists) -- re-verified after the
  fence fix that `::pro:1` (line 50, `* Good, because this keeps the available options and the decision
  outcome close together.`) and `::con:1` (line 51, `* Bad, because readers might be confused, because the
  logical flow broken: First comes the result, then the detailed arguments.`) are both captured with
  correct spans, confirmed character-for-character.
- **Fixed (review HIGH 2):** same quote-mismatch as 0015 above -- `Chosen option: "Section 'Pros and Cons
  of the Options' after 'Decision Outcome'", because ...` vs the bullet's `Section "Pros and Cons of the
  Options" after "Decision Outcome"`. Before the fix, neither option was recognized as chosen, so BOTH
  `::option:1`/`::option:2` attacked the claim; after the fix, the chosen bullet is correctly excluded,
  leaving exactly ONE considered-option ("Section ... before ..."), confirmed by `argument-capture.test.ts`'s
  "real record 0016" test and by re-running the extraction (9 -> 8 captured arguments).

## Totals
5 files, 95 captured arguments (down from 98 before the review HIGH 2 quote-normalization fix -- 3 fewer
rows, one per record where the chosen option used to wrongly attack its own claim), all `status: draft` on
first capture (verified: `allCapturedArguments` test + the CLI run below), 0 fabricated spans (any text
`captureAdrArguments` could not find as a literal line was skipped, never guessed -- see
`capture/arguments.ts`'s own doc comments), 0 span mismatches re-verified character-for-character across
all 95 rows.

## CLI end-to-end proof (scratch repo, `/Users/a1/.hermes/cache/scratch/t80-cli-run`, real 0008 file)
```
$ mole arguments capture --id 0008-add-status-field --root $R
0008-add-status-field 0008-add-status-field::claim [draft] claim ...
... (34 rows, all draft)
$ mole rules --root $R
0 rules (0 import, 0 call) from 0 decisions: 0 violations
$ mole arguments approve --id 0008-add-status-field --argument 0008-add-status-field::option:1 --approver raymond --root $R
approved 0008-add-status-field 0008-add-status-field::option:1 [approved] considered-option ... (approved by raymond at ...)
```
