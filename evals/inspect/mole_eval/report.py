"""Per-run report: JSON (summary + every record) and a short markdown table, into tasks/T17-agent-eval-inspect/4 log/."""
from __future__ import annotations

import json
import re
from datetime import datetime
from pathlib import Path
from typing import Any


def _slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def write_report(summary: dict[str, Any], records: list[dict[str, Any]], out_dir: Path | str, label: str,
                 model: str, extra: dict[str, Any] | None = None) -> dict[str, Path]:
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().astimezone().strftime("%Y-%m-%dT%H%M")
    base = out / f"{stamp} {_slug(label)}"
    data = {"label": label, "model": model, "written": datetime.now().astimezone().isoformat(timespec="seconds"),
            "summary": summary, "records": records, **(extra or {})}
    jp = base.with_suffix(".json")
    jp.write_text(json.dumps(data, indent=1) + "\n")
    lines = [f"{label} ({model}, {data['written']})", ""]
    if model.startswith("mockllm/"):
        lines += ["mock model: plumbing check only (sandbox, Claude Code, bridge, both arms, scorer, report). The mock never edits code, "
                  "so these rates say nothing about Mole.", ""]
    lines += [
             "| arm | n | regressions | rate | 95% interval (Wilson) | kept / regressed / build_broken / guard_unrunnable | tokens per run | seconds per run |",
             "|---|---|---|---|---|---|---|---|"]
    for arm, a in summary["arms"].items():
        c = a["counts"]
        lines.append(f"| {arm} | {a['n']} | {a['regressions']} | {a['rate']:.2f} | {a['ci95'][0]:.2f} to {a['ci95'][1]:.2f} | "
                     f"{c['kept']} / {c['regressed']} / {c['build_broken']} / {c['guard_unrunnable']} | {a['tokens_mean']:.0f} | {a['seconds_mean']:.1f} |")
    d = summary.get("diff_none_minus_mole")
    if d:
        lines += ["", f"rate(none) - rate(mole) = {d['d']:.2f}, 95% interval {d['ci95'][0]:.2f} to {d['ci95'][1]:.2f} (Newcombe); "
                      f"Mole better shown: {'yes' if d['mole_better_shown'] else 'no'}"]
    lines += ["", "| sample | epoch | label | tokens | seconds |", "|---|---|---|---|---|"]
    lines += [f"| {r['id']} | {r['epoch']} | {r['label']} | {r['total_tokens']} | {r['seconds']:.1f} |" for r in records]
    mp = base.with_suffix(".md")
    mp.write_text("\n".join(lines) + "\n")
    return {"json": jp, "md": mp}
