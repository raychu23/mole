#!/usr/bin/env python3
"""Load the build loop's evidence (tasks/*/4 log/runs.jsonl) into a local MLflow tracking store (T16).

One MLflow run per runs.jsonl line, in experiment "mole-build-loop":
  params   task, commit, cmd, exit
  metrics  numbers parsed from the line's "metrics" (labelled numbers in summary strings, see parse_metric)
  tags     mole.line_hash (sha256 of task + line number + raw line: the idempotency key), mole.source, mole.time,
           mole.raw.<metric> (the original summary string), mole.detail, mole.check
Re-running skips every line whose hash is already in the store, so nothing is added twice.
runs.jsonl stays the record; MLflow is only a viewer (`mlflow ui --backend-store-uri <store>`).

No network: MLflow's usage telemetry is switched off before import and only a local file: store is used.
usage: load_runs.py [--repo DIR] [--tracking-uri file:PATH] [--json]
       load_runs.py --parse-metrics CASES.json   (prints the parsed metrics of [{metric, raw}, ...] as JSON)
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
from datetime import datetime
from pathlib import Path

EXPERIMENT = "mole-build-loop"
DEFAULT_STORE = ".mole/local/mlruns"  # .mole/local/ is gitignored

WORD = r"[A-Za-z][A-Za-z0-9_/\-]*"
# a label (one or more words) followed by a number with an optional unit (%, /N, ms)
LABELLED = re.compile(rf"(?P<label>{WORD}(?: {WORD})*) (?P<num>-?\d+(?:\.\d+)?)(?P<unit>%|/\d+|\s?ms\b)?")
AFTER = re.compile(rf" ({WORD})")
PREPOSITIONS = {"over", "of", "across", "in", "for"}
FRACTION = re.compile(r"^\s*(-?\d+(?:\.\d+)?)\s*/\s*(\d+)\s*$")


def _name(label: str) -> str:
    return re.sub(r"[^A-Za-z0-9_.\-]", "_", label.strip().replace(" ", "_").replace("/", "_"))


# MLflow tag/param/metric names may only contain alphanumerics, "_", "-", ".", space, ":", "/"
# (mlflow.utils.validation.validate_param_and_metric_name) and must normalize to themselves under
# posixpath.normpath (path_not_unique: no "..", no leading "/", no doubled "/"). runs.jsonl's "metrics"
# keys are sometimes a free-text evidence label straight from a task write-up (e.g.
# "M-B dev B3 arm, post-review-fix"), not a slug, so they can carry commas, parens, etc. that MLflow's
# tag-name validator rejects outright (mlflow.exceptions.MlflowException: Invalid value ... for
# parameter 'key'), crashing the whole load before any run is created. Sanitize only the MLflow tag
# NAME built from that text; the raw text itself is untouched in runs.jsonl and in the tag's VALUE
# (mole.raw.<name>'s value has no charset restriction, only a length cap), so no evidence is altered.
_TAG_NAME_BAD = re.compile(r"[^A-Za-z0-9_.\- :/]")


def _tag_name(raw: str) -> str:
    s = _TAG_NAME_BAD.sub("_", raw)
    s = re.sub(r"/{2,}", "/", s)  # collapse doubled "/" and "." runs so normpath(s) == s (path_not_unique)
    s = re.sub(r"\.{2,}", ".", s)
    return s.lstrip("/")


def _num(s: str) -> float | int:
    f = float(s)
    return int(f) if f.is_integer() else f


def parse_metric(key: str, raw) -> dict[str, float | int]:
    """Numbers from one runs.jsonl metric value.
    number -> {key: n}; bool -> {key: 1|0}; "a/b" -> {key: a, key.total: b}; "pass…"/"fail…" -> {key: 1|0};
    otherwise every "label N[%|/T| ms]" -> {key.label: N} (+ key.label.total for /T, label_ms for ms);
    "over N things" names the number after the noun: {key.things: N}."""
    if isinstance(raw, bool):
        return {key: 1 if raw else 0}
    if isinstance(raw, (int, float)):
        return {key: raw}
    if not isinstance(raw, str):
        return {}
    s = raw.strip()
    m = FRACTION.match(s)
    if m:
        return {key: _num(m.group(1)), f"{key}.total": _num(m.group(2))}
    low = s.lower()
    if low.startswith("pass"):
        return {key: 1}
    if low.startswith("fail"):
        return {key: 0}
    out: dict[str, float | int] = {}
    for m in LABELLED.finditer(s):
        words = m.group("label").split(" ")
        unit = (m.group("unit") or "").strip()
        nxt = AFTER.match(s, m.end())
        after = nxt.group(1) if nxt else ""
        if words[-1].lower() in PREPOSITIONS and after:
            label = after if len(words) == 1 else " ".join(words[:-1] + [after])
        else:
            label = " ".join(words)
        name = f"{key}.{_name(label)}"
        if unit == "ms":
            name += "_ms"
        out[name] = _num(m.group("num"))
        if unit.startswith("/"):
            out[f"{name}.total"] = _num(unit[1:])
    return out


def parse_metrics(metrics: dict) -> dict[str, float | int]:
    out: dict[str, float | int] = {}
    for k, v in (metrics or {}).items():
        out.update(parse_metric(_name(str(k)), v))
    return out


def read_lines(repo: Path):
    """(task, line number, raw line) for every non-empty line of tasks/*/4 log/runs.jsonl, in a stable order"""
    for f in sorted((repo / "tasks").glob("*/4 log/runs.jsonl")):
        task = f.parent.parent.name
        for n, line in enumerate(f.read_text(encoding="utf-8").splitlines(), 1):
            if line.strip():
                yield task, n, line, f.relative_to(repo).as_posix()


def line_hash(task: str, n: int, line: str) -> str:
    return hashlib.sha256(f"{task}\n{n}\n{line}".encode("utf-8")).hexdigest()


def _ms(time: str | None) -> int | None:
    if not time:
        return None
    try:
        return int(datetime.strptime(time, "%Y-%m-%dT%H:%M:%S%z").timestamp() * 1000)
    except ValueError:
        try:
            return int(datetime.fromisoformat(time).timestamp() * 1000)
        except ValueError:
            return None


def load(repo: Path, tracking_uri: str) -> dict:
    # no network: no usage telemetry, file store only (MLflow 3.x keeps the file store behind an opt-in)
    os.environ.setdefault("MLFLOW_DISABLE_TELEMETRY", "true")
    os.environ.setdefault("DO_NOT_TRACK", "true")
    os.environ.setdefault("MLFLOW_ALLOW_FILE_STORE", "true")
    os.environ.setdefault("MLFLOW_DISABLE_AGENT_HINT", "1")
    if not tracking_uri.startswith("file:"):
        raise SystemExit(f"load_runs.py: only a local file: store is allowed (got {tracking_uri})")
    from mlflow.entities import Metric, Param, RunTag
    from mlflow.tracking import MlflowClient

    client = MlflowClient(tracking_uri=tracking_uri)
    exp = client.get_experiment_by_name(EXPERIMENT)
    exp_id = exp.experiment_id if exp else client.create_experiment(EXPERIMENT, tags={"mole.source": "tasks/*/4 log/runs.jsonl"})
    have: set[str] = set()
    token = None
    while True:
        page = client.search_runs([exp_id], max_results=1000, page_token=token)
        have.update(r.data.tags.get("mole.line_hash", "") for r in page)
        token = page.token
        if not token:
            break

    lines = added = skipped = 0
    for task, n, line, src in read_lines(repo):
        lines += 1
        h = line_hash(task, n, line)
        if h in have:
            skipped += 1
            continue
        tags = {"mole.line_hash": h, "mole.task": task, "mole.source": f"{src}:{n}", "mlflow.runName": f"{task} #{n}"}
        params: dict[str, str] = {"task": task}
        metrics: dict[str, float | int] = {}
        try:
            d = json.loads(line)
            params.update(commit=str(d.get("commit", "")), cmd=str(d.get("cmd", ""))[:6000], exit=str(d.get("exit", "")))
            metrics = parse_metrics(d.get("metrics") or {})
            if isinstance(d.get("exit"), int):
                metrics["exit"] = d["exit"]
            for k, v in (d.get("metrics") or {}).items():
                tags[_tag_name(f"mole.raw.{k}")[:250]] = (v if isinstance(v, str) else json.dumps(v))[:5000]
            for k in ("time", "detail", "check"):
                if d.get(k) is not None:
                    tags[f"mole.{k}"] = str(d[k])[:5000]
            start = _ms(d.get("time"))
        except (json.JSONDecodeError, AttributeError) as e:
            params.update(commit="", cmd="", exit="")
            tags["mole.parse_error"] = str(e)[:500]
            start = None
        run = client.create_run(exp_id, start_time=start, tags=tags)
        ts = start or 0
        client.log_batch(
            run.info.run_id,
            metrics=[Metric(k, float(v), ts, 0) for k, v in sorted(metrics.items())],
            params=[Param(k, v) for k, v in params.items()],
            tags=[RunTag(k, v) for k, v in tags.items() if k == "mlflow.runName"],
        )
        client.set_terminated(run.info.run_id, status="FINISHED" if params.get("exit") == "0" else "FAILED", end_time=start)
        have.add(h)
        added += 1
    return {"lines": lines, "added": added, "skipped": skipped, "experiment": EXPERIMENT, "experiment_id": exp_id, "tracking_uri": tracking_uri}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--repo", default=str(Path(__file__).resolve().parents[2]))
    ap.add_argument("--tracking-uri")
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--parse-metrics", metavar="CASES_JSON")
    a = ap.parse_args()
    if a.parse_metrics:
        cases = json.loads(Path(a.parse_metrics).read_text(encoding="utf-8"))
        print(json.dumps([parse_metric(c["metric"], c["raw"]) for c in cases]))
        return 0
    repo = Path(a.repo).resolve()
    uri = a.tracking_uri or (repo / DEFAULT_STORE).as_uri()
    r = load(repo, uri)
    if a.json:
        print(json.dumps(r))
    else:
        print(f"mole-build-loop: {r['lines']} runs.jsonl lines, {r['added']} runs added, {r['skipped']} already loaded ({uri})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
