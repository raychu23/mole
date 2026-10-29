"""The report file per run: per-arm rate + 95% interval + tokens + time, written as JSON and markdown."""
import json

from mole_eval.report import write_report
from mole_eval.scoring import summarize


def test_write_report(tmp_path):
    recs = [{"id": "B3-review-none", "arm": "none", "case": "B3-review", "epoch": 1, "label": "regressed", "error": None,
             "input_tokens": 900, "output_tokens": 100, "total_tokens": 1000, "seconds": 12.5},
            {"id": "B3-review-mole", "arm": "mole", "case": "B3-review", "epoch": 1, "label": "kept", "error": None,
             "input_tokens": 1900, "output_tokens": 100, "total_tokens": 2000, "seconds": 20.0}]
    paths = write_report(summarize(recs), recs, tmp_path, "dry-run test", model="mockllm/model")
    data = json.loads(paths["json"].read_text())
    assert data["model"] == "mockllm/model" and len(data["records"]) == 2
    md = paths["md"].read_text()
    for s in ("none", "mole", "95%", "tokens", "seconds", "mockllm/model"):
        assert s in md
