#!/usr/bin/env python3
"""Phase C (v2): run SZZ with a per-commit watchdog timeout (signal.alarm) and
incremental checkpointing, so pathologically slow blame targets (huge files with
long history) are skipped+logged rather than hanging the whole run."""
import json, sys, signal, os

REPOS = {
    "LedgerSMB": "/Users/a1/.hermes/cache/scratch/szz/LedgerSMB",
    "cli": "/Users/a1/.hermes/cache/scratch/szz/cli",
    "tapir": "/Users/a1/.hermes/cache/scratch/szz/tapir",
}
PER_COMMIT_TIMEOUT_S = 25


class TimeoutErr(Exception):
    pass


def _alarm(signum, frame):
    raise TimeoutErr()


def phase_c(name):
    from pydriller import Git
    out_dir = "/Users/a1/.hermes/cache/scratch/szz"
    ckpt_path = f"{out_dir}/phaseC_{name}_checkpoint.json"

    with open(f"{out_dir}/phaseA_{name}_rows.json") as f:
        data = json.load(f)
    order, commit_rows = data["order"], data["rows"]
    with open(f"{out_dir}/phaseB_{name}_validated.json") as f:
        validated = json.load(f)

    done = {}
    skipped_timeout = []
    if os.path.exists(ckpt_path):
        with open(ckpt_path) as f:
            ckpt = json.load(f)
        done = ckpt.get("done", {})
        skipped_timeout = ckpt.get("skipped_timeout", [])
        print(f"[{name}] resuming from checkpoint: {len(done)} done, {len(skipped_timeout)} skipped", flush=True)

    g = Git(REPOS[name])
    signal.signal(signal.SIGALRM, _alarm)

    remaining = [h for h in validated if h not in done and h not in skipped_timeout]
    for i, h in enumerate(remaining):
        signal.alarm(PER_COMMIT_TIMEOUT_S)
        try:
            c = g.get_commit(h)
            inducing = g.get_commits_last_modified_lines(c)
            hashes = set()
            for path, hs in inducing.items():
                hashes.update(hs)
            done[h] = sorted(hashes)
        except TimeoutErr:
            skipped_timeout.append(h)
            print(f"[{name}] TIMEOUT on {h}, skipped", flush=True)
        except Exception as e:
            skipped_timeout.append(h)
            print(f"[{name}] ERROR on {h}: {e}, skipped", flush=True)
        finally:
            signal.alarm(0)

        if (i + 1) % 10 == 0 or (i + 1) == len(remaining):
            with open(ckpt_path, "w") as f:
                json.dump({"done": done, "skipped_timeout": skipped_timeout}, f)
            print(f"[{name}] progress {i+1}/{len(remaining)} (total done={len(done)}, skipped={len(skipped_timeout)})",
                  flush=True)

    caught = set()
    for h, hashes in done.items():
        caught.update(hashes)

    in_window_caught = [h for h in caught if h in commit_rows]
    out_of_window_caught = [h for h in caught if h not in commit_rows]
    print(f"[{name}] caught={len(caught)} in_window={len(in_window_caught)} "
          f"out_of_window={len(out_of_window_caught)} skipped_timeout={len(skipped_timeout)}", flush=True)
    for h in in_window_caught:
        commit_rows[h]["bug_inducing"] = True

    with open(f"{out_dir}/raw_{name}.jsonl", "w") as f:
        for h in order:
            if h in commit_rows:
                f.write(json.dumps(commit_rows[h]) + "\n")

    n_bug_inducing = sum(1 for r in commit_rows.values() if r["bug_inducing"])
    n_why = sum(1 for r in commit_rows.values() if r["has_why"])
    n_why_and_induce = sum(1 for r in commit_rows.values() if r["has_why"] and r["bug_inducing"])
    summary = {"rows": len(commit_rows), "has_why": n_why, "bug_inducing": n_bug_inducing,
               "why_and_inducing": n_why_and_induce, "validated_fixes": len(validated),
               "szz_timeouts_or_errors": len(skipped_timeout), "caught_distinct": len(caught),
               "caught_in_window": len(in_window_caught), "caught_out_of_window": len(out_of_window_caught)}
    print(f"[{name}] {json.dumps(summary)}", flush=True)
    with open(f"{out_dir}/phaseC_{name}_summary.json", "w") as f:
        json.dump(summary, f, indent=2)
    print(f"[{name}] phase C done", flush=True)


if __name__ == "__main__":
    phase_c(sys.argv[1])
