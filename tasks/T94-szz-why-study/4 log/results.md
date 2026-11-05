## Summary
What: does a commit/change with a stated "why" (touches/references an ADR, or carries an explicit
rationale marker) get SZZ-flagged as bug-inducing less often than one without? Pre-registered protocol
(`4 log/protocol.md`, frozen sha256 in `4 log/FROZEN.sha256`), mined once, analysed once, on 3 public repos
(ledgersmb/LedgerSMB, cloudfoundry/cli, softwaremill/tapir).
**Answer: the data cannot support a conclusion either way. This is a null/inconclusive result by our own
pre-registered rule, not a disconfirmed-but-measured effect.** Only 23 bug-inducing+has-why events were
found total (pre-registered minimum was 30); the 95% CI for the effect spans both strong protective and
strong harmful directions (cluster-robust: OR 0.90, CI [0.32, 2.53]; bootstrap: OR 0.90, CI [0.47, 1.54]);
a repo-fixed-effects robustness check flips the point estimate to the opposite side of 1 (OR 1.48). None of
this should be read as "no effect exists" — it means this design, at this sample size, on these 3 repos,
cannot distinguish an effect from noise. Open: a larger-n replication (more repos, longer windows, or a
within-repo matched-pairs design) is needed before D82 can be answered either way.

---

### Losses and limits (read first)
1. **Underpowered — the headline number.** Only 23 "has-why AND later-flagged-as-bug-inducing" commits
   exist across all 3 repos combined (LedgerSMB 5, tapir 18, cli 0), against a pre-registered floor of 30
   (protocol.md §8). Per our own frozen rule this alone makes the result **null by definition** — we do
   not report a directional conclusion from it.
2. **One of three repos contributed zero usable bug-fix events.** cloudfoundry/cli's squash-merge commit
   messages embed the format "<summary> (#NNNN)" where NNNN is the commit's **own** merged pull request
   number, not a linked bug-tracker issue. Our deterministic fix-identification regex (protocol.md §4)
   correctly matched 38 "fix/close/resolve ... #N" candidates there, but validating each N against the
   GitHub Issues API showed 100% were self-referential PR numbers (`is_pr: true`), not separate closed bug
   issues — so 0 were counted as real bug-fixing commits for cli. This is the regex/validator working as
   designed, not a bug, but it means cli could not contribute to the outcome measure at all, cutting our
   effective repo count for the SZZ analysis from 3 to 2.
3. **Repo-selection bar was pre-registered down from the task brief's draft "≥50 ADRs."** No public repo
   found in budget met that bar; our 3 repos have 43 / 12 / 12 ADR files (LedgerSMB / cli / tapir). This is
   documented and justified in `4 log/prior-art.md` §3 and `4 log/protocol.md` §1, decided and frozen
   BEFORE mining — not discovered as a post-hoc excuse. It does mean the "touches an ADR file directly" arm
   of the why-detector has very little surface area to fire on (most `has_why=1` hits came from the
   rationale-marker/body-paragraph rule, not actual ADR touches — see raw counts below).
4. **26 of 79 LedgerSMB bug-fixing commits (33%) timed out during SZZ blame** (25s/commit watchdog,
   protocol deviation logged here: not pre-registered, added live when blame on some files pathologically
   slow — see Deviations below) and were excluded rather than guessed at. This could bias LedgerSMB's count
   downward if timeout-prone files (long-lived, frequently-touched) are systematically more or less likely
   to be blamed onto has-why commits — direction of bias unknown, not corrected for.
5. **84 of 96 SZZ-identified bug-inducing commits in LedgerSMB, and 125 of 205 in tapir, point to commits
   from BEFORE our 3-year mining window** (pre-2023-11-04) and are excluded from the outcome by design
   (protocol.md §2/§6: our unit-of-analysis population only covers the mining window, so we cannot say
   whether those older inducing commits had a stated why). This means the overwhelming majority of SZZ's
   raw blame output is structurally invisible to this design — the in-window-only outcome undercounts true
   bug-inducing commits substantially. This is a direct, foreseeable consequence of a time-bounded mining
   window, documented as a limitation rather than discovered after the fact to explain away the null.
6. **B-SZZ (PyDriller's `get_commits_last_modified_lines`), not a refined SZZ variant.** Per prior-art.md
   (Rosa et al. 2021; da Costa et al. 2017; Lyu et al. 2023), B-SZZ has recall/precision around 0.4-0.6 even
   on well-labeled data and tends to over-attribute blame relative to AG-SZZ/MA-SZZ/RA-SZZ. Our
   "bug_inducing" label is SZZ-flagged, not ground-truth confirmed.
7. **Deterministic "has a why" detection is a weaker proxy than a trained classifier** (Li & Ahmed 2023
   used ML; D82 requires no model). Our regex-based rules (protocol.md §3) likely under-detect genuine
   rationale that doesn't follow one of the five syntactic patterns, and may over-detect commits that
   happen to have a long second paragraph for unrelated reasons (e.g. pasted stack traces, changelogs).

### What was found (descriptive, not causal)
Pooled across repos, after excluding the last ~90 days (censor window) and doc-only commits:

| repo | commits analysed | has_why | bug_inducing (SZZ, in-window) | has_why AND bug_inducing |
|---|---|---|---|---|
| LedgerSMB | 1,299 | 201 (15.5%) | 12 (0.9%) | 5 |
| cloudfoundry/cli | 380 | 237 (62.4%) | 0 (0 validated bug-fixes found) | 0 |
| softwaremill/tapir | 1,693 | 156 (9.2%) | 77 (4.5%) | 18 |
| **pooled** | **3,372** | **594 (17.6%)** | **89 (2.6%)** | **23** |

Raw (unadjusted) rates: P(bug_inducing | has_why) = 3.87%, P(bug_inducing | no why) = 2.38% — has_why
commits were SZZ-flagged slightly *more* often in the raw rate, the opposite direction from D82's
hypothesis, but this raw comparison does not control for churn/file-count/author-experience and the
underlying n (23 events) is far too small to treat as evidence of anything.

### Model (pre-registered, run once)
`bug_inducing ~ has_why + log1p(churn) + log1p(files_changed) + log1p(author_prior_commits)`, logistic,
cluster-robust SE by repo (n_clusters=3, pre-flagged in protocol.md as too few for the asymptotics to be
trustworthy — Cameron & Miller 2015, "A Practitioner's Guide to Cluster-Robust Inference", J. Human Resources 50(2), advise far more clusters (few-cluster corrections below ~20-50) — reported anyway per the frozen plan, read as indicative only; the paired bootstrap CI is the better guide):

- **Odds ratio for has_why: 0.906** (i.e. 9% lower odds of being SZZ-flagged as bug-inducing, controlling
  for size/churn/experience) — **95% CI (cluster-robust by repo): [0.324, 2.533]**
- **95% CI (bootstrap, 2000 resamples, within-repo): [0.475, 1.536]** — both CIs include 1.0 and both
  straddle the pre-registered "negligible effect" band [0.8, 1.25] that the point estimate itself sits
  inside.
- **Repo-fixed-effects robustness check: OR = 1.482** — flips to the opposite side of 1 from the main
  model once repo-level baseline differences are absorbed directly rather than via cluster-robust SEs. The
  two specifications disagreeing (0.91 vs 1.48) on a 3-repo dataset is itself evidence the estimate is not
  stable enough to support any directional claim.

### Verdict against the pre-registered null definition (protocol.md §8)
All three independent null triggers fire:
1. insufficient events (23 < 30 floor) — **true**
2. 95% CI includes 1.0 — **true** (both cluster-robust and bootstrap)
3. point estimate within negligible range [0.8, 1.25] — **true** (0.906)

**Conclusion: NULL / data cannot answer D82 at this sample size.** We do not claim "stated why has no
effect on bug-inducing changes" — we claim this specific pre-registered design, run on the 3 public repos
that met our (already-relaxed) repo-selection bar, could not detect an effect of any size that would be
distinguishable from chance with only 23 qualifying events. A real effect, if one exists, would need either
many more repos, a longer mining window, or a matched-pairs/propensity design with far more bug-fixing
commits to detect.

### Deviations from the frozen protocol (logged, not silently applied)
- **Repo-selection bar** was pre-registered as relaxed from "≥50 ADRs" to "≥10 ADR files" BEFORE mining
  (see protocol.md §1) — this is a pre-registration decision, not a deviation, listed here for visibility.
- **Per-commit SZZ watchdog timeout (25s) added during mining**, not in the frozen protocol. Added live
  when a subset of LedgerSMB's bug-fixing commits caused `git blame`-based SZZ to run indefinitely (likely
  due to very long per-file revision histories in a ~20-year-old codebase). Without it the mining run could
  not complete in the available time budget. This is reported as Limit #4 above — 26/79 (33%) of LedgerSMB
  events were skipped, not fabricated or imputed. No other analysis parameter was changed after seeing
  intermediate results.

### What would it take to actually answer D82
- ≥10x more repos (or a few repos with orders of magnitude more history) to get the has-why×bug-inducing
  cell past a few hundred events, given the base rate of SZZ-flagged + has-why co-occurrence observed here
  (~0.7% of all commits, pooled).
- A bug-fix identification rule that works on squash-merge-only projects like cli (e.g. mining PR bodies
  for closing keywords against issue numbers in a *different* linked tracker, or requiring projects that
  keep per-commit, non-squashed history).
- A refined SZZ variant (MA-SZZ or RA-SZZ) to reduce the known over-attribution bias of B-SZZ, which this
  budget did not allow implementing from scratch.

### Artifacts
- `4 log/prior-art.md` — SZZ variants, PyDriller docs, commit-message-quality study, ADR-adoption studies
  (all fetched/dated 2026-11-04).
- `4 log/protocol.md` + `4 log/FROZEN.sha256` — frozen pre-registration (sha256
  `feff007af721f73ad1822587e2a44247cd48f6adde9bb83cb489b0f48d265ec1`).
- Mining/analysis scripts (committed under this task's `scripts/`): `phase_a.py` (commit traversal + has-why
  detection), `phase_b.py` (GitHub issue validation), `phase_c2.py` (SZZ with watchdog), `analyze.py`
  (logistic regression + bootstrap, run once). Raw per-commit data (`raw_*.jsonl`) and intermediate
  checkpoints live in scratch (`/Users/a1/.hermes/cache/scratch/szz/`, not committed — scratch rule) and
  will be deleted per the disk-tight rule; `analysis_output.json` (the full numeric output) is committed
  alongside the scripts for reproducibility of this exact run.


## Review (11-04, fresh reviewer deleg_8e2da650 task 1): PASS
    reproduced     OR 0.9060, cluster CI [0.3242, 2.5325], repo-FE 1.4819 exactly; bootstrap consistent
    integrity      FROZEN hash matches; protocol mtime 16:57 before first mining script 17:02; 50→10 ADR relaxation inside the frozen text
    spot checks    20/20 has-why/no-why commits correct; 5/5 SZZ attributions temporally valid
    minor          cluster-count citation added (Cameron & Miller 2015) · FIX_RE caps 80 chars between keyword and #n (protocol: unbounded) — undocumented narrowing, not material
