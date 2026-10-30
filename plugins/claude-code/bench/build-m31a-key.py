#!/usr/bin/env python3
"""Hand-method key builder for M31a (independent of the hook/MCP code under test).
Parses .mole/decisions/*.md front matter with plain regex (not @mole/decisions), and
git diff --name-only on real 10-29 ledger branches, to compute which decisions govern
each session's changed files by literal scope-file match."""
import subprocess, re, glob, json, sys

ROOT = "/Users/a1/Desktop/CS Code/Project/Mole"

def sh(args):
    return subprocess.run(args, cwd=ROOT, capture_output=True, text=True).stdout

# 1. parse scope from each decision record by hand
decisions = {}
for f in sorted(glob.glob(f"{ROOT}/.mole/decisions/*.md")):
    text = open(f).read()
    m = re.search(r"^id:\s*'?(\w+)'?", text, re.M)
    did = m.group(1) if m else None
    t = re.search(r"^title:\s*(.+)$", text, re.M)
    title = t.group(1).strip() if t else did
    s = re.search(r"^status:\s*(\S+)", text, re.M)
    status = s.group(1) if s else "unknown"
    ap = re.search(r"^approver:\s*(\S+)", text, re.M)
    approver = ap.group(1) if ap else None
    scope_block = re.search(r"^scope:\n((?:\s+-.*\n)+)", text, re.M)
    files = set()
    if scope_block:
        for line in scope_block.group(1).splitlines():
            item = line.strip().lstrip('- ').strip()
            path = item.split('#')[0]
            files.add(path)
    has_rules = bool(re.search(r"^rules:\n", text, re.M))
    if did:
        decisions[did] = {"title": title, "status": status, "approver": approver, "files": files, "has_rules": has_rules, "file": f.split('/.mole/')[-1].replace(ROOT, '').lstrip('/')}

print("decisions parsed:", {k: sorted(v["files"]) for k, v in decisions.items()}, file=sys.stderr)

# 2. candidate 10-29 ledger task branches with recorded base shas (from each task's 0 start.md, git-committed)
candidates = {
    "T18-agent-states": ("ledger/t18-agent-states", "767f129"),
    "T21-parallel-agent-collisions": ("ledger/t21-parallel-agent-collisions", "17d9862"),
    "T27-decisions-as-rules": ("ledger/t27-decisions-as-rules", "fb240ab"),
    "T28-runtime-flows-from-tests": ("ledger/t28-runtime-flows-from-tests", "5b447f7"),
    "T29-decision-graph-core": ("ledger/t29-decision-graph-core", "491dd7e"),
    "T16-traces-runs-ci": ("ledger/t16-traces-runs-ci", "c8e53f7"),
    "T20-langgraph-checkpoint-export": ("ledger/t20-langgraph-checkpoint-export", "24cf82c"),
    "T22-hand-back-test-selection": ("ledger/t22-hand-back-test-selection", "70a2989"),
    "T24-agent-claim-check": ("ledger/t24-agent-claim-check", "80e2ca0"),
    "T19-rename-proof-anchors": ("ledger/t19-rename-proof-anchors", "9cc074c"),
    "T30-annotated-file-tree": ("ledger/t30-annotated-file-tree", "fb240ab"),
    "T32-team-pr-check": ("ledger/t32-team-pr-check", "85af7ab"),
}

all_files = set()
for v in decisions.values():
    all_files |= v["files"]

out = {}
for task, (branch, base) in candidates.items():
    files = sh(["git", "diff", "--name-only", base, branch]).splitlines()
    files = [f for f in files if f]
    governs = sorted({did for did, v in decisions.items() if v["files"] & set(files)})
    out[task] = {"branch": branch, "base": base, "files_touched": len(files), "governing_decisions": governs}

for task, v in out.items():
    print(task, v["governing_decisions"], f"({v['files_touched']} files)")

json.dump(out, open("/Users/a1/.hermes/cache/scratch/m31a_candidates.json", "w"), indent=2)
json.dump({k: {"files": sorted(v["files"]), "title": v["title"], "status": v["status"], "approver": v["approver"], "has_rules": v["has_rules"], "file": v["file"]} for k, v in decisions.items()}, open("/Users/a1/.hermes/cache/scratch/m31a_decisions.json", "w"), indent=2)
