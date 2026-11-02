# T54 prior art (R0, checked 2026-11-02, before any code)

Scope: put packages/reasoning (T42, Dung grounded semantics + Bench-Capon value-based audience filter) and T48's
argument edges (supports/attacks/undercuts, Argdown) into the change-check path, so a flagged change is judged
against the decision's argument chain, not its text alone.

## 1. Carneades proof standards (Gordon & Walton, 2006, "The Carneades Argumentation Framework")
Burden-of-proof-aware argument evaluation: an argument is accepted only if it clears a *proof standard*
(scintilla, preponderance, clear-and-convincing, beyond-reasonable-doubt) set per issue, not a bare grounded
in/out. Carneades-4 (github.com/carneades/carneades-4, Go, MIT) ships this; T42's own `engine.ts` header
explicitly cites carneades-4's `dung.go:GroundedExtension` as the BFS shape it mirrors, but Mole's engine stops at
plain grounded semantics (no proof-standard layer) -- "intentionally out of scope" per T42's types.ts comment.
T54 takes grounded semantics as-is (no new proof-standard work; that would be its own task) but borrows the
*framing*: a decision's claim is "in" only when its attackers are defeated, not merely declared.

## 2. ASPIC+ / abstract argumentation for requirements & design rationale
ASPIC+ (Prakken 2010; Modgil & Prakken 2014 survey) formalizes rule-based arguments with undermining (attacks a
premise), rebutting (attacks a conclusion) and **undercutting** (attacks the inference rule itself, without
claiming the conclusion false) attacks. Design-rationale tooling built on this line (e.g. Potyka & Toni-style
QBAF trade-off analysis for software decisions; IBIS/gIBIS issue-based information systems, Conklin & Begeman
1988, which structure design discussions as Position/Argument graphs) is the closest *applied* precedent for
"derive an argument graph from a design document's own structure." T48's own header already notes Mole's
reasoning engine has no premise-conclusion structure (PCS), so an "undercut" there collapses to a plain attack on
the conclusion -- T54 inherits that same simplification rather than re-opening it (PCS support is T48's own
stated non-goal, not T54's to fix).

## 3. ArgLLMs (arXiv 2405.02079, Freedman et al. / Toni group, "Argumentative Large Language Models for
Explainable and Contestable Decision-Making")
The exact shape this task's done-when asks for: an LLM *drafts* candidate arguments (for/against a claim) in
natural language, then a **formal argumentation semantics** (quantitative bipolar framework, gradual semantics)
-- not the LLM itself -- decides which arguments stand and what the final verdict is. Two things T54 borrows
directly: (a) the LLM's role is drafting/judging text, never computing the graph's own verdict; (b) "which
arguments still stand" is reported back to the LLM-facing step as structured input, not re-derived by the LLM.
One thing T54 does NOT borrow: ArgLLMs's BAFs use gradual (continuous-strength) semantics over an LLM-drafted
graph; Mole's engine only ships Dung grounded (binary in/out/undecided) over a hand- or rule-derived graph --
adopting gradual semantics is out of scope for this task (it would mean building a second evaluator in
packages/reasoning, not wiring the existing one in).

## 4. Argumentation-based design rationale checking (general field term, searched 2026-11-02)
Compliance-checking literature on ADRs/requirements (e.g. "Arguing about requirements" workshops at
RE/CAiSE, Toulmin-model-based design rationale capture) consistently separates (i) *capturing* arguments
(claim/grounds/warrant/rebuttal) from (ii) *evaluating* them with a semantics once captured -- and notes that
real-world design records (ADRs, RFCs) almost never have hand-authored rebuttal structure: a team writes "we
chose X because Y" and "considered Z" without writing a formal counter-argument graph. That gap is exactly what
this task's contract flags for Mole's own bench corpus (log4brains/python-tuf/backstage ADRs: zero `.mole/
arguments/*.argdown` files).

## Design choice this task makes, and why (honesty gate, per the task's own instruction)

**Chosen: (a) derive arguments from the ADR's own MADR/Nygard sections.** The M2 v2 bench's 61 ADRs (manifest:
`context/product-plan/systems/metrics-proof/m2-conflict/v2/run/decisions_manifest.json`) have no hand-written
`.mole/arguments/*.argdown` file -- T48's `loadArgdown`/`argumentFramework` path (built, tested, real) has
nothing to load for this corpus, so wiring T48 in "as-is" against this bench would be a no-op, not an honest
engine-in-check wiring. Reading the actual ADRs confirms a narrow but real two-level argument shape MADR
encourages and these ADRs use (log4brains `20200924-use-markdown-architectural-decision-records.md`, read in
full 2026-11-02): a `## Considered Options` list of rejected alternatives, and a `## Decision Outcome` /
`## Decision` section whose "Chosen option: X, because <bullets>" IS a set of stated reasons for rejecting the
other options -- i.e. exactly Position (claim) / counter-Position (rejected option, attacks the claim) /
Argument (stated reason, attacks the rejected option, defending the claim) from IBIS and from ASPIC+'s rebutting
attack, already sitting in the document's own headings, not invented by T54.

Rejected (b): writing a second bipolar/gradual evaluator (ArgLLMs-style, ref 3) to score Consequences
paragraphs by sentiment was tried in sketch form and dropped -- see `2 insights.md`: a one-level "any negative
Consequences line attacks the claim, nothing rebuts it" framework makes the claim 'out' on almost every real ADR
(ADRs document trade-offs by nature), which is a *trivial*, non-discriminative use of grounded semantics, not the
real two-level Considered-Options/Decision-Outcome structure that ADRs actually carry. T54 keeps Consequences
descriptive (shown to the judge, never fed into the evaluated attack graph) for that reason.
