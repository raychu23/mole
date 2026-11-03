#!/usr/bin/env python3
"""T83 collaboration spike: PR-overlap measure for squash/rebase-merge repos.

Review finding this answers: git's commit history for a squash- or
rebase-merge repo (korifi, dapr, adr-tools, cloudfoundry/cli) only ever shows
the linear post-merge sequence of squash commits on the default branch --
there is no 2-parent merge commit to inspect, so `mine_adr_merges.py`'s
merge-based method is structurally blind to concurrency in these repos. The
reviewer found cloudfoundry/korifi PR #21 and #22 open concurrently for ~5
weeks, each touching a different ADR file -- real concurrent editing that the
merge-commit method cannot see because korifi squashes.

This script recovers PR-level timing from the GitHub REST API (unauthenticated,
60 req/hour) instead of the git graph:

  1. Locally (no API cost) list commits on the default branch that touched a
     decision dir, and the decision file(s) each commit touched
     (`git show --name-only`). Requires a local clone (see repos.json "path").
  2. For each such commit, GET /repos/{owner}/{repo}/commits/{sha}/pulls --
     this single call returns the associated PR's number, created_at and
     merged_at (so no second call to GET /pulls/{n} is needed for timing).
  3. GET /pulls/{n}/files to confirm the PR's own file list (in case the
     squash commit's diff and the PR's cumulative diff differ, e.g. a
     force-push or additional non-squashed commits) -- used to double check
     which decision file(s) a PR touched, overriding the local commit-diff
     guess only when the PR touched additional decision files.
  4. Every raw response is cached to `4 log/github-cache/<repo>/<kind>-<key>.json`
     and re-read from cache on rerun, so results are reproducible without
     spending more of the 60/hour budget.
  5. PRs whose [created_at, merged_at] intervals overlap are counted; overlap
     pairs are split into "same decision file" vs "different decision files".

Budget: unauthenticated GitHub REST API is 60 requests/hour, and in this
environment that budget is shared (other usage had already consumed part of
it before this script ran). `--max-requests` hard-stops network calls once
spent; commits beyond that point are recorded as NOT MEASURED, not silently
skipped. Rerun later (next hour) with `--only <repo>` to fill in repos that
were skipped.

Usage:
    python3 pr_overlap.py --repos repos.json --out-dir OUT_DIR \
        --cache-dir "4 log/github-cache" --only korifi,dapr --max-requests 29
"""
from __future__ import annotations

import argparse
import csv
import json
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

API_ROOT = "https://api.github.com"
UA = {"User-Agent": "mole-t83-collaboration-spike", "Accept": "application/vnd.github+json"}


class Budget:
    def __init__(self, max_requests: int):
        self.max_requests = max_requests
        self.used = 0
        self.exhausted_at: list[str] = []  # descriptions of calls we refused to make

    def allow(self) -> bool:
        return self.used < self.max_requests

    def spend(self):
        self.used += 1


def run(cmd: list[str], cwd: str, check: bool = True) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, cwd=cwd, check=check, capture_output=True, text=False)


def git_lines(cmd: list[str], cwd: str) -> list[str]:
    r = run(cmd, cwd)
    return r.stdout.decode("utf-8", "replace").splitlines()


def local_commits_touching(repo_path: str, dirs: list[str]) -> list[dict]:
    """Commits on HEAD touching any decision dir, oldest first, each with the
    exact decision file(s) it changed -- computed purely from the local
    clone, zero GitHub API cost."""
    shas = list(
        reversed(
            git_lines(["git", "log", "--pretty=%H", "HEAD", "--", *dirs], repo_path)
        )
    )
    out = []
    for sha in shas:
        files = [
            f
            for f in git_lines(
                ["git", "show", "--name-only", "--pretty=format:", sha, "--", *dirs],
                repo_path,
            )
            if f.strip()
        ]
        out.append({"sha": sha, "files": files})
    return out


def cached_get(url: str, cache_path: Path, budget: Budget, label: str) -> dict | list | None:
    if cache_path.exists():
        return json.loads(cache_path.read_text())
    if not budget.allow():
        budget.exhausted_at.append(label)
        return None
    req = urllib.request.Request(url, headers=UA)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            remaining = r.headers.get("X-RateLimit-Remaining")
            data = json.loads(r.read().decode("utf-8", "replace"))
    except urllib.error.HTTPError as e:
        data = {"_error": e.code, "_url": url}
        remaining = e.headers.get("X-RateLimit-Remaining") if e.headers else None
    budget.spend()
    print(f"   GET {url} -> cached (rate-limit-remaining={remaining})", file=sys.stderr)
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    cache_path.write_text(json.dumps(data, indent=2))
    time.sleep(0.2)
    return data


def collect_repo(repo_cfg: dict, cache_dir: Path, budget: Budget) -> dict:
    name = repo_cfg["name"]
    slug = repo_cfg["github"]
    safe = name.replace("/", "_")
    commits = local_commits_touching(repo_cfg["path"], repo_cfg["dirs"])
    prs: dict[int, dict] = {}
    not_measured_commits: list[str] = []
    for c in commits:
        sha = c["sha"]
        cache_path = cache_dir / safe / f"commit-pulls-{sha}.json"
        data = cached_get(
            f"{API_ROOT}/repos/{slug}/commits/{sha}/pulls",
            cache_path,
            budget,
            f"{name}:{sha}:commits/pulls",
        )
        if data is None:
            not_measured_commits.append(sha)
            continue
        if not isinstance(data, list) or not data:
            continue
        pr = data[0]  # squash workflow: one commit <-> one PR
        n = pr.get("number")
        if n is None:
            continue
        prs.setdefault(
            n,
            {
                "number": n,
                "created_at": pr.get("created_at"),
                "merged_at": pr.get("merged_at"),
                "files": set(c["files"]),
            },
        )["files"].update(c["files"])

    # Optionally confirm each PR's file list via /pulls/{n}/files, budget
    # permitting -- corrects cases where the squash commit's own diff (vs
    # the PR's cumulative diff) disagrees, e.g. after a force-push.
    for n, pr in prs.items():
        cache_path = cache_dir / safe / f"pr-files-{n}.json"
        data = cached_get(
            f"{API_ROOT}/repos/{slug}/pulls/{n}/files",
            cache_path,
            budget,
            f"{name}:PR#{n}:pulls/files",
        )
        if data is None:
            continue  # keep the commit-diff-derived file set; not re-measured
        if isinstance(data, list):
            pr["files"].update(
                f["filename"]
                for f in data
                if any(f["filename"].startswith(d) for d in repo_cfg["dirs"])
            )

    return {
        "name": name,
        "commits_found": len(commits),
        "commits_not_measured": not_measured_commits,
        "prs": prs,
    }


def overlaps(a: dict, b: dict) -> bool:
    if not a.get("created_at") or not a.get("merged_at"):
        return False
    if not b.get("created_at") or not b.get("merged_at"):
        return False
    return a["created_at"] < b["merged_at"] and b["created_at"] < a["merged_at"]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--repos", required=True)
    ap.add_argument("--out-dir", required=True)
    ap.add_argument("--cache-dir", required=True)
    ap.add_argument("--only", default="", help="comma-separated repo basenames to measure this run")
    ap.add_argument("--max-requests", type=int, default=30)
    args = ap.parse_args()

    repos_cfg = json.loads(Path(args.repos).read_text())
    squash_repos = [r for r in repos_cfg if r.get("squash")]
    only = {s.strip() for s in args.only.split(",") if s.strip()}

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    cache_dir = Path(args.cache_dir)
    budget = Budget(args.max_requests)

    results = {}
    not_run_at_all = []
    for r in squash_repos:
        basename = r["name"].split("/")[-1]
        if only and basename not in only and r["name"] not in only:
            not_run_at_all.append(r["name"])
            continue
        print(f"-- PR-overlap: {r['name']} --", file=sys.stderr)
        results[r["name"]] = collect_repo(r, cache_dir, budget)

    pair_rows = []
    summary = {"per_repo": {}, "not_run_this_pass": not_run_at_all, "requests_used": 0}
    for name, res in results.items():
        prs = list(res["prs"].values())
        same_file_pairs = 0
        diff_file_pairs = 0
        for i in range(len(prs)):
            for j in range(i + 1, len(prs)):
                a, b = prs[i], prs[j]
                if overlaps(a, b):
                    same = bool(a["files"] & b["files"])
                    if same:
                        same_file_pairs += 1
                    else:
                        diff_file_pairs += 1
                    pair_rows.append(
                        {
                            "repo": name,
                            "pr_a": a["number"],
                            "pr_b": b["number"],
                            "created_a": a["created_at"],
                            "merged_a": a["merged_at"],
                            "created_b": b["created_at"],
                            "merged_b": b["merged_at"],
                            "files_a": ";".join(sorted(a["files"])),
                            "files_b": ";".join(sorted(b["files"])),
                            "same_decision_file": same,
                        }
                    )
        summary["per_repo"][name] = {
            "commits_touching_decision_dir": res["commits_found"],
            "commits_not_measured_rate_limited": len(res["commits_not_measured"]),
            "prs_measured": len(prs),
            "overlapping_pr_pairs_same_file": same_file_pairs,
            "overlapping_pr_pairs_different_file": diff_file_pairs,
        }
    summary["requests_used"] = budget.used
    summary["requests_exhausted_on"] = budget.exhausted_at

    csv_path = out_dir / "pr_overlap_pairs.csv"
    with csv_path.open("w", newline="") as fh:
        fields = [
            "repo", "pr_a", "pr_b", "created_a", "merged_a", "created_b", "merged_b",
            "files_a", "files_b", "same_decision_file",
        ]
        w = csv.DictWriter(fh, fieldnames=fields)
        w.writeheader()
        for row in pair_rows:
            w.writerow(row)

    (out_dir / "pr_overlap_summary.json").write_text(json.dumps(summary, indent=2))
    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
