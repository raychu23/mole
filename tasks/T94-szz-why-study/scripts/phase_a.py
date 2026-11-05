#!/usr/bin/env python3
"""Phase A: traverse commits (pydriller/git only, no network). One repo per invocation."""
import json, re, sys, subprocess, datetime, os

REPOS = {
    "LedgerSMB": "/Users/a1/.hermes/cache/scratch/szz/LedgerSMB",
    "cli": "/Users/a1/.hermes/cache/scratch/szz/cli",
    "tapir": "/Users/a1/.hermes/cache/scratch/szz/tapir",
}
SINCE = datetime.datetime(2023, 11, 4)
CENSOR_CUTOFF = datetime.datetime(2026, 8, 6)

ADR_PATH_RE = re.compile(r"^doc s?/adr/.*\.md$".replace(" ", ""), re.IGNORECASE)
ADR_REF_RE = re.compile(r"\bADR[-_ ]?0*(\d{1,4})\b", re.IGNORECASE)
RATIONALE_MARKER_RE = re.compile(r"^[\*\-\s]*(why|rationale|reason|motivation|context)\s*:", re.IGNORECASE | re.MULTILINE)
BREAKING_RE = re.compile(r"BREAKING CHANGE:\s*(.+)", re.IGNORECASE)
FIX_RE = re.compile(r"\b(fix(es|ed)?|close[sd]?|resolve[sd]?)\b[^\n]{0,80}?#(\d+)", re.IGNORECASE)
DOC_ONLY_EXT = {".md", ".rst", ".txt"}


def get_adr_numbers(repo_path):
    out = subprocess.run(["git", "ls-tree", "-r", "--name-only", "HEAD"], cwd=repo_path,
                          capture_output=True, text=True).stdout.splitlines()
    nums = set()
    for p in out:
        if ADR_PATH_RE.match(p):
            m = re.search(r"(\d{3,5})", os.path.basename(p))
            if m:
                nums.add(str(int(m.group(1))))
    return nums


def is_adr_path(path):
    return bool(path and ADR_PATH_RE.match(path))


def has_why(msg, touched_paths, adr_numbers):
    if any(is_adr_path(p) for p in touched_paths):
        return True, "adr_touch"
    for m in ADR_REF_RE.finditer(msg or ""):
        if str(int(m.group(1))) in adr_numbers:
            return True, "adr_ref"
    if RATIONALE_MARKER_RE.search(msg or ""):
        return True, "rationale_marker"
    bm = BREAKING_RE.search(msg or "")
    if bm and len(bm.group(1).split()) >= 5:
        return True, "breaking_change_prose"
    if msg:
        parts = msg.strip().split("\n\n", 1)
        if len(parts) == 2 and len(parts[1].split()) >= 20:
            return True, "summary_plus_body_paragraph"
    return False, None


def is_doc_only(modified_files):
    if not modified_files:
        return True
    for p in modified_files:
        if not p:
            continue
        _, ext = os.path.splitext(p)
        if ext.lower() not in DOC_ONLY_EXT and not is_adr_path(p):
            return False
    return True


def phase_a(name, path):
    from pydriller import Repository
    adr_numbers = get_adr_numbers(path)
    print(f"[{name}] ADR numbers at HEAD: total {len(adr_numbers)}", flush=True)

    author_commit_count = {}
    bugfix_commits = []
    commit_rows = {}
    order = []

    for commit in Repository(path, since=SINCE).traverse_commits():
        h = commit.hash
        order.append(h)
        author = commit.author.email or commit.author.name or "unknown"
        prior = author_commit_count.get(author, 0)
        author_commit_count[author] = prior + 1

        if commit.merge:
            continue
        touched = [m.new_path or m.old_path for m in commit.modified_files]
        if is_doc_only(touched):
            continue

        why, why_reason = has_why(commit.msg, touched, adr_numbers)
        lines_changed = sum((m.added_lines or 0) + (m.deleted_lines or 0) for m in commit.modified_files)
        row = {
            "repo": name, "hash": h, "date": commit.committer_date.isoformat(),
            "author": author, "author_prior_commits": prior,
            "msg_head": (commit.msg or "")[:140],
            "has_why": why, "why_reason": why_reason,
            "lines_changed": lines_changed, "files_changed": len(touched),
            "in_censor_window": commit.committer_date.replace(tzinfo=None) < CENSOR_CUTOFF,
            "bug_inducing": False,
        }
        commit_rows[h] = row

        fm = FIX_RE.search(commit.msg or "")
        if fm:
            bugfix_commits.append((h, fm.group(3)))

    print(f"[{name}] {len(commit_rows)} source-touching non-merge commits, "
          f"{len(bugfix_commits)} candidate fix-commits since {SINCE.date()}", flush=True)

    out_dir = "/Users/a1/.hermes/cache/scratch/szz"
    with open(f"{out_dir}/phaseA_{name}_rows.json", "w") as f:
        json.dump({"order": order, "rows": commit_rows}, f)
    with open(f"{out_dir}/phaseA_{name}_bugfix_candidates.json", "w") as f:
        json.dump(bugfix_commits, f)
    print(f"[{name}] phase A done", flush=True)


if __name__ == "__main__":
    name = sys.argv[1]
    phase_a(name, REPOS[name])
