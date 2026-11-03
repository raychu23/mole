# T80 span hand-check (5 real MADR records, `packages/decisions/bench/corpora/m29-madr/docs/decisions/`)

Full extraction output: `real-run-5-madr-records.json` (produced by `captureAdrArguments`, built dist, no
model). Every row below was found by opening the real file at the stated line and comparing it CHARACTER
FOR CHARACTER against `span.exact`/`span.startChar`/`span.endChar`.

## 0008-add-status-field.md (34 captured arguments)
- `::claim` line 24: file reads `Chosen option: "Use YAML front matter", because comes out best (see
  below).` -- `span.exact` is that exact string, `startChar:0 endChar:75`, confirmed.
- `::option:1` line 16: file reads `* Use badge` -- `span.exact` = `"Use badge"`, `startChar:2 endChar:11`
  (after the `* ` marker), confirmed.
- pro under `### Use table`, text `Good, because history can be included` at line 84 (`* Good, because
  history can be included`): confirmed startChar 2.

## 0009-support-links-between-adrs-inside-an-adrs.md (29 captured arguments, up from 7 before the
fenced-code-block fix below)
- `::pro:2` line 45: file reads `* Good, because easy to write` -- `span.exact` matches, `startChar:2
  endChar:29`, confirmed.
- This file's own `## Pros and Cons of the Options` section (starting real-content line 28) contains a
  ```markdown example fence (lines 34-38) that itself has the TEXT "## More Information" inside it -- not
  a real heading. `extractProsCons`'s first version used the first `/^##\s+/` match to end the section
  scan and stopped there (only 7 arguments found); fixed to track fence state (`` ``` `` toggles) and skip
  heading/bullet matching while inside a fence -- confirmed by re-running: 29 arguments, all 6 real
  `### <option>` subsections covered.

## 0012-use-curly-braces-to-denote-placeholder.md (16 captured arguments)
- `::con:1` line 40: file reads `* Bad, because confusion with markdown notation for links.` --
  `span.exact` matches, `startChar:2 endChar:58`, confirmed.
- pro at line 39 (`* Good, because used in MADR 1.x and MADR 2.x.`) confirmed supports
  `::option:1` ("Use square brackets").

## 0015-include-consulting-informed-of-raci.md (10 captured arguments)
- `::claim` line 28: file reads `Chosen option: "Include 'Consulted' and 'Informed' of RACI", because
  comes out best (see below).` -- `span.exact` matches, `startChar:0 endChar:96`, confirmed.
- `::option:1` line 22: file reads `* Include "Consulted" and "Informed" of RACI` -- confirmed. NOTE: this
  option's text uses `"`/`"` quoting while the Decision Outcome line quotes the SAME option with `'`/`'`
  (single quotes) around each inner phrase -- `derive-adr.ts`'s own `sameName()` strips `"`/"\u201c\u201d"
  but not `'`, so the two strings don't normalize equal and this option is NOT recognized as "the chosen
  one" (pre-existing T54 behavior, not introduced by T80 -- see `2 insights.md`). Net effect: `::option:1`
  attacks the claim even though it IS the record's own chosen option. Observed, not silently hidden: it is
  visible in the captured JSON (`attacks: ["...::claim"]`) and a reviewer can reject it on exactly that
  basis before approving.
- `::pro:1` line 34: file reads `* Good, because these two roles of RACI are well understood.` -- confirmed.

## 0016-outcome-before-detailed-pros-cons.md (9 captured arguments, up from 3 before the fence fix)
- Same fenced-example issue as 0009: the record's `### Section "..." before "Decision Outcome"` subsection
  (real content at lines 50-51) is preceded by its own illustration fence (lines 57-69 belong to the NEXT
  subsection, but an earlier short fence inside line ~34-48 region also exists) -- re-verified after the
  fence fix that `::pro:1` (line 50, `* Good, because this keeps the available options and the decision
  outcome close together.`) and `::con:1` (line 51, `* Bad, because readers might be confused, because the
  logical flow broken: First comes the result, then the detailed arguments.`) are both captured with
  correct spans, confirmed character-for-character.
- Same quote-mismatch as 0015 above: `Chosen option: "Section 'Pros and Cons of the Options' after
  'Decision Outcome'", because ...` vs the bullet's `Section "Pros and Cons of the Options" after
  "Decision Outcome"` -- neither option is recognized as chosen, so BOTH `::option:1`/`::option:2` attack
  the claim. Same pre-existing, visible, reviewable behavior as 0015.

## Totals
5 files, 98 captured arguments, all `status: draft` on first capture (verified: `allCapturedArguments`
test + the CLI run below), 0 fabricated spans (any text `captureAdrArguments` could not find as a literal
line was skipped, never guessed -- see `capture/arguments.ts`'s own doc comments).

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
