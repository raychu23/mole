# T80 prior art (R0, checked 2026-11-03, before any code)

Scope: contestable AI-drafted arguments captured from human records (ADR/PR/meeting text) with an exact
source span + provenance, held as `draft` until a person approves them, never feeding packages/reasoning's
`evaluate()` until approved. MADR "Considered Options" + "Pros and Cons of the Options" become arguments
with spans via deterministic extraction (no model).

## 1. W3C Web Annotation Data Model -- TextQuoteSelector (W3C Recommendation, 23 Feb 2017;
`https://www.w3.org/TR/annotation-model/#text-quote-selector`, fetched 2026-11-03 via a WPUB extension doc
that quotes it verbatim)
A `TextQuoteSelector` anchors to a text range with three fields: `exact` (the quoted substring itself),
`prefix` and `suffix` (surrounding context used to disambiguate repeated matches), e.g.
`{"type":"TextQuoteSelector","exact":"annotation","prefix":"this is an ","suffix":" that has some"}`.
This is the exact shape the task's contract asks for ("file + line/char range + quoted text"): T80's
`TextQuoteSpan` stores `exact`/`prefix`/`suffix` the same way, adding `file`+1-based `startLine`/`endLine`+
0-based `startChar`/`endChar` on top (WADM's own `TextPositionSelector` sibling selector) because a bare
quote with no file/line is not enough to let a person re-find and hand-check the span in a markdown file
during review -- exactly what the task's done-when #4 (spans hand-checked in the log) requires.

## 2. Stab & Gurevych 2014, "Annotating Argument Components and Relations in Persuasive Essays"
(COLING 2014, ACL Anthology C14-1142, `https://aclanthology.org/C14-1142.pdf`, fetched 2026-11-03)
Argument-mining span annotation: claims/premises are annotated as markable text spans (not predefined
sentence boundaries) linked by support/attack relations, each span traceable back to its exact source text
(brat annotation tool, char-offset based). T80 borrows the core discipline -- every captured argument is a
pointer into the SOURCE TEXT, never a paraphrase stored without its origin -- but does NOT borrow the
annotation scheme itself (claim/major-claim/premise, free-text essays): Mole's source is structured MADR,
so the component boundaries come from the document's own headings/bullets (ref 3), not from a trained
span-boundary model. The one-directional extraction (deterministic parse, not a trained classifier) is the
honest difference: Stab & Gurevych's scheme targets unstructured prose; T80's targets a MADR template that
already names its own argument components.

## 3. MADR (Markdown Architectural Decision Records) template fields, v3/v4
(`https://adr.github.io/madr/`; this repo's own vendored corpus `packages/decisions/bench/corpora/m29-madr`,
read in full 2026-11-03: `docs/decisions/0008-add-status-field.md`, `0009-...links-between-adrs...md`,
`0012-...curly-braces...md`, `0015-...raci.md`, `0016-...pros-cons.md`)
MADR's own headings name the argument components directly: `## Considered Options` (a bullet list of
option names), `## Decision Outcome` ("Chosen option: X, because ..."), and `## Pros and Cons of the
Options` (one `### <option name>` subsection per considered option, each holding `- Good, because ...` /
`- Bad, because ...` bullets). This is the SAME structure T54's `derive-adr.ts` already reads for
Considered Options + Decision Outcome (see `tasks/T54-engine-in-check/4 log/prior-art.md` #4) -- T80 adds
the Pros-and-Cons half of the template, which T54 explicitly left unread (T54 only used Decision Outcome's
own "because" bullets as reasons; real MADR ADRs instead put the pro/con bullets in their own section, one
`###` per option, and the 5 real records picked for this task's run all use exactly that shape with ZERO
reason bullets directly under "Chosen option:").

## 4. Argument Interchange Format (AIF) -- Chesñevar et al. 2006, "Towards an Argument Interchange Format"
(Knowledge Engineering Review; the ASPIC+/Rebutting-Undermining-Undercutting split T48's own header already
cites, Modgil & Prakken 2014) + this repo's own compile-at-capture draft/approve store (T46,
`packages/decisions/src/compile/store.ts`)
AIF's RA(rule application)/CA(conflict application) node split is the formal reason T48's `EdgeType` has
separate `supports`/`attacks`/`undercuts` relations instead of one generic "related" edge -- T80's new
pro/con arguments reuse those same edge types (`con` -> `attacks` the option, `pro` -> `supports` it,
display-only exactly like T48's existing support edges) rather than inventing a fourth relation. The
draft/approved status lifecycle itself is not new in this repo: T46's `compile/store.ts` already has the
exact append-only, versioned, "approve merges it in / reject only marks the file, never touches the
record" pattern this task needs for arguments -- T80 copies that store shape (never deletes, approve is
idempotent, reject never mutates anything but its own status) instead of inventing a second persistence
convention.

## Design choices this task makes, and why (honesty gate)

**Chosen: extend T54's `deriveAdrArgumentFramework` output with spans/provenance/status, add Pros-and-Cons
extraction as a new sibling parse, and gate the EXISTING `argumentFramework()`/`evaluate()` wiring (T48) on
status, rather than building a second evaluator.** `argumentFramework()` already builds its Dung framework
from whatever `kind: 'argument'` nodes + supports/attacks/undercuts edges are in the loaded `DecisionGraph`,
regardless of source (hand-authored `.argdown` file today). Adding a loader that turns *approved* captured
arguments into the same kind of graph node/edge -- and skips *draft* ones entirely -- means a draft is
invisible to `evaluate()` by construction (it was never a graph node), not by a runtime status check that
could be forgotten at a second call site. This is the same reasoning T46's compile store uses: approval is
the ONLY path from draft to effect, and it is irreversible-by-omission (nothing else grants effect).

**Rejected: wiring captured pro/con arguments as attacks on the claim itself.** A "Bad, because ..." bullet
under even the CHOSEN option's own Pros-and-Cons subsection is a real recorded drawback, and it would be
tempting to make it attack the decision's claim directly. T54's own prior-art.md #4 already found that
"any negative line attacks the claim" is a trivial, non-discriminative use of grounded semantics on real
ADRs (nearly every ADR documents SOME trade-off -- the claim would be defeated almost always). T80 keeps
the same discipline T54 chose for Consequences: a `con` attacks the *option it is talking about*
(ASPIC+ rebutting reading, same direction T54 already uses for "reason attacks rejected option"), never the
claim directly. A con on the chosen option (which derive-adr deliberately never turns into a graph node,
since the chosen option is not its own counter-argument) is captured with span+provenance but has no
attack target -- `attacks: []` -- rather than inventing one; documented, not silently dropped (visible in
`2 insights.md` and in the captured JSON's own empty array).
