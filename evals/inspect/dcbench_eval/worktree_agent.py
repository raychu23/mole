"""The Inspect solver that runs the REAL hermes agent against a per-sample git worktree (T90 follow-up:
the FAIL review found nothing in this package imported inspect_ai; this is the piece that does the actual
work mole_ab needs, since hermes -z edits files itself and so cannot run inside Inspect's plain
generate()/ModelAPI boundary -- see hermes_provider.py's docstring for why that boundary doesn't fit here).

Pattern borrowed from inspect-swe's external-agent wrapper (github.com/UKGovernmentBEIS/inspect_swe,
`inspect_swe/_claude_code/agent.py`, used in this repo already by evals/inspect/mole_eval/task.py's
`claude_code()`): an Inspect `@solver` owns the agent's lifecycle (setup, run, teardown) and the SAMPLE's
isolation boundary, while the agent itself (there: Claude Code in a Docker container; here: `hermes -z` in
a dedicated git worktree) does its own file edits and tool calls outside Inspect's model loop. inspect-swe
needs a model BRIDGE because Claude Code calls an LLM API Inspect must intercept to log/score/limit;
`hermes -z --provider anthropic` does not need that bridge because it IS the thing that calls the model
(through this project owner's own hermes subscription, per the standing rule), so the solver just runs it as a subprocess
and lets Inspect log the resulting transcript/usage/diff the same way a tool call would be logged.

Isolation: one `git worktree add --detach <pinned commit, default HEAD>` per sample under a temp dir.

Cleanup ownership (T90 round-2 review FAIL fix): a per-sample worktree is a resource the SOLVER creates,
so per Inspect's own documented pattern for solver-owned per-sample resources (the `cleanup=` argument to
`Task`, inspect_ai/_eval/task/task.py -- "Optional cleanup function for task. Called after scoring for each
sample run"), ownership belongs to a Task-level `cleanup(state)` callback, not a `finally:` in the scorer.
Reading `inspect_ai/_eval/task/run.py`'s sample loop confirms the semantics this fix relies on: `cleanup`
sits in a `finally` that runs AFTER scoring but regardless of HOW the sample ended -- solver raised,
LimitExceededError (token/time/turn limit), operator-cancelled, or clean success -- and it runs inside a
shielded cancel scope, so it still executes even if the sample itself was just cancelled. That is exactly
the three cases the previous scorer-only `finally` missed: a raised exception never reached the scorer's
`finally` (scorer never ran), and a cancelled/timed-out sample never reaches the scorer either. The scorer
still runs first (when it runs) and reads `state.metadata["diff"]` while the worktree is still on disk;
`cleanup_sample` below only ever deletes after that, whether or not scoring happened.

A killed/timed-out sample (Inspect's Task `time_limit`) needs one more piece: `run_hermes`'s `subprocess.run`
is a blocking synchronous call, which (called directly in an `async def solve`) blocks the event loop and
makes Inspect's cooperative `time_limit` cancellation unable to interrupt it until it returns on its own.
Running it via `anyio.to_thread.run_sync(..., abandon_on_cancel=True)` restores a real await/cancellation
point: when the Task's `time_limit` (or any other limit) fires, the awaited call is abandoned immediately
(the subprocess itself is reaped later by its own `AGENT_TIMEOUT_S`/OS, same as before), the resulting
cancellation propagates out of `solve` same as any other sample-ending condition, and `cleanup_sample` still
runs per the guarantee above.

Stale-worktree sweep: besides per-sample cleanup, a previous RUN that crashed the whole process (not just
one sample) can leave worktrees registered with no Inspect cleanup ever having run. `prune_stale_worktrees`
runs `git worktree prune` (drops registrations whose directory is already gone) and additionally removes any
leftover `mole_ab-*` directories under the system temp dir that are older than the current run and still
registered against `repo` -- called once per Task build, before any samples run.

Per this project's own shared instructions file: never write into a live `.mole/` of a real repo -- the worktree is always a throwaway path
under tempfile.mkdtemp(), never the repo's own working tree.
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import tempfile
import time
from pathlib import Path

import anyio.to_thread
from inspect_ai.model import ChatMessageAssistant
from inspect_ai.solver import Generate, Solver, TaskState, solver

from .arms import ArmConfig, apply_arm, parse_arm

DEFAULT_MODEL = "claude-sonnet-5"
DEFAULT_PROVIDER = "anthropic"
AGENT_TIMEOUT_S = 1200
WORKTREE_PREFIX = "mole_ab-"
WORKTREES_DIRNAME = ".mole_ab_worktrees"


def _lock_path(wt: Path) -> Path:
    return wt.parent / f"{wt.name}.lock"


def _write_worktree_lock(wt: Path) -> None:
    """A per-worktree (pid, created) lock file (T93 round-2 review MEDIUM fix): `prune_stale_worktrees`
    uses this -- not an age threshold -- to tell a worktree still owned by a LIVE run from an orphan, so a
    long-running eval is never swept out from under itself just because it has been going for over an
    hour, and a crashed run's leftovers are swept immediately rather than waiting out the old 1h floor."""
    try:
        _lock_path(wt).write_text(json.dumps({"pid": os.getpid(), "created": time.time()}))
    except OSError:
        pass  # best-effort: a missing lock just falls back to the legacy age-based sweep for this worktree


def _pid_is_live(pid: int) -> bool:
    if pid <= 0:
        return False
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True  # exists, just owned by someone else -- definitely still live
    except OSError:
        return False
    return True


def ensure_worktrees_excluded(repo: Path, dirname: str = WORKTREES_DIRNAME) -> None:
    """T93 round-2 review MEDIUM fix: `<repo>/<dirname>` (mole_ab's bind-mount-friendly worktree root, see
    task.py/compose.yaml) must never show up as untracked changes in the user's own `git status` -- but it
    must NEVER be done by editing the user's own tracked `.gitignore` (their file, their call). git's own
    documented answer for "ignore a path locally without touching a tracked ignore file" is
    `.git/info/exclude`, same semantics as `.gitignore` but untracked and local to this checkout only
    (https://git-scm.com/docs/gitignore, "$GIT_DIR/info/exclude"). Idempotent: only appends the entry if a
    `.mole_ab_worktrees` exclude is not already present (so re-running a sweep/task build repeatedly never
    grows the file). No-op (never raises) if `repo` is not a git repo at all or `.git` is missing/unwritable
    -- this is a convenience, not something that should ever fail a sample."""
    # `--git-path info/exclude` resolves to the file git actually reads, which for a linked worktree is in the
    # COMMON dir, not the per-worktree `--git-dir` (T93 round-3 review HIGH; https://git-scm.com/docs/git-rev-parse).
    path_r = subprocess.run(["git", "-C", str(repo), "rev-parse", "--git-path", "info/exclude"],
                            capture_output=True, text=True)
    if path_r.returncode != 0:
        return
    exclude_path = Path(path_r.stdout.strip())
    if not exclude_path.is_absolute():
        exclude_path = repo / exclude_path
    entry = f"/{dirname}/"
    try:
        existing = exclude_path.read_text() if exclude_path.exists() else ""
        if entry in existing.splitlines():
            return
        exclude_path.parent.mkdir(parents=True, exist_ok=True)
        sep = "" if not existing or existing.endswith("\n") else "\n"
        exclude_path.write_text(
            f"{existing}{sep}# added by mole_ab (evals/inspect/dcbench_eval): per-sample agent worktrees, "
            f"never the user's own .gitignore\n{entry}\n"
        )
    except OSError:
        pass  # best-effort, see docstring


def make_worktree(repo: Path, commit: str = "HEAD", worktrees_root: Path | None = None) -> Path:
    """`worktrees_root`: when set (mole_ab's Docker-sandboxed agent=claude_code/codex path -- see task.py
    and compose.yaml's comment), the worktree is created UNDER it instead of the system temp dir, so a
    single bind mount of that root (compose.yaml mounts `<repo>/.mole_ab_worktrees`'s parent, the repo
    itself) makes the worktree visible inside the sandbox at the identical host path. Default (None, used
    by hermes and the "local" sandbox) is unchanged: system temp dir, no bind mount needed since that
    sandbox execs directly on the host filesystem. When `worktrees_root` sits inside `repo` (the Docker
    path), `ensure_worktrees_excluded` registers it in `.git/info/exclude` (never the user's .gitignore) so
    it never shows up as untracked changes."""
    base = worktrees_root if worktrees_root is not None else Path(tempfile.gettempdir())
    base.mkdir(parents=True, exist_ok=True)
    try:
        if worktrees_root is not None and worktrees_root.resolve().is_relative_to(repo.resolve()):
            ensure_worktrees_excluded(repo, worktrees_root.name)
    except (OSError, ValueError):
        pass  # best-effort; a worktree still gets created even if the exclude bookkeeping fails
    wt = Path(tempfile.mkdtemp(prefix=WORKTREE_PREFIX, dir=str(base)))
    shutil.rmtree(wt)  # git worktree add refuses an existing non-empty dir; mkdtemp gave us a unique name
    r = subprocess.run(["git", "-C", str(repo), "worktree", "add", "-q", "--detach", str(wt), commit], capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(f"git worktree add failed for {repo} @ {commit}: {r.stderr}")
    _write_worktree_lock(wt)
    return wt


def remove_worktree(repo: Path, wt: Path) -> None:
    subprocess.run(["git", "-C", str(repo), "worktree", "remove", "--force", str(wt)], capture_output=True)
    shutil.rmtree(wt, ignore_errors=True)
    _lock_path(wt).unlink(missing_ok=True)


async def cleanup_sample(state: TaskState) -> None:
    """Task-level `cleanup=` callback (see module docstring): runs once per sample, after scoring,
    regardless of whether the solver raised, was cancelled/timed out, or succeeded. Idempotent / safe to
    call when the solver never got as far as creating a worktree (metadata absent) -- e.g. a bad `arm` spec
    raised before `make_worktree`."""
    wt = state.metadata.get("worktree")
    repo = state.metadata.get("repo")
    if wt and repo:
        remove_worktree(Path(repo), Path(wt))


def prune_stale_worktrees(repo: Path, max_age_s: float = 0.0) -> list[str]:
    """Sweep run once at Task build time (before any sample runs): `git worktree prune` drops registrations
    whose checkout directory is already gone (e.g. someone `rm -rf`'d it by hand); on top of that, remove any
    leftover `mole_ab-*` worktrees still registered against `repo`.

    T93 round-2 review MEDIUM fix: "stale" is now "not owned by a live run" (a `{pid, created}` lock file
    written by `make_worktree`/`_write_worktree_lock`, checked via `_pid_is_live`), not just "older than
    `max_age_s`". The old age-only floor had two failure modes the review called out: (1) a crashed run's
    leftovers could sit for up to an hour before the next sweep touched them even though nothing was using
    them -- removed the moment the lock's pid is confirmed dead now, regardless of age; (2) a legitimately
    long-running concurrent eval (more than an hour on a slow model/dataset) could have its STILL-IN-FLIGHT
    worktree swept out from under it -- a live pid in the lock is now never removed, regardless of age.
    `max_age_s` is kept only as the fallback for a worktree with no lock file at all (one made before this
    fix shipped, or whose lock write failed) -- same semantics as before for that legacy case. Returns the
    paths actually removed, for logging."""
    subprocess.run(["git", "-C", str(repo), "worktree", "prune"], capture_output=True)
    r = subprocess.run(["git", "-C", str(repo), "worktree", "list", "--porcelain"], capture_output=True, text=True)
    removed: list[str] = []
    now = time.time()
    for line in r.stdout.splitlines():
        if not line.startswith("worktree "):
            continue
        path = Path(line.split(" ", 1)[1])
        if not path.name.startswith(WORKTREE_PREFIX):
            continue
        try:
            mtime = path.stat().st_mtime
        except FileNotFoundError:
            continue  # prune already dropped the registration; nothing left to remove
        lock = _lock_path(path)
        if lock.exists():
            try:
                info = json.loads(lock.read_text())
                if _pid_is_live(int(info.get("pid", -1))):
                    continue  # a live run still owns this worktree -- never touch it, any age
            except (OSError, ValueError, json.JSONDecodeError):
                pass  # corrupt lock: fall through and treat it like a dead one, remove below
            remove_worktree(repo, path)  # lock present but pid is dead (or corrupt): stale regardless of age
            removed.append(str(path))
            continue
        # no lock at all (legacy worktree from before this fix, or a failed lock write): fall back to the
        # original age-based floor so an in-flight legacy worktree is still never swept mid-run.
        age = now - mtime
        if age >= max_age_s:
            remove_worktree(repo, path)
            removed.append(str(path))
    return removed


def run_hermes(prompt: str, cwd: Path, model: str, provider: str, usage_path: Path, timeout: int = AGENT_TIMEOUT_S) -> tuple[int, str, str, float]:
    # T93 review FAIL fix #4: a public user who forgets `-T agent=claude_code`/`codex` (now the exception,
    # not the default -- see task.py's `agent` default) used to get a raw `FileNotFoundError: [Errno 2]
    # No such file or directory: 'hermes'` from subprocess.run, which gives no hint that `agent=claude_code`
    # or `agent=codex` are the options that don't need a hermes install/subscription at all.
    if shutil.which("hermes") is None:
        raise RuntimeError(
            "mole_ab: agent='hermes' needs the `hermes` CLI on PATH (a hermes subscription). "
            "If you don't have hermes, pass -T agent=claude_code or -T agent=codex instead "
            "(real Claude Code / Codex, no hermes subscription needed -- see external_agent.py)."
        )
    # -t "terminal,file" (not "" -- that is hermes_provider.py's text-only mode): this solver's whole point
    # is an agent that can edit files, same tool set run_dcbench.py uses for the identical reason.
    cmd = ["hermes", "-z", prompt, "-m", model, "--provider", provider, "-t", "terminal,file", "--safe-mode",
           "--usage-file", str(usage_path), "--in", str(cwd)]
    t0 = time.time()
    try:
        p = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=timeout)
        return p.returncode, p.stdout, p.stderr, time.time() - t0
    except subprocess.TimeoutExpired:
        return -1, "", f"TIMEOUT after {timeout}s", time.time() - t0


def worktree_diff(wt: Path) -> str:
    """Full diff, INCLUDING untracked new files. Plain `git diff` only shows tracked content, so an agent
    that implements a decision entirely inside a newly-created file is invisible to any scorer or
    rescoring reading this diff later -- the exact bug error-analysis-72.md found in dcbench's own scorer
    (60/111 = 54% of T63's failed gotchas, orchestrator-verified 2026-11-04): grep_diff reads plain `git
    diff`, which never shows new-file content. Fix: `git add --intent-to-add --all` (`git add -N`) first --
    per git-add(1), this stages the FACT that a path will be added without staging its bytes, which is
    enough for `git diff` to show the new file's full content as an addition
    (https://git-scm.com/docs/git-add, "--intent-to-add"). Every mole_ab run stores this diff in sample
    metadata, which Inspect's .eval log persists -- so, unlike T63 (whose runs.jsonl kept only
    diffFiles/untracked name lists, never diff text; error-analysis-72.md's "Data available" note), any
    mole_ab run can be rescored later from its log alone.
    """
    subprocess.run(["git", "-C", str(wt), "add", "--intent-to-add", "--all"], capture_output=True)
    r = subprocess.run(["git", "-C", str(wt), "diff"], capture_output=True, text=True)
    return r.stdout


@solver
def hermes_worktree_agent(repo: str, model: str = DEFAULT_MODEL, provider: str = DEFAULT_PROVIDER) -> Solver:
    """repo: path to the real git repo the task operates on; the agent runs in a throwaway worktree off it,
    never the live working tree."""
    repo_path = Path(repo)

    async def solve(state: TaskState, generate: Generate) -> TaskState:
        arm_spec = state.metadata["arm"]
        arm = parse_arm(arm_spec) if isinstance(arm_spec, str) else arm_spec
        commit = state.metadata.get("commit", "HEAD")
        wt = make_worktree(repo_path, commit)
        state.metadata["worktree"] = str(wt)
        state.metadata["repo"] = str(repo_path)
        try:
            prompt = state.input_text
            prompt = apply_arm(arm, wt, prompt)
            usage_path = wt.parent / f"{wt.name}.usage.json"
            # abandon_on_cancel=True: see module docstring -- without this, run_hermes's blocking
            # subprocess.run would swallow Inspect's own time_limit cancellation until it returns on its
            # own; with it, a limit firing propagates out of `solve` immediately like any other end-of-
            # sample condition, and Task's cleanup= still removes the worktree.
            rc, out, err, seconds = await anyio.to_thread.run_sync(
                run_hermes, prompt, wt, model, provider, usage_path, AGENT_TIMEOUT_S, abandon_on_cancel=True
            )
            state.metadata["agent_rc"] = rc
            state.metadata["agent_seconds"] = round(seconds, 2)
            state.metadata["agent_stdout_tail"] = out[-2000:]
            state.metadata["agent_stderr_tail"] = err[-2000:]
            try:
                state.metadata["usage"] = json.loads(usage_path.read_text()) if usage_path.exists() else {}
            except Exception:  # noqa: BLE001
                state.metadata["usage"] = {}
            state.metadata["diff"] = worktree_diff(wt)
            state.messages.append(ChatMessageAssistant(content=out[-4000:] or f"(hermes exit {rc}, no stdout)"))
        except Exception as e:  # noqa: BLE001 - record and let the scorer see worktree=None for diagnosis
            state.metadata["agent_error"] = str(e)
            raise
        return state

    return solve
