```notes
evals/inspect (T17, metric M12)     agent A/B: Claude Code with vs without Mole, on the planted B3 regression
    what                Inspect AI task; Inspect SWE's claude_code() runs Claude Code inside a Docker sandbox and
                        bridges its model calls to Inspect's model API (sandbox agent bridge)
    arms                none = plain Claude Code · mole = + T15 hooks (SessionStart, Stop with MOLE_STOP_CONTINUE=1)
                        as /repo/.claude/settings.json + the Mole MCP server (stdio)
    cases               cases/key.json: B3-tidy (good code, a tidy-up that tempts dropping the fix),
                        B3-review (planted change already in the tree: finish and commit it)
    score               after the agent: copy cases/b3/guard.test.ts into the repo, npm run build, vitest;
                        1 = guard does not pass (regressed / build_broken / guard_unrunnable), 0 = kept
    report              run.py -> tasks/T17-agent-eval-inspect/4 log/<stamp> <label>.{json,md}: per arm rate,
                        Wilson 95%, Newcombe 95% for the difference, tokens + seconds per run
    no partial score    any errored sample -> exit 3, "<label>-incomplete.json", no rates
    spend guard         any non-mockllm model is refused without --paid-run-approved "<Raymond's go>"
```

Setup (python.org 3.12; not uv):

```sh
/Library/Frameworks/Python.framework/Versions/3.12/bin/python3 -m venv evals/inspect/.venv
evals/inspect/.venv/bin/pip install -r evals/inspect/requirements.txt
python3 evals/inspect/docker/prepare_context.py          # subject.bundle + tool.tar from git
docker compose -f evals/inspect/docker/compose.yaml build  # mole-t17-eval:latest, ~1.2 GB
```

Runs:

```sh
# free dry run: 2 samples (B3-review x 2 arms), Inspect's mock model
evals/inspect/.venv/bin/python evals/inspect/run.py --model mockllm/model --cases B3-review --label "dry run"
# failure case: Claude Code pointed at a closed port instead of the bridge -> clear error, exit 3, no score
evals/inspect/.venv/bin/python evals/inspect/run.py --model mockllm/model --cases B3-review --arms none \
    --break-model-route --label "failure probe"
# full A/B (paid, after Raymond's go): n from cases/key.json full_run
evals/inspect/.venv/bin/python evals/inspect/run.py --model anthropic/<model> --epochs 15 --max-samples 4 \
    --label "full run" --paid-run-approved "<date: Raymond's words>"
```

Tests: `python3 -m pytest evals/inspect/tests -q` (pure-Python scorer logic; the Inspect task test skips without
inspect_ai) and `evals/inspect/.venv/bin/python -m pytest evals/inspect/tests -q` (all).

## dcbench_eval (T90): the pre-registered A/B experiment system

`dcbench_eval/` is a REAL, generic Inspect AI integration (fixed 2026-11-04 after a review FAIL found
nothing in the package imported `inspect_ai`): a generic Task `mole_ab` (any repo, any JSONL dataset, named
context arms), a solver that runs the real `hermes -z` agent in a per-sample git worktree (pattern borrowed
from inspect-swe's external-agent wrapper, used here already by `mole_eval/task.py`'s `claude_code()`), two
scorers (`mole_check_scorer` for any repo, `dcbench_scorer` wrapping dcbench's own `scorer.ts`), plus
pre-registration (spec+freeze, OSF/AsPredicted practice) and stats (scipy/statsmodels) on top. Proved end
to end against a tiny synthetic repo in `tasks/T90-ab-experiment-system/4 log/mole_ab-e2e-proof.eval`. See
`../../docs/experiments.md` for the full command reference, the dcbench scorer's new-file-blindness fix,
and the v3 sample-size arithmetic.

```sh
VENV=/Users/a1/.hermes/cache/scratch/mole-ab-venv    # has inspect-ai, inspect-swe, scipy, statsmodels, pytest
$VENV/bin/python -m pytest evals/inspect/dcbench_eval/tests -q
$VENV/bin/inspect eval evals/inspect/dcbench_eval/task.py@mole_ab -T repo=. -T dataset=<tasks.jsonl> \
  -T arms=none,decisions:.mole/decisions -T scorer=mole_check --model mockllm/model
$VENV/bin/python evals/inspect/dcbench_eval/reanalyze.py                 # re-analyses T63's frozen raw/runs.jsonl, read-only
$VENV/bin/python evals/inspect/dcbench_eval/reanalyze.py --inspect-log <run>.eval   # or any mole_ab .eval log
```
