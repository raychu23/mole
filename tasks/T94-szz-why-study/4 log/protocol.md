## Summary
What: pre-registered analysis plan for D82 — does a commit/PR with a stated "why" (ADR touched or
referenced, or an explicit rationale/motivation line) get SZZ-flagged as bug-inducing less often than a
comparable commit without one? Frozen (sha256 below) BEFORE any mining or analysis code ran. Repos:
ledgersmb/LedgerSMB, cloudfoundry/cli, softwaremill/tapir — all public, GitHub Issues enabled, `doc/adr/`
folder present (43 / 12 / 12 ADR files respectively, confirmed via `git ls-tree` 2026-11-04). Deviation from
the task brief's draft "≥50 ADRs" bar is documented and justified below (prior-art.md §3): no public repo
found in budget meets that bar; MSR literature shows it's close to unmet-in-general (only 47/921 ADR-using
repos exceed 20 ADRs). This protocol is frozen before mining; any later deviation will be logged, not
silently applied.

---

### 1. Repo selection rule (pre-registered, evidence-based relaxation)
Original brief draft: "≥3 public repos with an ADR/decisions folder ≥50 ADRs + issue tracker linking fixes."
Evidence this is infeasible in budget: prior-art.md §3 (MSR 2023: only 47/921 ADR-repos have >20 ADRs; our
own search of ~20 real-project candidates found max 43). **Relaxed, final rule, applied BEFORE mining**:
  - public GitHub repo, GitHub Issues enabled (`has_issues=true`), ≥500 commits on default branch, AND
  - a `doc/adr/` or `docs/adr/` folder with ≥10 dated Markdown ADR files, AND
  - ≥3 such repos selected: the 3 highest-ADR-count repos found in our bounded search (documented in
    prior-art.md) that also pass the issue/commit volume bar.
Selected: **ledgersmb/LedgerSMB** (43 ADRs), **cloudfoundry/cli** (12 ADRs), **softwaremill/tapir** (12
ADRs). Small ADR counts (12-43) are a real limitation on power for the "touches an ADR file directly" arm
of the why-detector; noted in results.md losses/limits.

### 2. Unit of analysis
One row = one non-merge commit on the repo's default branch that modifies ≥1 tracked source file (any
extension; commits that touch only `doc/adr/**`, `*.md` only, or CI config only are excluded from the
denominator — they are not "changes" in the sense D82 asks about). Mining window: last 3 calendar years of
history as of clone date (2026-11-04), i.e. commits since 2023-11-04, to bound clone/mining cost and avoid
very old infra-era noise. This is a commit-level unit, not hunk-level or PR-level (PyDriller's SZZ interface
operates on commits).

### 3. "Has a why" detection — deterministic, no model (frozen rule)
A commit is coded `has_why = 1` if its full commit message (which on these repos' squash-merge-by-default
history usually equals the PR title+body) matches ANY of the following regexes (case-insensitive, applied
to the raw message; checked in this order, first match wins, all are OR'd):
  1. **ADR touch**: the commit's diff includes a path matching `^doc(s)?/adr/.*\.md$` (the commit itself
     adds/edits an ADR) — detected via PyDriller `commit.modified_files` path list, not regex on message.
  2. **ADR reference**: message matches `\bADR[-_ ]?0*\d{1,4}\b` or `doc s?/adr/0*\d{1,4}` (references an
     existing ADR number by the repo's own filename convention — checked against the actual set of ADR
     file numbers present in that repo at HEAD, so a bare "adr 2" in an unrelated context without a real
     ADR-2 file does not count).
  3. **Explicit rationale marker**: message contains a line (after stripping leading `*`/`-`/whitespace)
     starting with one of `why:`, `rationale:`, `reason:`, `motivation:`, `context:` (case-insensitive),
     OR a Conventional-Commits-style footer `BREAKING CHANGE:` followed by ≥1 sentence of prose (a known
     rationale-carrying footer), OR the message contains both an imperative summary line AND a blank-line-
     separated paragraph of ≥20 words in the body (a syntactic proxy for "what" + "why" paragraphs,
     deliberately weaker than Li & Ahmed 2023's ML classifier since D82 requires no model — documented as
     a precision/recall tradeoff limitation, not fixed post-hoc).
All other commits: `has_why = 0`. This is fully reproducible from message text + file-path list alone; no
LLM or trained classifier is used at any step (per D82 rule).

### 4. Bug-fix identification (deterministic)
A commit is a **bug-fixing commit** if its message matches `\b(fix(es|ed)?|close[sd]?|resolve[sd]?)\b.*#\d+`
(conventional GitHub closing-keyword syntax) AND the referenced issue number, fetched via `gh api repos/
<repo>/issues/<n>`, has `state=closed` and is NOT labeled `enhancement`/`feature` (keeps "fix" commits that
are actually bug fixes per the project's own issue labels, not feature work that happens to say "fixes").
Commits matching the fix regex whose issue can't be resolved (deleted/private/rate-limited) are dropped from
the bug-fix set (not imputed as either class) — logged as an exclusion count in results.md.

### 5. SZZ variant
PyDriller's `Git.get_commits_last_modified_lines(commit)` run on each identified bug-fixing commit = B-SZZ
(basic SZZ, no comment/whitespace filtering beyond git's own diff algorithm, no refactor-aware filtering).
Chosen for determinism and because it ships in the already-approved tool (PyDriller) with zero extra deps.
Limitation (cited, Rosa et al. 2021 / da Costa et al. 2017 / Lyu et al. 2023): B-SZZ over-attributes blame
relative to AG-SZZ/MA-SZZ/RA-SZZ and has recall/precision in the 0.4-0.6 range even on well-labeled data —
our bug-inducing labels are noisy, not ground truth; effect sizes should be read as conservative/attenuated
at best, not exact.

### 6. Outcome
Binary per source-touching commit C (as defined in §2): `bug_inducing(C) = 1` if C appears in the SZZ-
returned set for at least one bug-fixing commit within the mining window; else 0. (A commit can only be
"caught" as bug-inducing if a later bug-fix commit's SZZ blame-set includes it — commits in the last ~90
days before the window end are excluded from the denominator to avoid right-censoring bias, since they
haven't had time to be fixed yet.)

### 7. Model
Logistic regression, one pooled model across the 3 repos:
```
bug_inducing ~ has_why + log1p(lines_added+lines_deleted) + log1p(files_changed) + log1p(author_prior_commits_in_repo)
```
with cluster-robust standard errors by repo (3 clusters — explicitly noted as too few clusters for the
cluster-robust SE asymptotics to be trustworthy; reported alongside a repo-fixed-effects alternative as a
robustness check, not as the headline). Effect reported as the odds ratio for `has_why` with a 95% CI
(bootstrap CI by resampling commits within repo, 2000 resamples, in addition to the analytic cluster-robust
CI — report both, flag if they disagree).

### 8. What counts as a null result (frozen before seeing data)
The effect is declared **null** (no support for D82's hypothesis) if ANY of:
  - the 95% CI for the `has_why` odds ratio includes 1.0, OR
  - the point estimate OR is within [0.8, 1.25] (negligible effect size) even if the CI excludes 1.0 due to
    large n, OR
  - fewer than 30 bug-inducing commits are identified with `has_why=1` in total across all 3 repos (too few
    events to estimate the coefficient meaningfully — in this case report "NOT RUN: insufficient events",
    not a point estimate).
No post-hoc threshold changes, no "try another SZZ variant until significant," no dropping repos after
seeing results. One analysis, run once, reported however it comes out — losses/limits reported first in
results.md regardless of direction.

### 9. Freeze
This file is frozen at the sha256 recorded in `4 log/FROZEN.sha256`, computed immediately after this write
and before any mining script executes. Any edit to this file after that point invalidates the
pre-registration and must be logged as a deviation in results.md, not silently applied.
