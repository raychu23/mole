# Prior art — T23 decision-traces-intake (R0)

Read before the R1 red-tests commit, per `prior-art-first` / loop rule R0.

## 1. nuanced.dev — spec-driven workspace for agentic coding

- https://nuanced.dev (home) — accessed 2026-10-29
- https://nuanced.dev/blog/the-AI-coding-app-for-thinking — accessed 2026-10-29
- https://nuanced.dev/blog/spec-driven-development-is-how-we-get-our-minds-back — accessed 2026-10-29
- https://nuanced.dev/blog/a-new-spec-interface — accessed 2026-10-29

What it does: a desktop app where a human writes a living "spec" (goal, constraints, scope, invariants) through
"progressive disambiguation" — the agent asks one clarifying question at a time before building, and tasks are
generated from the spec. The spec is the human-owned source of truth; the agent's job is to keep the diff aligned
to it and surface drift ("work drifts out of scope, violates assumptions").

Relevance / contrast to T23: Nuanced puts the *agent* in the asking role before code is written, and a human writes
and edits the spec directly in response. Ayman Nadeem's 10-28 point (people write, agents interrogate) and
Raymond's "similar to my sort of gronded vision" (10-29) flip this for Mole: the **person** writes the decision
record (like Nuanced's spec), and the **agent only asks questions afterward, grounded in facts code already
found** (diff hunks, past fixes, tests) — never drafting the record's own text. That is T23's boundary with the
earlier rejected plan ("model extracts and drafts records") and with R6 (a model may only phrase text over facts
code found, never invent facts). Design taken from Nuanced: ask about concrete things (goals, constraints, scope)
rather than free-form review; cap the number of questions per turn so the author isn't flooded.

## 2. Automation bias in AI-assisted / AI-generated code review

- https://blog.codacy.com/automation-bias-in-ai-generated-code-review-why-clean-code-still-ships-broken — accessed 2026-10-29
- https://link.springer.com/article/10.1007/s00146-025-02422-7 (Exploring automation bias in human-AI collaboration, AI & SOCIETY 2026) — accessed 2026-10-29
- https://arxiv.org/pdf/2607.09434 (How Do Software Professionals Evaluate AI-Generated Code?, registered report, arXiv 2607.09434) — accessed 2026-10-29
- https://www.microsoft.com/en-us/research/publication/after-organizational-ai-acceptance-ai-bias-fades-but-a-junior-penalty-persists-in-code-review — accessed 2026-10-29

Core finding used here: automation bias is the tendency to over-trust output that *looks* authoritative (clean,
confident, well-formatted) and stop actively verifying it once it looks right (Codacy; Goddard/Roudsari/Wyatt 2012
systematic review, cited by the AI & SOCIETY review). The registered report (arXiv 2607.09434) notes developers
reach for *indirect* evaluation (asking AI to critique its own output) instead of direct comprehension, which is
exactly the failure mode Ayman Nadeem names: "AI-generated specs get approved passively." Mitigations the
literature converges on: force direct, concrete checks at the point of change rather than relying on a summary;
make the reviewer answer something that requires looking at the artifact, not just reading a gloss of it.

Design taken: T23's assumption checks are phrased as pointed questions over specific facts (a scope path, a cited
commit, a tenet) rather than a general "does this look right?" prompt, because a vague prompt is exactly what
automation bias slides past.

## 3. MADR — Markdown Architectural Decision Records (required fields)

- https://adr.github.io/madr/decisions/adr-template.html — accessed 2026-10-29
- https://adr.github.io/madr/decisions/0000-use-markdown-architectural-decision-records.html — accessed 2026-10-29
- https://adr.github.io/adr-templates — accessed 2026-10-29

MADR's template structure: Context and Problem Statement, Decision Drivers, **Considered Options**, Decision
Outcome (chosen option + justification), Consequences (good/bad), Confirmation (how compliance is verified), Pros
and Cons of the Options. Mole's own `.mole/decisions/*.md` (T29) already carries MADR-ish front matter (status,
door, traces_to, scope, evidence, approver, source) but the Mole corpus's bodies are short "Context / Decision"
prose without a Considered Options or Alternatives section (see e.g. 0007, 0011, 0013) — only 0015 names an
alternative ("ELK layered layout … Alternative considered").

Design taken: the "no alternatives considered" assumption check is MADR's own required field, operationalized as
a text/edge check — a record that reads like it had exactly one option (no "Considered Options"/"Alternative(s)"
section or `alternative_to` edge) when its own text contrasts an approach, is flagged for that question, not
silently accepted. This gives T23's check set a cite-able standard (MADR) rather than an invented house rule.

## 4. Amazon COE (Correction of Error) — fixed question lists per phase

- https://aws.amazon.com/blogs/mt/creating-a-correction-of-errors-document — accessed 2026-10-29
- https://d1.awsstatic.com/events/Summits/reinvent2022/ARC308_Improving-resiliency-with-the-correction-of-error-process.pdf — accessed 2026-10-29

COE's format: a fixed, small list of pointed questions per phase (Detection / Diagnosis / Mitigation), each
answerable from evidence already collected, plus "5 Whys" chained on the answers — not an open "what happened"
essay. Explicitly **not for blame**; the questions exist so the facts are on the record, not so someone is caught
out.

Design taken: T23 caps the author at **up to 3** pointed questions (same shape as COE's bounded phase lists), each
built from one category of evidence Mole already gathered (diff hunks, linked PR/issue, transcript excerpt,
past fix, test) rather than invented from scratch — mirrors COE's "ask about what you already instrumented,"
including the "nothing governs the change → silent" case (COE only fires on an actual event).

## 5. Vale — rule-based prose linting

- https://docs.vale.sh/ — accessed 2026-10-29
- https://docs.vale.sh/topics/styles — accessed 2026-10-29
- https://docs.vale.sh/guides/faq — accessed 2026-10-29

Vale's rule shape: `extends` (which deterministic check runs: existence / substitution / occurrence / consistency
/ conditional / capitalization / script …), `scope` (where it looks), `message` (what it says), `level`
(warning/error) — every rule is a small deterministic pattern match over the document's own text/structure, with
no model in the loop by default; a style is just a directory of such rules, and `vale sync` makes them shareable.

Design taken: T23's "assumption checks" are written the same way — each is a named, independent, deterministic
rule (`no_alternatives`, `scope_not_anchored`, `contradicts_tenet`, `stale_citation`) over the record's own
parsed fields/text and git state, each producing a flag + a message + a file:line, composable and testable in
isolation, exactly like a Vale style is a directory of independent `.yml` rules. This is also the structural
precedent for R6 (checks are code; a model, if ever enabled, only rewords the `message`, it is never the
`extends`/check itself).

## How the field measures this (used for T23's bench, M30)

None of the five sources above publish a single standard "flaw-catch rate" metric for decision-record review —
COE and MADR are process/template standards (not benchmarked), and the automation-bias literature measures
*human* over-trust, not an automated checker's precision/recall. T23 therefore reuses Mole's own established
method for this kind of claim (same shape as T14's M4 question-usefulness key and T29's M21 flag-recall key,
both already in `tasks/loop-goals.json`): a key hand-labeled from the artifacts *before* the implementation
exists, by a different method than the code under test (reading the decision files and `git log` directly,
not running the parser), scored for recall/false-flag rate against planted and real cases. That is the standard
this repo already holds every other flag-style metric to (M19, M21), so T23's M30 uses the same scoring shape
for comparability across Mole's own metrics.

## Decisions taken for T23 from this research

1. Person writes the record (MADR shape); Mole never drafts `why`/`context`/`consequences` text (nuanced.dev
   contrast + R6).
2. Checks are small, independent, deterministic rules over facts already on disk/in git (Vale shape), not a
   single prose-quality score.
3. Four assumption-check categories, each traceable to the research above: `no_alternatives` (MADR's Considered
   Options), `scope_not_anchored` (a record's scope claims code that isn't there — the concrete-check mitigation
   for automation bias), `contradicts_tenet` (COE-style: a question is asked because it's backed by a specific
   cited fact — here, the project's own tenets.md — not a vague "does this seem right"), `stale_citation` (a
   record cites file:line/commit that has since changed — again, a concrete, checkable fact, not a vibe).
4. Up to 3 questions per author turn (COE's bounded-list shape), silent when nothing governs the change.
