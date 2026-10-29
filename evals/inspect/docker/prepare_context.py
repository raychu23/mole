#!/usr/bin/env python3
"""Build the Docker context for the T17 sandbox from git (no working-tree files, no credentials):
  context/subject.bundle = Mole history up to the key's subject commit only (later commits, incl. this eval, are not in it)
  context/tool.tar       = Mole at the key's tool commit (T15 plugin, MCP server, daemon CLI); built inside the image
python3 evals/inspect/docker/prepare_context.py [--repo PATH]"""
import argparse
import json
import shutil
import subprocess
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
EVAL_DIR = HERE.parent
REPO = EVAL_DIR.parents[1]
TOOL_PATHS = ["packages", "plugins", "apps", "package.json", "package-lock.json", "tsconfig.base.json", "tsconfig.json"]


def run(*a: str) -> str:
    return subprocess.run(a, check=True, capture_output=True, text=True).stdout


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", default=str(REPO))
    args = ap.parse_args()
    key = json.loads((EVAL_DIR / "cases" / "key.json").read_text())
    subject, tool = key["subject"]["commit"], key["tool"]["commit"]
    ctx = HERE / "context"
    ctx.mkdir(exist_ok=True)
    tmp = Path(tempfile.mkdtemp(prefix="t17-subject-"))
    try:
        run("git", "clone", "-q", "--no-checkout", "--shared", args.repo, str(tmp / "r"))
        run("git", "-C", str(tmp / "r"), "update-ref", "refs/heads/main", run("git", "-C", args.repo, "rev-parse", subject).strip())
        run("git", "-C", str(tmp / "r"), "bundle", "create", str(ctx / "subject.bundle"), "main")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    run("git", "-C", args.repo, "archive", "--format=tar", "-o", str(ctx / "tool.tar"), tool, *TOOL_PATHS)
    for f in ("subject.bundle", "tool.tar"):
        print(f"{ctx / f}  {(ctx / f).stat().st_size / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
