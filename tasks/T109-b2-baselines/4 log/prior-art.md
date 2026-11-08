# T109-b2-baselines -- prior art (R0, before any new baseline code)

Read in full before writing baselines/linter_arm_v3.py, run_guidelines_arm_v3.py, run_judge_arm_v3.py.

1. **CodeRabbit code guidelines / path instructions** -- docs.coderabbit.ai/knowledge-base/code-guidelines
   and docs.coderabbit.ai/configuration/path-instructions (fetched 2026-11-07). CodeRabbit imports a team's
   existing standards docs (AGENTS.md, CLAUDE.md, .cursorrules, etc.) verbatim and applies them across the
   whole repo during review, plus scoped path_instructions for specific globs. This is baseline (b)'s model:
   give the reviewer ALL of a repo's real decision records as standing guidelines (not a retrieval step),
   ask for a structured review, and parse its verdict -- same shape CodeRabbit's "Code Guidelines" import
   uses in production.

2. **Wealthfront Iris, antagonistic (prosecutor/defender/judge) review** --
   eng.wealthfront.com/2026/08/03/experiments-with-ai-code-review/ (fetched 2026-11-07), corroborated by
   agentrex.ai/blog/ai-code-review-argues-against-itself/ (same date). Direct quotes: "When it finds a
   potential problem... This spawns two sub-agents per problem: one model to argue that the concern is
   real and one model to argue it isn't... Opus 4 is asked to weigh the evidence impartially... Giving
   each model a distinct role (plaintiff, defendant, judge) tends to produce better evidence and clearer
   judgement... Antagonistic review slightly increased true positives and greatly decreased the number of
   false positives." This motivates baseline (c): a prosecutor/defender/judge pass on the SAME 1-3
   decisions T53's own router already selected, to see if false alarms drop. Wealthfront runs this as 3
   separate model calls (~$4/review); this task's compute budget does not support 3 calls x 89 cases on
   top of 2 other new arms, so this implementation SIMULATES the 3 roles in ONE call -- logged as a scoped-
   down stand-in in results-v3-baselines.md, not hidden.

3. **dependency-cruiser rules reference** --
   github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md (fetched 2026-11-07).
   `forbidden`/`allowed` rules are import/dependency-graph conditions (module A must/must-not depend on
   module B, matched by regex over resolved paths). Sampling all 51 of v3's real ADRs' decision_text shows
   every one is a PROSE policy decision (language/library choice, naming convention, process, file layout)
   -- none encodes an import-graph constraint dependency-cruiser's rule engine is built to check. This is
   why baseline (a) compiles to grep-style regex-over-diff rules instead (the other half of the brief's
   "dependency-cruiser / grep rules" phrasing, queue/brief.md) -- the choice is logged, not silently
   substituted.

4. **Mole's own real rules compiler, T92** -- docs/decisions-and-rules.md and plugins/claude-code/scripts/
   lib.mjs (T92's "crisp (zero-model, deterministic: TS AST + dependency-cruiser...) rule" compiler,
   packages/decisions/src/rules). That compiler operates on Mole's own .mole decision records' structured
   `rules:` field (import/call-graph constraints), which v3's real external ADRs do not carry and cannot be
   inferred to carry without a checked-out module graph -- still not reused directly here.

5. **Mole's own real COMPILE-AT-CAPTURE + CASCADE, T46 (review F1 fix, deleg_ebac273d task 1, HIGH)** --
   packages/decisions/src/compile/draft.ts (`draftChecksFor`, the same compiler
   tasks/T46-decision-check-compiler/4 log/bench/compile_adrs.mjs used on Backstage's own ADRs) +
   packages/decisions/src/cascade/cascade.ts (`isCrisp`: a `match:` content-anchor hit decides outright,
   zero-LLM, no escalation). Review finding: the grep-over-prose linter (baseline a, now relabeled "naive
   zero-model grep substitute") is a strawman for "why not a linter?" -- it was never Mole's OWN best
   zero-model-at-check-time design, so it understates what a real zero-model check can do. Baseline (d),
   t46_cascade_arm_v3.mjs, IS reused directly: one real `hermes` call per unique held-out ADR (31, excluding
   the 30 adr_id="none" distractor cases) drafts `match:` patterns from the ADR's own text alone (compile-
   at-capture, amortized/offline, never seeing a case diff or label), then those patterns are applied with
   ZERO model calls at check time, using the SAME per-line regex test pr-check.ts's content anchors use
   (`c.re.test(line)`, bounded to MAX_MATCH_LINE). `rules:` (dependency-cruiser) drafts are reported but NOT
   applied -- v3's case diffs have no checked-out module graph to run a real dependency-cruiser cruise
   against, and prior-art.md item 3 already found 0 of v3's 51 ADRs encode an import-graph constraint in the
   first place, so this gap is expected to cost nothing. The LLM escalation tier (cascade.ts's second call
   for a scope-anchor-only, non-crisp hit) is deliberately NOT run here either, per the task's own "zero-LLM
   checks at check time" framing for this arm -- a real difference from Mole's shipped cascade, stated in
   results-v3-baselines.md, not hidden.

6. **v3's own stats code (reused verbatim, not re-derived)** --
   context/product-plan/systems/metrics-proof/prelim-11-01/mc-agent-ab/v4/raw/stats.py: Wilson score
   interval, already verified against v3's own published number (regression_wilson95 x=0,n=14) before this
   task's results.json computation. McNemar exact (scipy.stats or a from-scratch binomial, same formula
   v3/v2's results.md cites) is applied the same way v3's own results.json did (same 3-pair vs-T53
   comparisons, now extended to 3 more arms).
