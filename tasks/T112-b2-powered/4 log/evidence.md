# T112-b2-powered -- evidence log

All primary artifacts live in the main checkout at
`context/product-plan/systems/metrics-proof/m2-conflict/v4/` (gitignored per repo convention, same as
v1/v2/v3's directories -- NOT duplicated into this git-tracked task folder; this log points at them by
exact path instead).

## Prior art / repo search (>=3 dated sources, per prior-art-first convention)

- 2026-11-08/09: `gh api repos/<candidate>/contents/docs/adr` spot-checks (18F/identity-idp,
  department-of-veterans-affairs/vets-api, nasa/openmct, hmcts/cmc-claim-store, and others) --
  mostly 404s (wrong path/org name) or too-small ADR dirs.
- 2026-11-09: `gh api "search/repositories?q=topic:architecture-decision-records"` and
  `topic:adr` -- returned mostly ADR tooling repos (adr-tools, log4brains itself, adr-manager), not
  real engineering projects with substantial ADR history; not pursued further.
- 2026-11-09: `gh api "search/code?q=path:docs/adr+filename:0010"` (a repo with a file literally named
  `0010-*.md` has >=10 numbered ADRs by construction) -- this is the query that found all 4 repos
  actually used. Full raw result saved at the time in terminal output (not kept as a separate file;
  the candidate list considered is recorded in protocol_v4.md's "Repos" section).
- Repo-size check (`gh api repos/<repo>` `.size` field, full-history KB) before cloning any candidate,
  to respect the brief's scratch-disk budget: dasch-swiss/dsp-api (518MB) and HHS/Head-Start-TTADP
  (77MB, 31 usable ADRs) were found and sized but NOT cloned this round (disk headroom was thin: 5.3-
  5.4GB free of a near-full 460GB volume). See protocol_v4.md's "Repos" notes block for the full
  accounting.

## Build, label, freeze (full detail in protocol_v4.md)

- `build_cases_v4.py` run output: `total CASES built: 82`, `label mix: {'violate': 33, 'compliant':
  32, 'no_decision': 17}`, `split mix: {'heldout': 42, 'dev': 40}`, all 4 repos reported `clean` after
  the build (no leftover commits/files).
- Frozen BEFORE labeling: `frozen_raw.sha256` (build_cases_v4.py, build_common_v4.py,
  cases_v4_raw.json).
- Labeling: `labeler_v4.py`, 164 real `hermes -z ... --safe-mode` calls (82 cases x 2 models:
  claude-opus-5-5, claude-haiku-4-5), log at `labeler_v4.log`.
- Adjudication (FIXED rule, protocol_v4.md): `adjudicate_v4.py` ->
  `kappa_summary_v4.json`: percent_agreement=0.939, cohens_kappa=0.9055, step_counts shows 1 case
  resolved via the NEW fixed step (`step2_trap_fix_named`) -- the real supersession trap
  (`v4-claw-0016-trap-violate`), correctly resolved to not_applicable; see results-v4.md's "Rule-gap
  fix: does it work?" section for why v3's own (unfixed) rule would have gotten this one wrong.
- Frozen AFTER labeling: `frozen_final.sha256` (protocol_v4.md, labeler_v4.py, adjudicate_v4.py,
  labels_raw_v4.json, adjudication_log_v4.json, kappa_summary_v4.json, cases_with_labels_v4.json).

## Arms run (once, held-out split, 42 cases)

- RAG reads-all + reviewer-given-decision: `run/run_arms_v4.py`, log `run/arms_v4.log`.
- T53 (frozen v3 params, k=5 m=0 c=1.01, haiku router): `run/run_t53_semantic_route_v4.mjs`, log
  `run/t53_v4.log` -- uses Mole's real `loadGraph`/`cascadeCheck` engine (packages/decisions/dist)
  pointed directly at each cloned repo's real `docs/adr` folder via the `adrDirs` option (no synthetic
  `.mole/decisions` record wrapper needed, unlike v3's `records_arm2/`).
- T46 cascade (file-scoped from the start, not a post-hoc fix): `baselines/t46_cascade_arm_v4.mjs`,
  log `baselines/t46_v4.log`.
- Two-sided judge: `baselines/run_judge_arm_v4.py`, log `baselines/judge_v4.log` -- candidate set is
  the full repo's live-ADR set (RAG's candidates), NOT T53's narrower routed set (a real, reported
  difference from v3's framing -- see results-v4.md Loss #3).
- Frozen after arms: `frozen_run.sha256` (results-v4.md, analysis_v4.json, all 5 arms' output files +
  the scripts that produced them).

## Results

`results-v4.md` -- losses first (underpowered by design; T46 cascade scored 0 recall on this case
style, a real and reported limitation; judge arm uses a different candidate scope than v3's); Wilson
95% CIs per arm; McNemar exact p=0.25 (false alarms, T53 vs RAG, 3 discordant pairs, the pre-registered
primary test) and p=0.625 (overall correctness, secondary); the constructed-vs-real-PR honesty
statement, linking `tasks/T110-history-replay-bench/results-v2.md`'s real-history finding (4 positives
across 6 repos, not enough to power a benchmark) as the reason this task used the constructed-case
method instead.

## Budget

Labeling + run calls actually made: 164 (labeling) + ~235 (RAG 42 + reviewer 42 + T53 ~60 + cascade
compile 17 + judge 42, approximately, per each script's own call count) = ~399 total, well under the
~1,500 call budget given in the task. The binding constraint on n was hand-authoring time for
non-gameable case snippets, not the call budget -- stated plainly in protocol_v4.md's "n cut" section,
not hidden.
