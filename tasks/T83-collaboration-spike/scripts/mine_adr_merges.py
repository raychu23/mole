#!/usr/bin/env python3
"""T83 collaboration spike: mine real repos for concurrent edits to decision
records (ADR-style markdown) around merge commits, classify the conflicts,
and check whether git's own 3-way merge (`git merge-file`) resolves them
cleanly.

Usage:
    python3 mine_adr_merges.py --repos repos.json --out-dir OUT_DIR

repos.json: list of {"name": str, "path": "<git repo path>", "dirs": [<decision
dir prefixes relative to repo root>]}

For every merge commit M (two parents P1, P2) whose tree-diff touches a path
inside one of the decision dirs, this script:
  1. finds base = merge-base(P1, P2)
  2. finds files under the decision dirs changed BOTH in base->P1 and in
     base->P2 (i.e. edited on both sides of the merge, regardless of whether
     git itself reported a conflict)
  3. for each such file, replays the 3-way merge with `git merge-file -p`
     against the base/P1/P2 blobs (not the recorded merge-commit result) and
     records whether it resolves cleanly
  4. classifies the pair of edits as same_field / different_fields /
     body_only / added_both using a lightweight heading/field scanner

Output: one CSV row per (merge, file) event, plus a per-repo summary JSON.
No network calls beyond what git itself does lazily for partial clones;
every number here is reproducible by rerunning this script against the
repo paths recorded in repos.json.
"""
from __future__ import annotations

import argparse
import csv
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

FIELD_HEADING_RE = re.compile(
    r"^(#{1,6}\s*|\*\*)\s*(status|date|created|author|deciders|decision-makers|"
    r"consulted|informed|tags|supersedes|superseded by|summary)\s*[:\*]*\s*$",
    re.IGNORECASE,
)
# Looser variant that also matches "**Created**: 2025-12-08" (field + value on
# one line, common in the non-MADR / free-form ADR style repos use).
FIELD_INLINE_RE = re.compile(
    r"^(\*\*|#{1,6}\s*)(status|date|created|author|deciders|decision-makers|"
    r"consulted|informed|tags|supersedes|superseded by|summary)(\*\*|:)",
    re.IGNORECASE,
)
BODY_HEADING_RE = re.compile(r"^#{1,6}\s+(.*)$")


def run(cmd: list[str], cwd: str, check: bool = True) -> subprocess.CompletedProcess:
    return subprocess.run(
        cmd, cwd=cwd, check=check, capture_output=True, text=False
    )


def git_lines(cmd: list[str], cwd: str) -> list[str]:
    r = run(cmd, cwd)
    return r.stdout.decode("utf-8", "replace").splitlines()


def git_text(cmd: list[str], cwd: str) -> str | None:
    r = run(cmd, cwd, check=False)
    if r.returncode != 0:
        return None
    return r.stdout.decode("utf-8", "replace")


def merge_commits_touching(repo: str, dirs: list[str]) -> list[str]:
    pathspecs = [f"{d}" for d in dirs]
    out = git_lines(
        ["git", "log", "--merges", "--pretty=%H", "HEAD", "--", *pathspecs], repo
    )
    return out


def parents_of(repo: str, sha: str) -> list[str]:
    out = git_text(["git", "log", "-1", "--pretty=%P", sha], repo)
    return (out or "").strip().split()


def merge_base(repo: str, a: str, b: str) -> str | None:
    out = git_text(["git", "merge-base", a, b], repo)
    return out.strip() if out else None


def changed_files(repo: str, a: str, b: str, dirs: list[str]) -> set[str]:
    out = git_lines(
        ["git", "diff", "--name-only", a, b, "--", *dirs], repo
    )
    return set(out)


def classify_sections(base_lines: list[str], changed_line_idxs: set[int]) -> set[str]:
    """Return the set of 'field' names (lowercased) whose line range contains a
    changed line, using the nearest preceding heading/field marker. Lines not
    under a recognized metadata field are tagged 'body'."""
    sections: set[str] = set()
    current_field = "body"
    field_for_line: dict[int, str] = {}
    for i, line in enumerate(base_lines):
        m = FIELD_HEADING_RE.match(line.strip())
        if m:
            current_field = m.group(2).lower()
        else:
            m2 = FIELD_INLINE_RE.match(line.strip())
            if m2:
                current_field = m2.group(2).lower()
            elif BODY_HEADING_RE.match(line.strip()):
                # A normal prose heading (Context/Decision/Consequences/...)
                # resets to body unless it's itself a recognized field.
                hm = BODY_HEADING_RE.match(line.strip())
                heading_text = hm.group(1).strip().lower() if hm else ""
                if heading_text in (
                    "status",
                    "date",
                    "deciders",
                    "decision-makers",
                    "consulted",
                    "informed",
                    "tags",
                ):
                    current_field = heading_text
                else:
                    current_field = "body"
        field_for_line[i] = current_field
    for idx in changed_line_idxs:
        sections.add(field_for_line.get(idx, "body"))
    return sections


def diff_changed_base_lines(repo: str, base_blob: str, other_blob: str, path: str) -> set[int]:
    """Return 0-indexed line numbers IN THE BASE VERSION that were
    removed/changed going from base_blob to other_blob (i.e. touched by this
    side of the merge)."""
    base_txt = git_text(["git", "cat-file", "-p", f"{base_blob}:{path}"], repo)
    if base_txt is None:
        return set()
    r = run(
        [
            "git",
            "diff",
            "--no-color",
            "-U0",
            base_blob,
            other_blob,
            "--",
            path,
        ],
        repo,
        check=False,
    )
    text = r.stdout.decode("utf-8", "replace")
    changed: set[int] = set()
    hunk_re = re.compile(r"^@@ -(\d+)(?:,(\d+))?")
    for line in text.splitlines():
        m = hunk_re.match(line)
        if m:
            start = int(m.group(1))
            count = int(m.group(2)) if m.group(2) else 1
            for ln in range(start, start + max(count, 1)):
                changed.add(ln - 1)  # to 0-index
    return changed


def blob_exists(repo: str, commit: str, path: str) -> bool:
    r = run(["git", "cat-file", "-e", f"{commit}:{path}"], repo, check=False)
    return r.returncode == 0


def merge_file_clean(repo: str, base: str, p1: str, p2: str, path: str, tmpdir: Path) -> tuple[bool, bool]:
    """Returns (ran_ok, clean). ran_ok False means one side added/removed the
    file (not a like-for-like 3-way text merge).

    CAVEAT: git's 3-way merge is line-based, not field-based. Two edits are
    flagged as a real conflict whenever they touch overlapping or ADJACENT
    diff hunks, even when the edits are logically independent — e.g. one
    side changes the `Status:` line and the other appends a new paragraph
    directly below it. Because `Status:` and the body text sit on adjacent
    lines in most ADR templates, such a pair conflicts under `git merge-file`
    even though no field's *value* actually collides. So `merge_file_clean`
    (and any rate derived from it) measures line-adjacency conflicts, not
    semantic/field conflicts; classify_event()'s same_field/different_fields
    split is the more meaningful signal for "did two edits actually touch the
    same decision," and still undercounts adjacency-only conflicts as
    different_fields or body_only even when git itself would refuse to
    auto-merge them.
    """
    base_txt = git_text(["git", "cat-file", "-p", f"{base}:{path}"], repo)
    p1_txt = git_text(["git", "cat-file", "-p", f"{p1}:{path}"], repo)
    p2_txt = git_text(["git", "cat-file", "-p", f"{p2}:{path}"], repo)
    if base_txt is None or p1_txt is None or p2_txt is None:
        return False, False
    bf = tmpdir / "base.txt"
    f1 = tmpdir / "p1.txt"
    f2 = tmpdir / "p2.txt"
    bf.write_text(base_txt)
    f1.write_text(p1_txt)
    f2.write_text(p2_txt)
    r = subprocess.run(
        ["git", "merge-file", "-p", str(f1), str(bf), str(f2)],
        capture_output=True,
        text=True,
    )
    # returncode 0 = clean, >0 = number of conflicting hunks, <0 = error
    if r.returncode < 0:
        return False, False
    return True, r.returncode == 0


def classify_event(repo: str, base: str, p1: str, p2: str, path: str) -> str:
    base_exists = blob_exists(repo, base, path)
    if not base_exists:
        return "added_both"
    base_txt = git_text(["git", "cat-file", "-p", f"{base}:{path}"], repo) or ""
    base_lines = base_txt.splitlines()
    changed_p1 = diff_changed_base_lines(repo, base, p1, path)
    changed_p2 = diff_changed_base_lines(repo, base, p2, path)
    sections_p1 = classify_sections(base_lines, changed_p1)
    sections_p2 = classify_sections(base_lines, changed_p2)
    fields_p1 = {s for s in sections_p1 if s != "body"}
    fields_p2 = {s for s in sections_p2 if s != "body"}
    if fields_p1 and fields_p2:
        if fields_p1 & fields_p2:
            return "same_field"
        return "different_fields"
    if fields_p1 or fields_p2:
        return "different_fields"  # one side touched a field, other only body
    return "body_only"


def decision_files(repo: str, dirs: list[str]) -> list[str]:
    out = git_lines(
        ["git", "log", "--name-only", "--pretty=format:", "HEAD", "--", *dirs], repo
    )
    return sorted({l for l in out if l.strip()})


def near_miss_pairs(repo_cfg: dict, window_days: int = 14) -> list[dict]:
    """Secondary, weaker signal than the merge-based measurement above: same
    decision file touched by two DIFFERENT authors within `window_days` of
    each other, in chronological order. This catches same-file churn that
    never produced a real git merge conflict (e.g. because the project
    squash-merges PRs, so there is no 2-parent merge commit to inspect) but
    does NOT by itself prove the edits were made on overlapping branches —
    most such pairs turn out to be sequential PR-review fixups on the same
    PR. Reported as context, not as evidence of concurrent editing."""
    repo = repo_cfg["path"]
    name = repo_cfg["name"]
    dirs = repo_cfg["dirs"]
    pairs: list[dict] = []
    for f in decision_files(repo, dirs):
        log = "\n".join(git_lines(["git", "log", "--follow", "--pretty=%H|%ae|%aI", "HEAD", "--", f], repo))
        entries = [l.split("|") for l in log.splitlines() if l.strip()]
        entries = list(reversed(entries))  # chronological
        for i in range(len(entries) - 1):
            h1, a1, d1 = entries[i]
            h2, a2, d2 = entries[i + 1]
            try:
                import datetime as _dt

                t1 = _dt.datetime.fromisoformat(d1)
                t2 = _dt.datetime.fromisoformat(d2)
            except Exception:
                continue
            gap = (t2 - t1).total_seconds() / 86400
            if a1 != a2 and gap <= window_days:
                # Linearity check (previously only asserted in prose): is
                # commit_a a direct ancestor of commit_b? `git merge-base
                # --is-ancestor A B` exits 0 iff A is an ancestor of B, i.e.
                # B's line of history already contains A — a strictly
                # sequential edit, not a concurrent branch. exit 1 means NOT
                # an ancestor (true overlap candidate); any other exit code
                # (e.g. 128, missing commit) is recorded as "error" rather
                # than silently counted as linear.
                anc = run(
                    ["git", "merge-base", "--is-ancestor", h1, h2], repo, check=False
                )
                if anc.returncode == 0:
                    linear = "true"
                elif anc.returncode == 1:
                    linear = "false"
                else:
                    linear = "error"
                pairs.append(
                    {
                        "repo": name,
                        "file": f,
                        "commit_a": h1,
                        "author_a": a1,
                        "date_a": d1,
                        "commit_b": h2,
                        "author_b": a2,
                        "date_b": d2,
                        "gap_days": round(gap, 2),
                        "linear": linear,
                    }
                )
    return pairs


def mine_repo(repo_cfg: dict, tmpdir: Path) -> list[dict]:
    repo = repo_cfg["path"]
    name = repo_cfg["name"]
    dirs = repo_cfg["dirs"]
    events: list[dict] = []
    merges = merge_commits_touching(repo, dirs)
    for m in merges:
        parents = parents_of(repo, m)
        if len(parents) != 2:
            continue
        p1, p2 = parents
        base = merge_base(repo, p1, p2)
        if not base:
            continue
        files_p1 = changed_files(repo, base, p1, dirs)
        files_p2 = changed_files(repo, base, p2, dirs)
        common = files_p1 & files_p2
        for f in sorted(common):
            cls = classify_event(repo, base, p1, p2, f)
            ran_ok, clean = merge_file_clean(repo, base, p1, p2, f, tmpdir)
            events.append(
                {
                    "repo": name,
                    "merge": m,
                    "file": f,
                    "base": base,
                    "p1": p1,
                    "p2": p2,
                    "classification": cls,
                    "merge_file_ran": ran_ok,
                    "merge_file_clean": clean,
                }
            )
    return events


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--repos", required=True, help="path to repos.json")
    ap.add_argument("--out-dir", required=True)
    args = ap.parse_args()

    repos_cfg = json.loads(Path(args.repos).read_text())
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    all_events: list[dict] = []
    all_near_misses: list[dict] = []
    with tempfile.TemporaryDirectory() as td:
        tmpdir = Path(td)
        for repo_cfg in repos_cfg:
            print(f"-- mining {repo_cfg['name']} --", file=sys.stderr)
            events = mine_repo(repo_cfg, tmpdir)
            all_events.extend(events)
            near = near_miss_pairs(repo_cfg)
            all_near_misses.extend(near)
            print(
                f"   {len(events)} true concurrent-edit (both merge parents touched same file) event(s), "
                f"{len(near)} near-miss (different authors, same file, <=14d apart, sequential) pair(s)",
                file=sys.stderr,
            )

    csv_path = out_dir / "adr_merge_events.csv"
    with csv_path.open("w", newline="") as fh:
        fieldnames = [
            "repo",
            "merge",
            "file",
            "base",
            "p1",
            "p2",
            "classification",
            "merge_file_ran",
            "merge_file_clean",
        ]
        w = csv.DictWriter(fh, fieldnames=fieldnames)
        w.writeheader()
        for ev in all_events:
            w.writerow(ev)

    near_csv_path = out_dir / "near_miss_pairs.csv"
    with near_csv_path.open("w", newline="") as fh:
        near_fields = ["repo", "file", "commit_a", "author_a", "date_a", "commit_b", "author_b", "date_b", "gap_days", "linear"]
        w2 = csv.DictWriter(fh, fieldnames=near_fields)
        w2.writeheader()
        for p in all_near_misses:
            w2.writerow(p)

    # Per-repo + overall summary
    summary: dict = {"per_repo": {}, "overall": {}}
    for repo_cfg in repos_cfg:
        name = repo_cfg["name"]
        repo_events = [e for e in all_events if e["repo"] == name]
        repo_near = [p for p in all_near_misses if p["repo"] == name]
        n_files = len(decision_files(repo_cfg["path"], repo_cfg["dirs"]))
        summary["per_repo"][name] = {
            "decision_files": n_files,
            "merges_touching_dir": len(merge_commits_touching(repo_cfg["path"], repo_cfg["dirs"])),
            "concurrent_edit_events": len(repo_events),
            "same_field": sum(1 for e in repo_events if e["classification"] == "same_field"),
            "different_fields": sum(1 for e in repo_events if e["classification"] == "different_fields"),
            "body_only": sum(1 for e in repo_events if e["classification"] == "body_only"),
            "added_both": sum(1 for e in repo_events if e["classification"] == "added_both"),
            "merge_file_clean": sum(1 for e in repo_events if e["merge_file_clean"]),
            "merge_file_conflict": sum(
                1 for e in repo_events if e["merge_file_ran"] and not e["merge_file_clean"]
            ),
            "merge_file_not_applicable": sum(1 for e in repo_events if not e["merge_file_ran"]),
            "near_miss_pairs_le14d": len(repo_near),
        }
    summary["overall"] = {
        "decision_files": sum(v["decision_files"] for v in summary["per_repo"].values()),
        "merges_touching_dir": sum(v["merges_touching_dir"] for v in summary["per_repo"].values()),
        "concurrent_edit_events": len(all_events),
        "same_field": sum(1 for e in all_events if e["classification"] == "same_field"),
        "different_fields": sum(1 for e in all_events if e["classification"] == "different_fields"),
        "body_only": sum(1 for e in all_events if e["classification"] == "body_only"),
        "added_both": sum(1 for e in all_events if e["classification"] == "added_both"),
        "merge_file_clean": sum(1 for e in all_events if e["merge_file_clean"]),
        "merge_file_conflict": sum(
            1 for e in all_events if e["merge_file_ran"] and not e["merge_file_clean"]
        ),
        "merge_file_not_applicable": sum(1 for e in all_events if not e["merge_file_ran"]),
        "near_miss_pairs_le14d": len(all_near_misses),
    }
    (out_dir / "summary.json").write_text(json.dumps(summary, indent=2))
    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
