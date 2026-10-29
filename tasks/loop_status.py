#!/usr/bin/env python3
"""Check tasks/loop-goals.json and print where each loop goal stands.

Fails (exit 1) when the goals file is malformed: a missing key, a metric or
end goal pointing at an unknown id, a benchmark path that doesn't exist, a
graph task without a ledger folder, or a graph edge to an unknown task.
Status comes from each task's evidence log, tasks/<T>/4 log/runs.jsonl (one
JSON object per check run, loop rule R4); this script never edits it.
Usage: python3 tasks/loop_status.py [--check]
"""
import json, os, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GOALS = ROOT / "tasks" / "loop-goals.json"
NEED = ["what", "asked", "method", "loop_rules", "end_goals", "metrics", "benchmarks", "graph", "checkpoints", "never"]


def validate(d):
    errs = [f"missing key {k}" for k in NEED if k not in d]
    if errs:
        return errs
    mids = {m["id"] for m in d["metrics"]}
    tasks = {g["task"] for g in d["graph"]}
    for e in d["end_goals"]:
        errs += [f"{e['id']} measured by unknown metric {m}" for m in e["measured_by"] if m not in mids]
    for m in d["metrics"]:
        for k in ("name", "how", "target", "task"):
            if not m.get(k):
                errs.append(f"metric {m['id']} has no {k}")
        if not any(t.startswith(m.get("task", "?") + "-") for t in tasks):
            errs.append(f"metric {m['id']} names task {m.get('task')} that isn't in the graph")
    # context/ is untracked, so a ledger worktree has no copy: fall back to the main checkout
    main = Path(os.popen(f'git -C "{ROOT}" rev-parse --path-format=absolute --git-common-dir').read().strip() or ROOT / ".git").parent
    for b in d["benchmarks"]:
        p = Path(os.path.expanduser(b["path"]))
        if not (p if p.is_absolute() else ROOT / p).exists() and not (main / p).exists():
            errs.append(f"benchmark {b['id']} path missing: {b['path']}")
    for g in d["graph"]:
        if not (ROOT / "tasks" / g["task"] / "0 start.md").exists():
            errs.append(f"graph task {g['task']} has no ledger folder")
        errs += [f"{g['task']} needs unknown task {n}" for n in g["needs"] if n not in tasks]
    return errs


def last_run(task):
    f = ROOT / "tasks" / task / "4 log" / "runs.jsonl"
    if not f.exists():
        return None
    lines = [l for l in f.read_text().splitlines() if l.strip()]
    return json.loads(lines[-1]) if lines else None


def ledger_state(task):
    for line in (ROOT / "tasks" / task / "0 start.md").read_text().splitlines():
        if line.startswith("state:"):
            return line.split(":", 1)[1].strip()
    return "?"


def main():
    d = json.loads(GOALS.read_text())
    errs = validate(d)
    if errs:
        sys.exit("LOOP GOALS INVALID\n" + "\n".join(errs))
    if "--check" in sys.argv:
        print(f"ok: {len(d['metrics'])} metrics, {len(d['graph'])} tasks, {len(d['benchmarks'])} benchmarks")
        return
    for g in d["graph"]:
        run = last_run(g["task"])
        ms = [m for m in d["metrics"] if g["task"].startswith(m["task"] + "-")]
        print(f"{g['task']:38} {ledger_state(g['task']):11} needs {', '.join(g['needs']) or '-'}")
        for m in ms:
            got = (run or {}).get("metrics", {}).get(m["id"], "no run yet")
            print(f"    {m['id']} {m['name']}: {got}   target: {m['target']}")


if __name__ == "__main__":
    main()
