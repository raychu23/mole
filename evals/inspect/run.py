#!/usr/bin/env python3
"""Run the T17 eval and write its report.

Dry run (free: Inspect's mock model, no login, no API key):
  evals/inspect/.venv/bin/python evals/inspect/run.py --model mockllm/model --cases B3-review --epochs 1 --label "dry run"
Full A/B (PAID; only after Raymond's go, n from cases/key.json full_run):
  evals/inspect/.venv/bin/python evals/inspect/run.py --model anthropic/<model> --epochs 15 --label "full run" \
      --paid-run-approved "<date + Raymond's words>"
Failure-case probe (Claude Code pointed at a closed port instead of the bridge -> clear error, no score):
  ... run.py --model mockllm/model --cases B3-review --arms none --break-model-route --label "failure probe"

Exit codes: 0 report written; 2 refused (spend guard); 3 incomplete run (errored samples: no rates, no partial score);
4 preflight failed (the model cannot be reached from the host).
"""
from __future__ import annotations

import argparse
import asyncio
import json
import sys
from datetime import datetime
from pathlib import Path

EVAL_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(EVAL_DIR))

from mole_eval.report import write_report  # noqa: E402
from mole_eval.scoring import IncompleteRun, summarize  # noqa: E402

REPO = EVAL_DIR.parents[1]
MOCK_PRESENTED = "claude-sonnet-4-5"
DEFAULT_OUT = REPO / "tasks" / "T17-agent-eval-inspect" / "4 log"


def records_from_log(log) -> list[dict]:
    recs = []
    for s in log.samples or []:
        sc = next(iter((s.scores or {}).values()), None)
        usage = list((s.model_usage or {}).values())
        inp = sum(u.input_tokens + (u.input_tokens_cache_read or 0) + (u.input_tokens_cache_write or 0) for u in usage)
        out = sum(u.output_tokens for u in usage)
        recs.append({
            "id": s.id, "arm": s.metadata.get("arm"), "case": s.metadata.get("case"), "epoch": s.epoch,
            "label": sc.answer if sc is not None else None,
            "error": (s.error.message if s.error else None),
            "input_tokens": inp, "output_tokens": out, "total_tokens": sum(u.total_tokens for u in usage),
            "seconds": float(s.total_time or 0.0), "working_seconds": float(s.working_time or 0.0),
            "model_answers": (sc.metadata or {}).get("model_answers") if sc is not None else None,
        })
    return recs


async def preflight(model_name: str) -> None:
    from inspect_ai.model import get_model

    out = await get_model(model_name).generate("Reply with the word OK.")
    if out.error or not out.completion:
        raise RuntimeError(out.error or "empty answer")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True)
    ap.add_argument("--cases", default=None, help="comma list of case ids (default: all in the key)")
    ap.add_argument("--arms", default="none,mole")
    ap.add_argument("--epochs", type=int, default=1)
    ap.add_argument("--label", required=True)
    ap.add_argument("--out", default=str(DEFAULT_OUT))
    ap.add_argument("--log-dir", default=str(EVAL_DIR / "logs"))
    ap.add_argument("--max-samples", type=int, default=2)
    ap.add_argument("--break-model-route", action="store_true")
    ap.add_argument("--paid-run-approved", default=None, help="required for any non-mock model: when + Raymond's words")
    a = ap.parse_args()

    if not a.model.startswith("mockllm/") and not a.paid_run_approved:
        print(f"refused: {a.model} is a paid model; the full A/B waits for Raymond's go (pass --paid-run-approved)", file=sys.stderr)
        return 2
    try:
        asyncio.run(preflight(a.model))
    except Exception as e:  # noqa: BLE001
        print(f"preflight: the model {a.model} cannot be reached from the host: {e}", file=sys.stderr)
        return 4

    from inspect_ai import eval as inspect_eval

    from mole_eval.task import mole_regression

    # Claude Code rejects a non-Anthropic model id ("unrecognized_model"): the mock presents itself as a Claude id (cosmetic)
    model_config = MOCK_PRESENTED if a.model.startswith("mockllm/") else None
    task = mole_regression(cases=a.cases, arms=a.arms, break_model_route=a.break_model_route, model_config=model_config)
    [log] = inspect_eval(task, model=a.model, epochs=a.epochs, log_dir=a.log_dir, max_samples=a.max_samples,
                         fail_on_error=False, display="plain")
    recs = records_from_log(log)
    extra = {"inspect_log": log.location, "status": log.status, "epochs": a.epochs, "cases": a.cases, "arms": a.arms,
             "break_model_route": a.break_model_route, "model_config": model_config, "paid_run_approved": a.paid_run_approved}
    try:
        summary = summarize(recs)
    except IncompleteRun as e:
        print(f"INCOMPLETE RUN, no rates reported: {e}", file=sys.stderr)
        for r in recs:
            if r["error"]:
                print(f"  {r['id']} (epoch {r['epoch']}): {r['error'][:600]}", file=sys.stderr)
        out = Path(a.out)
        out.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now().astimezone().strftime("%Y-%m-%dT%H%M")
        p = out / f"{stamp} {a.label.replace(' ', '-')}-incomplete.json"
        p.write_text(json.dumps({"label": a.label, "model": a.model, "incomplete": str(e), "records": recs, **extra}, indent=1) + "\n")
        print(f"wrote {p}")
        return 3
    paths = write_report(summary, recs, a.out, a.label, model=a.model, extra=extra)
    print(json.dumps(summary, indent=1))
    print(f"wrote {paths['json']}\nwrote {paths['md']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
