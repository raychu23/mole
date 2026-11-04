## Summary
T90 reuses mature open source for every moving part instead of a home-grown framework (Raymond 11-04 15:25
correction, overriding the brief's "small TS package" option). Lead: Inspect AI (already started as T17's
`evals/inspect/`). Weighed and rejected for the runner: promptfoo. Reused for stats: scipy, statsmodels, and
the method (not the code) from Anthropic's eval-stats paper and OSF/AsPredicted pre-registration practice.
Open: live GrowthBook/Statsig code was read for method only (no PyPI client fits a local, no-account setup).

```notes
source (checked/fetched)                          what · version                              used for · why
Inspect AI (UK AI Security Institute +            framework for LLM evals: Task =             the RUNNER (dcbench_eval/task.py,
  Meridian Labs), inspect.aisi.org.uk,             dataset+solver+scorer; inspect view;        same pattern as mole_eval/task.py,
  github.com/UKGovernmentBEIS/inspect_ai           custom model providers; sandboxes           T17); logs land in ITS native .eval
  MIT · checked 2026-11-04 · latest release        (Docker/K8s/Modal/...); agent bridge         format so `inspect view` works
  0.3.287 (2026-10-31; installed in this repo's    for external agents (Claude Code, Codex)    (Mole part: hermes -z as a solver/
  T17 venv: inspect-ai==0.3.286, requirements.txt)                                              provider, dcbench as a Task)
  · already "taken" per `7 Build vs take.md` §1    the lead per Raymond's 11-04 correction:     adapters only: a dcbench Task
  EVAL row ("agent A/B (T17) Inspect (taken)       build ON it, write only adapters              (dataset/solver/scorer), never
  promptfoo TAKEN (Inspect)") and §9 "add after                                                  reimplement its eval loop
  T15 (T17): the only test of whether Mole helps
  an agent, not just you" (`3 Agentic workflow
  + integrations.md` §11, row "Inspect AI +
  Inspect SWE, in Docker")
promptfoo (weighed, not the runner)               LLM/prompt eval CLI, `promptfoo eval` in     NOT adopted as the runner: dcbench's
  promptfoo.dev · MIT · 26.6k★ per                 CI (Travis/GitHub Actions natively); no      task is "an agent edits a real repo,
  `7 Build vs take.md` §1 (26.6k vs Inspect's      Docker sandbox/external-agent bridge         scored by its own TS scorer", which
  3.1k, both "TAKEN" row) · joined OpenAI          the way Inspect/Inspect SWE has              needs Inspect's sandbox + Inspect
  2026-03-09 (still open source per A70 in that                                                 SWE's claude_code() bridge, which
  doc) · checked 2026-11-04 (promptfoo.dev/docs/                                                promptfoo does not have; promptfoo's
  integrations/travis-ci, looper, updated                                                       CI-native `npx promptfoo eval` style
  2026-11-03) · NOT installed (no new venv)                                                      is the model for docs/experiments.md's
                                                                                                 "one command in CI", reused as a shape
scipy.stats.permutation_test / .bootstrap         exact sign-flip permutation test (paired,     dcbench_eval/stats.py:
  scipy, BSD-3-Clause · installed in                permutation_type="samples") · percentile    paired_permutation_test, bootstrap_ci
  /Users/a1/.hermes/cache/scratch/mole-ab-venv     bootstrap CI                                  (never hand-rolled; see that file's
  (pip show: 1.18.1) · docs.scipy.org/doc/scipy/                                                 per-function citations)
  reference/generated/scipy.stats.*
statsmodels.stats.multitest / .power              Holm (1979) step-down p-value correction      dcbench_eval/stats.py:
  statsmodels, BSD-3-Clause · same venv            (multipletests method="holm") · paired       holm_correction, sample_size_for_mde
  (pip show: 0.15.0) · statsmodels.org/stable/     power analysis (TTestPower) -- the same      (Holm is the same family GrowthBook
  generated/statsmodels.stats.multitest             family GrowthBook/Statsig apply across      and Statsig apply across metrics/
  .multipletests.html                               metrics/variants                            variants, see next row)
GrowthBook stats engine (read for method only,    sequential testing, CUPED, multiple           method only: confirmed Holm/BH-family
  not installed: no local server, this is a        testing correction across experiment         correction is the standard choice here;
  local no-account CLI tool) · docs.growthbook.io/  metrics                                      no code taken (no PyPI client fits a
  statistics/sequential · checked 2026-11-04                                                     local, no-account, single-process run)
Anthropic, "A statistical approach to model       clustered SEs (cluster on the unit of         dcbench_eval/stats.py: clustered_se,
  evaluations: Beyond average, towards eval        randomization) · paired differences for      computed directly from the paper's Eq.4
  signal" · arXiv 2411.00640 (Miller 2024) ·       A/B comparisons · explicitly: don't just      (no PyPI package implements this exact
  checked 2026-11-04                                report accuracy, report its uncertainty      paired-and-clustered combination)
OSF preregistration / AsPredicted practice ·      fix hypothesis, arms, primary metric,          dcbench_eval/spec.py: ExperimentSpec +
  osf.io/prereg, aspredicted.org · checked          analysis plan and sample size BEFORE          freeze_spec/assert_frozen_unedited
  2026-11-04 (practice, not a library: no code      looking at data; hash the registration        (hash-before-run-1, refuse on edit);
  to install)                                                                                     protocol-v2.json is T90's own first
                                                                                                   pre-registered experiment, frozen,
                                                                                                   NOT RUN
```

## Design-doc take-vs-build calls followed (Raymond's correction 2, 11-04)

- `context/product-plan/7 Build vs take.md` §1 "EVAL" row: "agent A/B (T17) Inspect (taken) · promptfoo
  3.1k / 26.6k · MIT TAKEN (Inspect)" — Inspect is already the accepted choice for agent evals; T90 extends
  it rather than opening a second framework.
- `context/product-plan/7 Build vs take.md` §3 "rule of thumb": "take anything a focused project already
  solved well; build where Mole's claim lives or where the practice is the point" — the eval loop, sandboxing
  and model-provider bridging are Inspect's solved problem; the dcbench adapter, the pre-registration freeze
  and the stats layer are Mole's own claim (its decisions actually changing agent behaviour) and the part
  worth building/citing, not reimplementing a generic eval runner.
- `context/product-plan/3 Agentic workflow + integrations.md` §11 (build_add table), Inspect AI + Inspect SWE
  row: "add after T15 (T17): the only test of whether Mole helps an agent, not just you" — T90 is that same
  line of work, generalised from one planted regression (T17/B3) to a repeated, pre-registered experiment
  system (T63-style dcbench runs plus any future Mole idea).
- `context/product-plan/Mole compared.md` §7 (borrow table): "an A/B on real developers, one product metric |
  GitHub Copilot Memory | borrow | the pilot (D7) and T17" — confirms A/B testing itself is a borrowed
  industry pattern (Copilot Memory's own A/B), not a Mole invention; T90 is the generalised version of that
  borrowed pattern, usable for any future Mole idea, not just T17's one regression.
- `context/product-plan/10 Where Mole fits.md`: no section mentions A/B or experiment infrastructure directly
  (checked via grep, 2026-11-04, 0 matches); it sets Mole's product position (the checking/understanding
  layer, not a second IDE or orchestrator) which this experiment system measures evidence for, but does not
  itself make a build-vs-take call for the eval/stats stack.

## What stayed untouched (reuse, not rewrite)

- `evals/inspect/mole_eval/scoring.py`'s `wilson` / `newcombe_diff` (Newcombe 1998 hybrid score interval,
  built for T17) are reused as-is by `dcbench_eval/reanalyze.py` for the dcbench merge-ready rate interval,
  instead of writing a second interval function.
- `evals/inspect/mole_eval/report.py`'s report-writing shape (JSON + a short markdown table, timestamped
  filename) is the model `reanalyze.py`'s own text report follows.
- dcbench's own `benchmark/scorer.ts`, `tasks.ts` and T63's `scripts/run_dcbench.py` / `score.mjs` are
  untouched and read-only; T90 only reads their frozen output (`raw/runs.jsonl`), per the FROZEN.sha256 stop
  rule ("edit raw/runs.jsonl or frozen files" is this task's boundary violation).
