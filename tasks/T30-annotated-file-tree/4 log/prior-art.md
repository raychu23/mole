# Prior art: M22b (harder "why" questions over decision records)

R0 (prior-art-first skill, loop rule R0). Done before any M22b key or score existed. 5 primary sources, fetched
2026-10-29, each with its reported numbers and whether it fits T30's case.

## 1. Ko & Myers, the Whyline — "why did/why didn't" questions, paired with-tool/without-tool study
- Source: Ko & Myers, *Finding causes of program output with the Java Whyline* (ICSE 2009, doi:10.1145/1518701.1518942);
  Ko, *Extracting and answering why and why not questions about Java program output* (ACM TOSEM 2010,
  doi:10.1145/1824760.1824761); Ko 2008 CMU dissertation (CMU-HCII-08-106).
- Who uses it: the program-comprehension/debugging-tools literature cites Whyline as the reference design for
  evaluating a "why" tool against a control.
- Reported numbers (dated 2009/2010): Whyline users were **3x more successful and 2x as fast** than developers using
  a plain breakpoint debugger on two real bug-report tasks; a median of 4 "why did" questions per session; on a task
  where both groups hit a ceiling, the groups showed no speed difference (ceiling effects named explicitly — the
  same failure mode T30's first M22 proxy hit at 15/15 vs 15/15).
- Fits us: yes, directly. This is the standard design for "does a why-question tool help" — a WITH arm and a WITHOUT
  arm answer the same why-questions, scored on two axes: correctness (success rate) and effort (time / steps), not
  correctness alone. It also names the exact failure we already hit (ceiling effects hide a real difference) and
  the fix (harder tasks so neither arm saturates).
- What we borrow: (a) **two-axis scoring** — correct answers AND effort (we use tool calls + wall time per run,
  since cost/turns is what `claude -p --output-format json` reports deterministically, R6); (b) **avoid ceiling
  effects** by choosing questions a without-arm cannot trivially get right 15/15 — i.e., make the search cost real
  (many candidate records, several folders) rather than making the facts unknowable.

## 2. CodeQA — question/answer independence from the code under test
- Source: Liu & Wan, *CodeQA: A Question Answering Dataset for Source Code Comprehension* (EMNLP Findings 2021,
  arXiv:2109.08365, retrieved 2026-10-29).
- Who uses it: code-QA benchmark line (119,778 Java + 70,085 Python QA pairs), cited as the first large free-form
  code-QA benchmark.
- Reported numbers (2021): neural baselines perform poorly ("neural models struggle to generate correct answers"),
  used as a benchmark, not a passed/failed bar; dataset construction explicitly notes the answer "usually cannot be
  directly extracted from the source code" — it is generated from the comment, a different artifact than the code.
- Fits us: yes, for the **independence principle**, not the exact task (CodeQA answers come from doc-comments over
  single functions; T30 needs folder-level "why" from decision records). CodeQA's method is "derive the answer from
  an artifact other than the code being questioned" — here, the decision record / intent card, not the diff/comments
  under test.
- What we borrow: label every M22b question by hand against the decision record text BEFORE writing a line of score
  code (key independence, loop_rules R1/the metric-gated-build-loop key-independence rule), and explicitly
  reject any question whose answer also appears in a code comment or file/folder name (this is what sank 3 of the
  5 M22 questions on re-inspection below — `0007`/`0008`/`0009`/`0013`/`0015`-style decisions already restated in
  comments in Mole's own code).

## 3. Xia et al., field study of program comprehension — wall-clock time as the metric
- Source: Xia, Bao, Lo, Xing, Hassan, Li, *Measuring Program Comprehension: A Large-Scale Field Study with
  Professionals* (ICSE 2018 / IEEE TSE 2018, doi:10.1109/TSE.2017.2734091, retrieved 2026-10-29).
- Who uses it: cited as the largest field measurement of comprehension time (78 professionals, 3,148 working hours,
  7 real projects).
- Reported numbers (2018): developers spend **~58% of their time on program comprehension** activities; senior
  developers spend a significantly lower percentage than juniors.
- Fits us: partially — it is a field study of real engineers, not a controlled with/without tool comparison, so its
  bar does not transfer directly. What transfers is the **metric itself**: comprehension measured as time, not just
  correctness, and the finding that experience (familiarity) changes comprehension time a lot, which is exactly why
  the M22b design restricts both arms to "unfamiliar" folders (so neither arm gets the senior-developer discount).
- What we borrow: report wall time per arm/run alongside correctness, same as M22's own decorations p95 already
  does for the deterministic half of M22.

## 4. SWE-bench — deterministic, code-computed scoring; contamination/independence warning
- Source: Jimenez et al., *SWE-bench: Can Language Models Resolve Real-World GitHub Issues?* (ICLR 2024 oral,
  arXiv:2310.06770); SWE-bench evaluation guide (github.com/SWE-bench/SWE-bench, evaluation.md); OpenAI, *Why we no
  longer evaluate SWE-bench Verified* (openai.com, 2025, retrieved 2026-10-29).
- Who uses it: the standard coding-agent benchmark (500 instances in SWE-bench Verified), widely reported by every
  major model lab.
- Reported numbers (dated): scoring is binary per instance — patch applies, repo's own unit tests pass/fail, in a
  pinned Docker container, no human or model judge. OpenAI's 2025 note: scores have become hard to trust specifically
  because of **training-time exposure to the public issue/PR pairs** — i.e. a benchmark whose answer key can leak
  into what's being tested stops measuring what it claims to measure.
- Fits us: yes, for two things — (a) grading must be code, not a model judge (R6, already how `m22.ts`'s
  `gradeAnswer`/`mentionsAdr` work, kept unchanged for M22b); (b) the contamination warning is the generalized form
  of our key-independence rule: a subagent must not be able to get the right answer from something other than the
  thing under test (for SWE-bench that's pretraining data; for M22b that's code comments/paths/names).
- What we borrow: keep scoring as plain substring/ID matching in TypeScript (no model judge); treat "the without arm
  can get this right some other way" as a disqualifying property of a candidate question, the same way SWE-bench
  now treats "the model could have seen this issue in training" as disqualifying.

## 5. ADR template comprehension study — controlled small-n experiment design for decision records specifically
- Source: *One Size Fits All? An Empirical Comparison of ADR Templates regarding Comprehension, Usability, and Ease
  of Adoption* (arXiv, retrieved 2026-10-29, DESMET FA expert review + controlled student experiment, n=33);
  Ahmeti/Wohlrab et al., ADR action-research studies (womencourage 2023 poster; ECSA 2024 paper) on ADR adoption in
  industry teams.
- Who uses it: the ADR-specific empirical literature (small, recent — ADRs are an industry practice with little
  controlled evaluation before ~2023-2024).
- Reported numbers (dated): Nygard template scored higher than MADR on a composite comprehension/usability score
  (Wilcoxon W=84.0, p=0.002; Cliff's delta=0.636, "large" effect) with only 33 student participants; the action
  research papers report onboarding/knowledge-transfer benefits qualitatively, with explicit caveats about small
  samples and short study windows.
- Fits us: yes, as the closest analog (decision records specifically, not code or bugs) — and as a caution about our
  own sample size. With n=33 students the ADR study still only claims a between-template effect with standard
  nonparametric tests; M22b runs n=3 per arm (the proxy-study scope this task already commits to, junior study
  deferred to D7). We do not claim statistical significance; we report the two raw numbers (correct answers, tool
  calls) per run and let the >= target comparison stand on its own, same as M22's existing report style.
- What we borrow: report an effect that could go either way honestly (as M22's own blocked-run did for the tie) —
  no p-value theater over n=3; the target is a plain comparison (more correct, or same correct in <= half the tool
  calls), decided at the preregistered level by `loop-goals.json`/the task contract before any run.

## What M22b does with this

1. Keep M22's grading code (`mentionsAdr`, `gradeAnswer`, substring+ID matching) unchanged — R2, and it already
   follows SWE-bench's "deterministic, code-computed" rule.
2. New key independence check (CodeQA + SWE-bench lesson): every M22b question is checked by hand against the
   backstage source files in scope — if the ADR's reasoning is ALSO restated in a code comment, docstring, file name
   or folder name, the question is rejected and a different ADR/folder is used instead. This is why M22b does not
   reuse Mole's own `.mole/decisions` records as the corpus: Mole's own code comments already restate almost every
   decision's reasoning (`packages/daemon/src/server.ts`, `packages/layout/src/layout.ts`, `packages/daemon/src/
   cli.ts` all cite the decision's "why" directly in a comment), which would make a from-code answer trivially
   correct and re-create the exact tie M22 already hit. The backstage ADR corpus (already cloned for M22,
   `~/.hermes/cache/scratch/mole-builder-4/backstage`) does not narrate its ADRs in code, so it keeps the two arms
   honestly separated.
3. Two-axis scoring (Whyline): correct answers AND tool calls/time, both read from `claude -p --output-format json`'s
   own `num_turns` and `duration_ms` fields (R6 — these are facts the harness/CLI computed, not a model's self
   report).
4. Both arms see the SAME repo + the SAME decision records on disk this time (not hidden from the without arm as in
   M22) — the difference under test is narrower and harder: whether the tree's badges+cards save the SEARCH over
   many records across several folders, which is the realistic value claim (T30's goal), not whether records exist
   at all.
