# T46 prior art (done-when 1), read before any code

Papers fetched and saved under `tasks/T46-decision-check-compiler/4 log/papers/` (abstract + full PDF, both sourced from
export.arxiv.org / arxiv.org directly, 2026-11-01):

## 1. ADR violation detection with LLMs -- arXiv:2602.07609
"Evaluating Large Language Models for Detecting Architectural Decision Violations." 980 ADRs across 109 GitHub repos,
multi-model pipeline: one LLM primary-screens candidate violations, three more independently validate. Headline finding we
borrow directly: **LLMs are strong on explicit, code-inferable decisions, and weak on implicit/deployment-oriented decisions
that need organizational knowledge the diff doesn't contain.** This is exactly M2's own finding (mole-capability-and-gap.md,
results.md): both Mole's regex anchors AND the oracle LLM reviewer false-alarm on the SAME two ADRs (adr007, adr014) because
the violation signal there is vocabulary-level, not a hard rule. Design takeaway for T46: the compiler should prefer drafting
a *crisp, code-inferable* anchor (an import, a call, an exact keyword like `export default`) wherever the ADR supports one,
and only fall back to a broad scope-only draft (no content anchor) -- which this task routes to the cascade's LLM tier --
when the decision is genuinely about something a diff alone can't decide. Multi-model cross-validation (their 3-validator
design) is noted but NOT adopted here: T46's cascade spends at most one LLM call per ambiguous case specifically to avoid
that cost multiplier (see FrugalGPT below); single-model-with-a-stop-rule is the FrugalGPT answer to "should we ask more than
one model."

## 2. FrugalGPT (LLM cascades) -- arXiv:2305.05176
"FrugalGPT: How to Use Large Language Models While Reducing Cost and Improving Performance." LLM API pricing differs by
orders of magnitude; proposes a *cascade* of models from cheap to expensive, querying progressively more expensive models
only until a confidence/scoring function is satisfied -- matching the best individual model's accuracy at up to 98% less
cost. T46's cascade design is a direct instance of this with a cheaper-than-cheap zero tier: tier 0 = compiled rules (content
anchors, dependency-cruiser forbidden rules, call-rule scans) at $0 and ~100ms; tier 1 = ONE LLM call, used ONLY when tier 0's
own `governed`-but-`unanchored` signal says "a decision's scope is touched and no rule fired a crisp verdict" -- i.e. exactly
FrugalGPT's stopping rule, implemented as "stop at tier 0 whenever it can decide, escalate once otherwise," never query more
than one LLM call per case (unlike FrugalGPT's own multi-model cascade, because M2's bench showed a single oracle LLM call
already reaches recall 1.00 on this case set -- there is no second, more expensive tier worth adding yet).

## 3. LLM-generated static-analysis rules (Semgrep/CodeQL rule synthesis)
Three 2025/2026 papers converge on the same shape T46 needs for compile-at-capture:
- **SemOpt** (arXiv:2510.16384) -- an LLM rule generator produces Semgrep rules per optimization-strategy cluster, then
  *validates the generated rule against the source commit before accepting it* (their 3-stage: understand -> generate ->
  validate-and-refine). T46 borrows the shape, not the optimizer: draft -> validate against the record's own evidence ->
  a person approves or rejects (T46 replaces SemOpt's automatic refine-loop with a human approval gate, since compile-at-
  capture's whole point, per the task contract, is "a person approves").
- **RuleDroid** (IEEE TSE 2026, Android security) -- generates Semgrep-compatible rules from official docs with RAG
  grounding, explicitly to fix "pure LLM detection"'s high false-positive rate by handing the matching back to a
  deterministic static-analysis engine once the rule is drafted. Confirms the core T46 bet: draft once with a model, decide
  every future check deterministically and for free.
- **RuleRefiner** (ASE 2025 camera-ready, fact-aligned/template-constrained rule enhancement) -- refines a rule against a
  concrete defect-revealing case AND a regression case (don't fix one false negative by introducing a false positive). T46's
  analogue: the compiled draft is validated against the record's OWN decision text and any evidence/scope anchor already on
  file before a person approves it, and approval is versioned so a bad draft can be reverted without losing the decision's
  other content.

## 4. dependency-cruiser (not a paper, a tool: already load-bearing in this repo)
`packages/decisions/src/rules/*` (T27) already compiles a decision record's `rules:` front matter to dependency-cruiser
`forbidden` rules (import-direction decisions) and Mole's own call-rule scan (banned-call decisions) -- see compile.ts,
check.ts, cli.ts. T46 does NOT reimplement this: the compiler drafts into the SAME `rules:`/`match:`/`scope:` shapes T27/T32
already execute at check time, zero-LLM, for free. T46's new work is strictly upstream (who writes `rules:`/`match:`,
not by hand but drafted by a model and approved by a person) and the cascade (what happens when none of T27/T32's
deterministic checks decide).

## Net design decision this prior art licenses
Compile-at-capture = SemOpt/RuleDroid/RuleRefiner's draft-validate-approve loop, targeting T27/T32's existing rule and
content-anchor shapes (no new execution engine). Cascade = FrugalGPT's stopping rule with exactly one escalation tier,
because 2602.07609 and M2's own results agree an oracle single LLM call already gets the recall that matters here, and
2602.07609's finding (explicit/code-inferable decisions are what LLMs -- and regexes -- get right, implicit ones are what
both get wrong) sets the actual target for the compiler: push as many ADRs as possible from "no rule at all" into "a crisp,
code-inferable rule," and let the cascade catch the genuinely implicit remainder with one LLM call, not a bigger regex.
