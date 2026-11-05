## Summary
What: prior-art scan for D82 (do changes with a stated "why" — ADR touched/referenced or a rationale
section — associate with fewer bug-inducing changes than comparable changes without one?).
Answer here: no existing study directly tests this; closest adjacent work is (a) SZZ variants for
identifying bug-inducing commits, (b) one ICSE'23 study linking commit-message "why" content to defect
proneness (not ADRs specifically), (c) MSR studies on real-world ADR adoption showing it is rare and
usually shallow (median repo has 1-5 ADRs). That adoption finding is itself a result for our repo-selection
step: it means hitting "≥3 public repos with ≥50 ADRs" (as drafted in the task brief) is empirically hard —
documented in protocol.md as a pre-registered, evidence-based relaxation. Open: nobody has run SZZ
conditioned on "has a stated why" before — this task is original, not a replication.

---

### 1. SZZ algorithm and variants (bug-inducing commit identification)
- Śliwerski, Zimmermann, Zeller, "When Do Changes Induce Fixes?" MSR 2005 — original SZZ: find bug-fix
  commits (via bug-tracker keyword/ID match), `git blame` the lines they change to find the commits that
  last touched those lines = bug-inducing candidates. This is "B-SZZ" (basic) in later taxonomies.
- Kim et al. "Classifying Software Changes: Clean or Buggy?" / AG-SZZ (Da Costa et al. attribute the
  "annotation graph" refinement to Śliwerski/Williams & Spacco-era work cited in later surveys) — filters
  out purely cosmetic (whitespace/comment) line changes before blaming, reducing false positives from
  the original B-SZZ.
- da Costa, McIntosh, Shang, Kulesza, Coelho, Hassan, "A Framework for Evaluating the Results of the SZZ
  Approach for Identifying Bug-Introducing Changes," IEEE TSE 43(7), 2017 (= MA-SZZ paper). Fetched
  2026-11-04 via rebels.cs.uwaterloo.ca/papers/tse2017_dacosta.pdf. Finding: SZZ variants over-attribute —
  a single bug-inducing change gets blamed for "hundreds of future bugs" in some cases, and ≥46% of
  blamed changes are years apart from the fix, i.e. SZZ output needs a sanity filter (MA-SZZ = "meta-change"
  filtering: drop commits that are themselves merges/large refactors/metadata-only). Direct implication for
  this task: our outcome variable (is commit X ever SZZ-blamed) will over-count without MA-SZZ-style
  filtering; noted as a limitation since we use plain B-SZZ via PyDriller (budget/determinism tradeoff).
- Rosa, Pascarella, Scalabrino, Tufano, Bavota, Lanza, Oliveto, "Evaluating SZZ Implementations Through a
  Developer-Informed Oracle," ICSE 2021. Fetched 2026-11-04 (inf.usi.ch/lanza/PUBS/P/Rosa2021a.pdf). Built
  a ground truth from commits whose own message names the bug-inducing commit explicitly (e.g.
  "fix bug introduced by <sha>"), then scored B-SZZ/AG-SZZ/MA-SZZ/RA-SZZ etc. against it. Headline:
  refinements trade recall for precision; no variant dominates; all have real false-positive/negative rates
  — SZZ output is noisy evidence, not ground truth. We cite this to justify reporting our outcome as "SZZ-
  flagged" rather than "actually bug-inducing," and to keep effect-size claims modest.
- Lyu, Widyasari, Lo et al., "Evaluating SZZ Implementations: An Empirical Study on the Linux Kernel,"
  2023/2024 (arxiv 2308.05060, fetched 2026-11-04). Using 76,046 developer-labeled Linux "Fixes:" pairs
  (ground truth from kernel convention, not researcher inference), all 6-8 SZZ variants tested land at
  recall/precision 0.40-0.60, F1 ~0.50 — lower than Rosa et al.'s numbers, and "ghost commits" (bug-inducing
  change not found anywhere in file/function history) are 17.5% of cases. Reinforces: SZZ recall is
  moderate at best even on a well-behaved, well-labeled project; expect similar or worse recall on our
  smaller public repos with messier fix-linking.
- PyDriller docs (pydriller.readthedocs.io/en/latest/git.html, fetched 2026-11-04): `Git.get_commits_last_
  modified_lines(commit)` is PyDriller's built-in SZZ implementation — given a (bug-fixing) commit, returns
  the set of commits that last touched the lines that commit changed/deleted. This is essentially B-SZZ
  (no comment/whitespace filtering beyond what git diff already ignores, no refactor-aware filtering). Since
  PyDriller 1.9 it can optionally use "git hyper-blame" to skip specified commits (e.g. known refactors) —
  not used here (would require a pre-built refactor-commit list per repo, out of scope/budget).

### 2. Commit-message "why" quality and defects
- Li, Ahmed, "Commit Message Matters: Investigating Impact and Evolution of Commit Message Quality," ICSE
  2023 (DOI 10.1109/ICSE48619.2023.00076; fetched 2026-11-04 via stairs.ics.uci.edu/papers/2023/Commit_
  Messages.pdf abstract + computer.org listing). Operationalizes a "Good" commit message as having both
  "What" (summary of the change) and "Why" (motivation/reason), using issue/PR links as a proxy for Why
  content, with an ML classifier (12pp F1 improvement over prior work) to detect What/Why presence.
  Findings: (1) commit-message quality (What+Why presence) has a measurable association with software
  defect proneness; (2) message quality has been declining over time even as developers believe it's
  improving. This is the closest prior work to D82's hypothesis, but studies "message quality" broadly
  (What+Why together, detected by a trained classifier) — not ADR-linkage specifically, and uses an ML
  classifier where D82 requires deterministic, model-free detection. We cite it as motivating prior art,
  not something we replicate (different operationalization, different detector).
- "But Do Commit Messages Matter? An Empirical Association Analysis with Technical Debt" (C. Lu, cited in
  Li & Ahmed's reference list) — adjacent empirical-association work on message quality vs. technical debt,
  not bug-inducing changes specifically; not independently fetched/verified here (listed for completeness,
  not load-bearing).

### 3. ADR-in-practice studies (adoption base rates — drives repo selection)
- (MSR study, IEEE Access 2023, DOI 10.1109/access.2023.3287654) "Using Architecture Decision Records in
  Open Source Projects — An MSR Study on GitHub," fetched 2026-11-04. Mined GitHub for repos with ≥1 ADR;
  found 921 public repos with ≥1 recorded ADR (>5000 ADRs total). Key numbers for our repo-selection step:
  about 50% of ADR-using repos have only 1-5 ADRs ("tried, not adopted"); only 47 repos (of 921) have >20
  ADRs. Adoption only accelerated after 2017 and is still "very low" overall. Nygard's template dominates
  (~75% of repos). Direct implication: the task brief's draft bar of "≥50 ADRs" per repo, across ≥3 public
  repos that ALSO have a linkable issue tracker, is not reliably satisfiable on public GitHub today — we
  document our own repo search (protocol.md §repo selection) hitting this same wall and pre-register a
  lower, evidence-justified bar (≥10 dated decision-record files in a `doc/adr`/`docs/adr` folder) before
  mining, rather than discover it was infeasible after the fact.
  Own corroborating evidence (gh code search, 2026-11-04, GitHub API, rate-limited to a few queries/min):
  checked ~20 real-project candidates (not ADR-tooling repos) for `docs/adr`/`doc/adr` counts — ledgersmb/
  LedgerSMB 43, cloudfoundry/cli 12, softwaremill/tapir 12, athensresearch/athens 11, backstage/backstage
  5, redhat-developer/rhdh 4; several checked repos known for architecture rationale (matrix-org/synapse,
  18F/identity-idp, alphagov/*, zulip/zulip) use **no** `docs/adr`/`doc/adr` folder at all (they use MSCs,
  RFCs, or ad hoc design docs instead, which don't satisfy a deterministic "touches docs/adr" rule).
  No public repo found at ≥50 in the time/rate-limit budget available (10-item code-search pages, strict
  per-minute code-search quota). This null repo-search result is itself reported plainly, not hidden.
- Barbosa, Carvalho, et al. (Chalmers / industry action-research line, e.g. "Architecture Decision Records
  in Practice: An Action Research Study," 2024; "Exploring the Adoption and Effectiveness of ADRs in Agile
  Software Development," research.chalmers.se/en/publication/538920) — qualitative/action-research studies
  in single-company settings finding ADRs perceived as useful for communication/onboarding, with practical
  friction around "what to document," placement, and upkeep. No quantitative defect-rate claim; cited for
  context on why ADR adoption stays shallow even where tried (matches the MSR adoption-base-rate finding
  above), not as evidence for or against D82's hypothesis.

### Net takeaways used in protocol.md
1. No one has tested "stated why → fewer bug-inducing changes" directly — this is new, not a replication.
2. SZZ (any variant) is noisy evidence (recall/precision both ~0.4-0.6 even on well-labeled data per Lyu et
   al. 2023); treat our outcome as "SZZ-flagged as bug-inducing," not "confirmed bug-inducing," throughout.
3. Real-world ADR-folder adoption is rare and shallow (MSR 2023), so a ≥50-ADR, ≥3-repo bar is not met by
   available public repos in this budget — protocol.md documents a lower, pre-registered bar BEFORE mining.
4. Deterministic "has a why" detection (regex-based, no ML) is a weaker proxy than Li & Ahmed's trained
   classifier; expect lower recall for genuine rationale and note this as a limitation up front.
