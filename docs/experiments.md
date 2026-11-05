## Summary
Mole's A/B experiment kit: answer "does adding decision X (or any context) change what my coding agent
does?" on YOUR repo. It is a real Inspect AI integration (UK AISI's agent-eval framework) -- a generic
Inspect `Task` (`mole_ab`), a choice of THREE agents to run it (Claude Code, Codex, or hermes -- see
below), two scorers (a generic any-repo one and dcbench's own), and pre-registration/stats on top
(spec+freeze, scipy/statsmodels). Runs land in Inspect's native `.eval` format, so `inspect view`/
`inspect log dump` work unmodified. **You do not need a hermes subscription to use this**: `agent=
claude_code` (the default) or `agent=codex` runs the real Claude Code / Codex CLI (via inspect-swe's
maintained external-agent wrappers) in a small Docker sandbox this repo ships (`evals/inspect/
dcbench_eval/Dockerfile` + `compose.yaml`) against the repo you point it at.

**Needs before you run this**: Docker (the default sandbox for `agent=claude_code`/`codex` -- see
"Known platform limitation" below for why) and your own Claude Code or Codex auth/subscription (this kit
never bundles or proxies one). No hermes install or subscription needed unless you explicitly pass
`agent=hermes`.

## 1. Run it on your own repo

```sh
# <venv>: a Python 3.12 venv with inspect-ai, inspect-swe, scipy, statsmodels installed (see
# evals/inspect/requirements.txt for pinned versions). Use the venv's own python/inspect, never a bare
# system python, for anything that imports scipy/numpy (observed crash on at least one machine's system
# numpy build).
<venv>/bin/inspect eval evals/inspect/dcbench_eval/task.py@mole_ab \
  -T repo=/path/to/your/repo \
  -T dataset=/path/to/your/tasks.jsonl \
  -T arms="none,decisions:/path/to/.mole/decisions" \
  -T scorer=mole_check \
  --model anthropic/<model>   # or openai/<model>, or mockllm/model for a free dry run
```

`agent` defaults to `claude_code` (no `-T agent=` needed) so this command above already runs the real
Claude Code CLI in the bundled Docker sandbox -- Docker must be running. `dataset.jsonl`: one line per
task, `{"id": "T1", "prompt": "..."}`. `arms`: comma-separated, see
`evals/inspect/dcbench_eval/arms.py`'s docstring for the full syntax (`none`, `rules:PATH`,
`decisions:PATH`, `plugin_pin:SHA:PATH`). Every (dataset row) x (arm) pair becomes one Inspect `Sample`:
same prompt, same model, same pinned commit -- only the context in front of the agent differs between arms.
`scorer=mole_check` runs `mole check --worktree --json` (any repo with `.mole/decisions`, no dcbench
needed) and scores on the number of outstanding questions Mole itself raises about the diff.

**`agent=` -- pick the coding agent that actually edits the files:**

```notes
claude_code    DEFAULT. Real Claude Code CLI, via inspect-swe's claude_code() wrapper
               (github.com/UKGovernmentBEIS/inspect_swe). Runs in this kit's Docker sandbox by default
               (-T sandbox=docker, the default -- see "Known platform limitation" below), against the
               claude binary inspect-swe installs inside the container. Claude Code's own model calls are
               bridged to and billed through Inspect's --model, not a separate Claude subscription --
               Claude Code is the harness here, not the model provider.
codex          Same idea with OpenAI's Codex CLI (inspect_swe.codex_cli()), also Docker by default.
hermes         Opt-in only (-T agent=hermes): runs `hermes -z` as a plain subprocess (no Inspect sandbox
               needed at all, since hermes calls the model itself through its own subscription/provider
               config rather than going through Inspect's model loop). Needs a hermes install +
               subscription; most public users should use claude_code or codex instead. If `hermes` is not
               on PATH, this fails with a clear message naming agent=claude_code/codex, not a raw
               FileNotFoundError.
```

`-T agent=claude_code` (or leave it unset) and `-T agent=codex` are what most public users want -- pick
whichever CLI you already have installed and authenticated through Inspect's own `--model`/provider env
vars (e.g. `ANTHROPIC_API_KEY` for `--model anthropic/...`, `OPENAI_API_KEY` for `--model openai/...`). `-T
agent_model_config=<slug>` overrides the identity the CLI presents to itself if Inspect's `--model` isn't
one its own alignment table recognises (cosmetic only; see `external_agent.py`'s docstring).

`-T sandbox=` -- `docker` (DEFAULT for `agent=claude_code`/`codex`) or `local` (exec directly on the host,
no Docker, against whatever `claude`/`codex` binary is already on your PATH -- only works on a Linux
host/CI runner, see below).

**Known platform limitation (inspect-ai 0.3.286, verified 2026-11-04)**: `agent=claude_code`/`codex`'s
`sandbox="local"` fails on a macOS host with `SandboxInjectionError: ... Tool support injection is not
implemented for OS: Darwin. Only Linux containers are currently supported.` -- `sandbox_agent_bridge()`
unconditionally calls `sandbox_with_injected_tools()`, whose container-tools injector only knows how to
install into a Linux filesystem layout, and the local sandbox IS the host OS (Darwin here), not a
container. This is an inspect-ai limitation, not specific to this kit. **The fix is `-T sandbox=docker`
(this kit's DEFAULT for these two agents)**: `evals/inspect/dcbench_eval/Dockerfile` + `compose.yaml` run a
real Linux container (git, node 22, the `claude`/`codex` CLIs) regardless of host OS -- confirmed building
and running locally (image build + a bind-mounted worktree exec check; see the T93 task's own evidence for
the exact commands, since a real paid Claude Code/Codex CLI call is NOT RUN by this repo's own CI/tests --
no paid API keys here). `-T sandbox=local` is still available for a Linux host/CI runner where the Darwin
limitation does not apply (faster, no Docker). `agent=hermes` needs no sandbox at all (confirmed
end-to-end on macOS, see below) and is unaffected either way.

Result: a real Inspect `.eval` log under `--log-dir` (default `./logs`). Open it with
`<venv>/bin/inspect view --log-dir <dir>`, or re-analyse it statistically:

```sh
<venv>/bin/python evals/inspect/dcbench_eval/reanalyze.py --inspect-log path/to/run.eval
```

## 2. The pieces underneath

```notes
external_agent.py     claude_code/codex via inspect-swe (see its docstring for exactly why these need
                      Inspect's "local"/"docker" sandbox and how billing/identity work).
worktree_agent.py     the hermes path: creates a throwaway git worktree per sample, applies the arm's
                      context (arms.py), runs REAL `hermes -z ... --safe-mode` as a subprocess (the agent
                      edits files itself -- it is not a chat completion Inspect's generate() can wrap).
                      Also the clear "hermes not found" error when agent=hermes is used without hermes
                      installed.
arms.py               what context (if any) the agent sees before the same task prompt: none | rules:PATH
                      | decisions:PATH | plugin_pin:SHA:PATH (see its own docstring for the full syntax).
                      For claude_code/codex specifically, install_arm_for_agent() places that context the
                      way THOSE agents actually read it (CLAUDE.md/AGENTS.md on disk, and -- for a
                      'decisions' arm under claude_code -- the real `mole-code` package installed into the
                      worktree, its Claude Code hooks wired via .claude/settings.json). Package source:
                      -T mole_package=PATH_OR_URL, default the latest GitHub release asset. A preflight
                      fails the sample loudly if Mole doesn't resolve or the installed hooks predate
                      blocking (D102), so a 'decisions' arm never silently tests nothing or an old Mole.
                      The worktrees dir (.mole_ab_worktrees/) is added to git's info/exclude, never your
                      .gitignore.
scorers.py            mole_check_scorer (generic, any repo) + dcbench_scorer (wraps dcbench's OWN
                      benchmark/scorer.ts via dcbench_score.mjs, a node subprocess). dcbench_scorer needs a
                      local dcbench checkout (-T dcbench_repo=PATH); mole_check_scorer works on any repo
                      with .mole/decisions and needs neither.
spec.py, freeze.py   pre-registration: hash + freeze an experiment spec before run 1; `--check` in CI
                      fails the build on a silent edit to a frozen spec (OSF/AsPredicted practice).
stats.py              scipy/statsmodels only: paired_permutation_test, bootstrap_ci, clustered_se (cited
                      per function from the paper it implements), holm_correction, sample_size_for_mde.
reanalyze.py          re-analyse a finished run: any mole_ab `.eval` log (--inspect-log, reads it via
                      inspect_ai.log.read_eval_log), or a historical runs.jsonl shaped like dcbench's own
                      (--runs; set MOLE_AB_RUNS_PATH or pass --runs explicitly -- there is no built-in path
                      to anyone's private data).
hermes_provider.py    @modelapi "hermes" custom model provider (Inspect's documented extension mechanism,
                      https://inspect.aisi.org.uk/extensions-model-api.html): text-prompt -> text-completion
                      only (a judge/classifier call), registered and unit-tested but with no in-repo
                      consumer yet.
registry.py           the experiments registry (idea -> status), experiments/registry.json (not shipped
                      publicly -- it records a specific private experiment's status).
```

## 3. Tests

```sh
<venv>/bin/python -m pytest evals/inspect/dcbench_eval/tests -q
```

## 4. CI: freeze-check + a cheap smoke eval on every push

```yaml
# .github/workflows/mole-ab.yml (illustrative; adjust paths/venv setup to your CI)
- name: mole_ab -- unit tests (pure Python + Inspect-dependent)
  run: python -m pytest evals/inspect/dcbench_eval/tests -q
- name: mole_ab -- cheap smoke eval (mockllm model id; exercises the real agent CLI's startup/bridge path)
  run: |
    inspect eval evals/inspect/dcbench_eval/task.py@mole_ab \
      -T repo=. -T dataset=evals/inspect/dcbench_eval/experiments/ci-smoke.jsonl \
      -T arms=none -T scorer=mole_check -T agent=claude_code --model mockllm/model --log-dir ci-logs
```

(`experiments/ci-smoke.jsonl` is a tiny fixture for your own repo's CI -- write your own two-line JSONL if
you don't have one yet; see "dataset JSONL" in section 1.)

## 5. What's open

A generic CLI that takes an arbitrary team repo + `.mole/decisions/*.md` pair (with/without) and
auto-generates the dataset.jsonl is not built -- today you write the JSONL yourself. `dcbench_scorer` is
wired and unit-tested against a small fixture repo (`tests/test_dcbench_score.py`), not against any real
dcbench-shaped benchmark in this repo. `hermes_provider.py`'s `@modelapi` provider is registered and
unit-tested but has no in-repo consumer yet (it's for a future text-only judge/scorer, not the worktree
agents above).
