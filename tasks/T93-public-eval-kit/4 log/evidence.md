## Summary
Done: public `agent=` option (claude_code/codex via inspect-swe, hermes kept but no longer the public
default) wired into `mole_ab`; private references scrubbed from the shipped .py/.md so `evals/inspect/
dcbench_eval` + `docs/experiments.md` now export cleanly; verified in a fresh clone with pytest green +
one real 2-arm run against a tiny scratch repo. Open: `agent=claude_code`/`codex` cannot actually be
exercised end-to-end on this macOS dev box (inspect-ai platform limitation, not a bug in this change --
see below); verified via its own unit tests + the pre-existing Docker-sandboxed T17 pattern instead.

## What changed (evals/inspect/dcbench_eval, docs/experiments.md, scripts/export-public.mjs)
- `external_agent.py` (NEW): `external_agent_worktree` solver + `build_external_agent()`, wrapping
  `inspect_swe.claude_code()`/`codex_cli()` (installed inspect-swe 0.2.72, source read directly:
  `inspect_swe/_claude_code/claude_code.py`, `inspect_swe/_codex_cli/codex_cli.py`) the same way
  `evals/inspect/mole_eval/task.py`'s `claude_code()` already does (T17), but with Inspect's `"local"`
  sandbox (`inspect_ai/util/_sandbox/local.py`, `@sandboxenv(name="local")`) instead of Docker, so a public
  user's own installed `claude`/`codex` binary runs directly, no Docker/hermes subscription needed.
- `task.py`: new `agent: str = "hermes"` + `agent_model_config` params on `mole_ab()`. `agent=hermes` keeps
  today's exact behaviour (no sandbox). `agent in (claude_code, codex)` selects `external_agent_worktree`
  and sets `Task(sandbox="local")`. Unknown agent -> `ValueError`. Public docs lead with
  `-T agent=claude_code`; code default stays `hermes` so existing internal callers are unaffected.
- `reanalyze.py`: `DEFAULT_RUNS_PATH` was a hardcoded `/Users/a1/...` absolute path (would have failed the
  export's own forbidden-string scan with no way to redact a functional path value) -- now
  `MOLE_AB_RUNS_PATH` env var with a relative default, same effective behaviour when run from the repo
  root (verified: 46/46 tests pass run from the main repo root; the 5 tests that need T63's real raw data
  skip cleanly, not error, when that file isn't present at the relative path).
- `stats.py`: gained `wilson`/`newcombe_diff` (moved in from `mole_eval.scoring`, a package this kit does
  NOT ship) so `dcbench_eval` has no cross-package import -- `reanalyze.py --inspect-log` would otherwise
  `ModuleNotFoundError` in the exported copy (caught by actually running pytest in the fresh export, not
  just the string scan).
- `test_dcbench_score.py`: one docstring edit (dropped a literal private path, same redaction gap).
- 9 new tests (`test_external_agent.py`, `test_task_agent_option.py`), red-first, now green; all public
  with no private-data dependency.
- `scripts/export-public.mjs`: added `evals/inspect/dcbench_eval` to `include`; dropped the blanket
  `docs/experiments.md` exclusion; excluded 3 tests that only make sense against private data
  (`test_reanalyze.py`, `test_protocol_v3.py`, `test_reanalyze_inspect_log.py` -- `experiments/` itself was
  already excluded); extended the comment/path-redaction rewrite to `.py` files (previously `.ts/.mjs/
  .cjs/.json/.md` only -- the literal gap this task named); fixed two false-positive redaction bugs found
  by actually running the export and its tests, not just the scan: `\.hermes` matched inside
  `hermes_provider`/`hermes_worktree_agent` (both the rewrite AND the forbidden-scan regex needed a
  `(?!\w)` negative lookahead -- the first version produced a Python `SyntaxError` in the exported copy).
- `docs/experiments.md`: rewritten for public use (`agent=` table up front, platform-limitation note,
  pieces/tests/CI sections genericised). The dcbench/protocol-v3 worked example and the old FAIL-review
  history moved verbatim to `tasks/T93-public-eval-kit/dcbench-protocol-v3-notes.md` (private task folder,
  per the brief's "keep provenance in the task folder, not the code").

## Verified
- `<mole-ab-venv>/bin/python -m pytest evals/inspect/dcbench_eval/tests -q` from the main repo root:
  **46 passed** (private repo, nothing excluded).
- Same, from this worktree: 38 passed, 8 skipped (the skipped 8 are the private-data tests whose
  `skipif` correctly finds no data relative to this cwd -- expected, not a regression).
- `node scripts/export-public.mjs /Users/a1/.hermes/cache/scratch/t93-export`: `private-string scan:
  clean`, 340 files copied.
- `<mole-ab-venv>/bin/python -m pytest <export>/evals/inspect/dcbench_eval/tests -q`: **34 passed**, 0
  errors, 0 skips (the 3 private-data tests are excluded from the export entirely, not just skipped).
- Fresh-clone verbatim run of docs/experiments.md's workflow, reusing `<mole-ab-venv>` (no new install),
  against a brand-new scratch git repo (`/Users/a1/.hermes/cache/scratch/t93-verify-repo`, one commit,
  one `.mole/decisions-src/D1.md`) with **2 decision arms** (`none`, `decisions:.../decisions-src`) and
  `agent=hermes` (**2 real hermes calls**, within the "at most 2 real calls" budget): `inspect eval
  <export>/evals/inspect/dcbench_eval/task.py@mole_ab -T repo=<scratch> -T dataset=<scratch>/tasks.jsonl
  -T arms="none,decisions:<scratch>/.mole/decisions-src" -T scorer=mole_check -T mole_bin=<built
  release/mole-code/dist/cli.js> -T agent=hermes --model mockllm/model`. Result: `status: success`, 2
  samples, `agent_rc=0` both (27-29s real hermes calls each), real diffs (`hello.txt` created verbatim as
  prompted; the `decisions` arm additionally shows `.mole/decisions/D1.md` copied into the worktree),
  `mole_check_scorer` = 0 questions both arms (via the real built `release/mole-code/dist/cli.js`), no
  leftover git worktrees after the run (`git worktree list` shows only the main one).
- `agent=claude_code` attempted with `--model mockllm/model` against the same scratch repo and export:
  **NOT RUN to completion** -- real `claude` 2.1.293 CLI invoked, but every sample errored with
  `SandboxInjectionError: ... Tool support injection is not implemented for OS: Darwin. Only Linux
  containers are currently supported.` from `inspect_ai/tool/_sandbox_tools_utils/sandbox.py` ->
  `sandbox_agent_bridge()` (inspect-ai 0.3.286), which unconditionally injects "sandbox tools" regardless
  of whether any are actually used, and only supports a Linux target. This reproduces on this macOS
  machine for ANY Inspect sandbox whose OS is Darwin (the "local" sandbox IS the host OS here), not
  something specific to this kit's code -- `evals/inspect/mole_eval/task.py`'s own `claude_code()` usage
  (T17) avoids it by using a Docker sandbox (Linux container) instead of `"local"`. `agent=claude_code`/
  `codex` is therefore verified via: (a) `test_external_agent.py`'s unit tests (construction + metadata
  contract, `as_solver` monkeypatched -- 4 tests, all green in both the private suite and the export), and
  (b) the pre-existing, unmodified T17 Docker-sandbox pattern this kit's design note explicitly cites as
  the fallback for a Mac. A genuine macOS-Docker or Linux-host end-to-end run of `agent=claude_code`/
  `codex` needs a machine/CI runner this task did not have; documented as a known limitation in
  `docs/experiments.md`, not claimed as working.
- `npm run check` NOT RUN (brief: never run it in the main repo; this change touches no TS package, only
  `evals/`, `docs/`, and `scripts/export-public.mjs`, none of which `npm run check` covers).

## Needs Raymond
- Nothing blocking. Optional: a real Linux or Docker-sandboxed run of `agent=claude_code`/`codex` to
  confirm the local-sandbox path end to end off this Mac, if/when he wants that extra confidence before
  recommending it to users.

## Round 3 fix (hermes-main, 11-04 ~20:45, after review deleg_8888be34 FAIL)
- HIGH 1 default package v0.5.0 predates D102 blocking hooks → default = releases/latest/download/mole-code.tgz; preflight now also requires the installed lib.mjs to export crispViolationsForOverlay, else fails "predates the blocking hooks" with the fix command.
  real check: v0.5.0 release tarball → FAIL (predates); fresh build of this branch (node release/mole-code/tools/build.mjs + npm pack) → PASS.
- HIGH 2 info/exclude for a linked worktree used --git-dir → `git rev-parse --git-path info/exclude` (common dir).
- red: 4 log/red-r3.txt (3 failed) · green: pytest 76 passed / 8 skipped.
- TODO at release: upload asset named mole-code.tgz to the newest GitHub release (else the default URL 404s → npm install fails → honest instruction-file fallback).
