# T120 — pre-registered protocol: semantic-routing eval on NEW (never-used-in-B2) repos

**STATUS: FROZEN, NOT RUN.** Per the task's stop condition and the queue brief ("the orchestrator
runs it"), this protocol is written and code-hash-pinned but this task does not execute it.

## 1. Frozen implementation

Code under test: `packages/decisions/src/route/route.ts` + `types.ts` as of commit
`4fdb3e5e7a30c84c6269948206ff5c7d71c1a234` (embedBoost + useGovernsSummary, this task) — see
`4 log/frozen.sha256` for the per-file sha256. Any code change after that commit invalidates this
freeze; re-run the gate steps below before trusting a result from a later commit.

## 2. Repo selection — must satisfy ALL of:

1. **Never used in any B2 version** (v2, v3, v4, v4.1, v4.2, v4.3) — excludes: backstage,
   log4brains, python-tuf, easi-app, powertools-python, claw-operator, handbook, merino-py,
   hmrc-frontend, semantic-kernel, jaeger, content-publisher, email-alert-api (13 repos).
2. Public GitHub repo with a real `docs/adr`-shaped folder (any of: `docs/adr`, `docs/adrs`,
   `docs/decisions`, `architecture/decisions`, `adr/`) containing **>=8 non-template ADR files**
   (fewer gives underpowered per-repo recall CIs, same lesson as v3's n=4 backstage cell).
3. **Resolvable GitHub slug confirmed by a live API call** before the repo is picked (T120's own
   gap: claw-operator/handbook were never resolved and are excluded from measurement for exactly
   this reason — do not repeat it; verify `curl https://api.github.com/repos/<slug>` returns a
   real `full_name` before committing to a repo).
4. Git repo size < 1 GB (`.size` field from the GitHub API, KB) OR fetch ADR text via the
   contents/raw API only (as this task did) — **never a full clone** if size is unknown or large;
   confirmed by `df -h` before and after any clone this protocol's runner does perform.
5. At least one candidate repo should be from a DIFFERENT domain/language than the 13 already
   used (all skew toward US/UK government + infra/SDK repos) — pick from a different space
   (e.g., a data-science, mobile, or game-engine repo with ADRs) to test generalization, not just
   more of the same shape.

**Two candidates to pre-register now, found by a GitHub code search for `docs/adr` +
`>=8 files` + not in the excluded-13 list** (verify live before running — these are proposals,
not yet confirmed against gate criteria 2-4 above):
- `nodejs/node` style large infra repos are too big (clone-risk) — avoid.
- Prefer small, focused OSS projects with an explicit ADR folder: candidates to check first
  (NOT yet verified against this protocol's own gates — verify before use, do not assume):
  any repo discovered via `site:github.com "docs/adr" -backstage -jaeger` style search, filtered
  through steps 1-4 above at run time.

## 3. Case construction (same method as v3/v4.1/v4.2/v4.3 `build_cases_v*.py`)

For each selected repo: for each real ADR, construct >=1 synthetic diff that VIOLATES it, >=1
that COMPLIES with it, by editing real code near a file the ADR's own text or scope references
(never a file chosen because it's convenient — must be a genuine candidate for a developer to
touch given that ADR). Add `'none'`-labeled cases: real diffs that touch files with NO governing
decision, to measure false alarms. Target **>=30 cases per repo** (v4.3's smallest, email-alert-
api, had 25 heldout cases and still showed CI width issues; aim higher where the repo's ADR
count allows it).

## 4. Leak gates (constructed-benchmark-leak-gates skill) — run on EVERY held-out case BEFORE
   any label is trusted, per class (violate / compliant / none), not pooled:

- **Keyword gate**: a rule looking only for cue words ("instead of", "anti-pattern", "violates",
  the ADR's own title words) must score at or below chance per class. Any class it beats chance
  on is DISQUALIFIED until the leak (a verdict word left in a diff comment, a constructor's own
  naming convention) is found and fixed.
- **Structural gate**: a no-content classifier (new file? file size? touches a test? import
  added?) must not beat the majority-class baseline per class. (v4.2's violate class was a
  near-constant predictor 59/60 on one structural feature — check for exactly this shape before
  trusting any class.)
- **No-context LLM gate**: a model given ONLY the case (diff + file path + repo name), NEVER the
  ADR/decision text, must score within its own chance CI per class.
- **Scope-harness gate**: unit-test every selected repo's own ADR id naming FORM (numeric,
  slug, date-prefixed, repo-prefixed) against the id-normalizer BEFORE running any arm — T112b's
  correction shows a silent id-matching bug can erase an entire repo's recall to 0 without
  tripping any other check. Add fixtures for the new repo's own id shape to
  `adr_id_normalize.test.mjs` (or confirm it already covers the shape) before this protocol runs.

## 5. Arms to run (frozen, same hyperparameters as v4.3 unless this task's own DEV measurement
   justifies a documented change — see `4 log/recall-dev.md`'s honest conclusion: DO NOT assume
   embedBoost+governsSummary is a clean win; run it as a DISTINCT, separately-reported arm, not a
   silent replacement of the baseline):

1. `bm25-baseline` (current default T53, no flags) — the control.
2. `bm25+embedBoost` (all-MiniLM-L6-v2 embeddings, precomputed once per repo at capture time).
3. `bm25+embedBoost+useGovernsSummary` (governs-summaries generated ONE CALL PER DECISION, not
   bulk-per-repo — `4 log/recall-dev.md` shows the bulk-prompt format drifted and silently lost
   coverage on 6 of 10 repos; do not repeat that shortcut in a scored run).
4. Full two-stage cascade (stage-2 listwise LLM pick) for EVERY arm above — this task's DEV
   measurement is stage-1-only and could not report a valid false-alarm number; this protocol's
   run MUST include stage 2 to make the false-alarm comparison real.

## 6. Metrics, pre-registered

- Recall@1/3/5 per repo and pooled, with the same CI method v4.3 used (exact binomial / Wilson).
- False-alarm rate on `'none'` cases per repo and pooled (stage-2 cascade, not stage-1-only).
- McNemar (exact, two-sided) on false alarms, baseline vs each new-signal arm, same posture as
  v4.3's own primary test.
- Cost + latency per arm, reported the same way as `4 log/recall-dev.md`'s Cost/latency section
  (one-time governs-summary cost separated from per-route cost).

## 7. Decision rule (fixed before running, not after seeing results)

- If `bm25+embedBoost+useGovernsSummary` does not beat `bm25-baseline` on pooled R@1 by more than
  its own CI width, report NO IMPROVEMENT SHOWN, not a qualified win — same posture as the task's
  own DEV-vs-SEEN disagreement (gains on DEV, a real R@1 loss on 2 of 4 SEEN repos).
- Any single-repo result (n < 20) is reported standalone AND pooled, never pooled-only.

## 8. What this task explicitly did NOT do (so the orchestrator knows the real gap)

- Did not select or verify the 2 candidate NEW repos against gates 2-4 above (search queries
  only sketched, not run against live GitHub data under this task's time budget).
- Did not write `build_cases_new_repos.py` (case-construction script) — only specified its
  contract (same method as v3/v4.1-4.3's own scripts, cited above).
- Did not run leak gates on any new case (none exist yet).
- Did not implement the per-decision (non-bulk) governs-summary generator the DEV measurement's
  honest conclusion recommends — `4 log/recall-dev.md` section "Honest conclusion".
