#!/usr/bin/env python3
"""Phase B: validate bug-fix candidates against GitHub issue state. Network only, no git subprocess."""
import json, subprocess, sys

REPO_FULL = {"LedgerSMB": "ledgersmb/LedgerSMB", "cli": "cloudfoundry/cli", "tapir": "softwaremill/tapir"}


def validate_issue(full, issue_no, cache):
    key = (full, issue_no)
    if key in cache:
        return cache[key]
    try:
        r = subprocess.run(["gh", "api", f"repos/{full}/issues/{issue_no}"],
                            capture_output=True, text=True, timeout=30)
        if r.returncode != 0:
            cache[key] = (False, "lookup_failed")
            return cache[key]
        data = json.loads(r.stdout)
        if "pull_request" in data:
            cache[key] = (False, "is_pr")
            return cache[key]
        labels = [l["name"].lower() for l in data.get("labels", [])]
        is_closed = data.get("state") == "closed"
        is_feature = any(l in ("enhancement", "feature", "feature request") for l in labels)
        ok = is_closed and not is_feature
        cache[key] = (ok, "ok" if ok else f"state={data.get('state')} labels={labels}")
    except Exception as e:
        cache[key] = (False, str(e))
    return cache[key]


def phase_b(name):
    out_dir = "/Users/a1/.hermes/cache/scratch/szz"
    with open(f"{out_dir}/phaseA_{name}_bugfix_candidates.json") as f:
        candidates = json.load(f)
    full = REPO_FULL[name]
    cache = {}
    validated = []
    skipped = 0
    for i, (h, issue_no) in enumerate(candidates):
        ok, reason = validate_issue(full, issue_no, cache)
        if ok:
            validated.append(h)
        else:
            skipped += 1
        if (i + 1) % 25 == 0:
            print(f"[{name}] validated {i+1}/{len(candidates)}", flush=True)
    print(f"[{name}] {len(validated)} validated bug-fixing commits, {skipped} dropped", flush=True)
    with open(f"{out_dir}/phaseB_{name}_validated.json", "w") as f:
        json.dump(validated, f)
    print(f"[{name}] phase B done", flush=True)


if __name__ == "__main__":
    phase_b(sys.argv[1])
