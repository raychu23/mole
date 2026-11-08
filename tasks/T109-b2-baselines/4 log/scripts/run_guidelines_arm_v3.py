#!/usr/bin/env python3
"""M2 v3 baseline (b): "reviewer + team guidelines" arm (CodeRabbit-style). T109-b2-baselines / Q2.

Distinct from v3's existing "RAG (reads all decisions)" arm (run/run_arms_v3.py run_rag): that arm's
prompt frames the ADRs as a list to search for relevance ("find the relevant one yourself... or say none
apply"). This arm instead frames them as standing TEAM GUIDELINES the reviewer must check the diff against
-- CodeRabbit's actual mechanism (docs.coderabbit.ai/knowledge-base/code-guidelines, fetched 2026-11-07:
"CodeRabbit provides two path controls... Code guidelines: existing standards documents... CodeRabbit can
import them and use those existing rules in its code reviews"; docs.coderabbit.ai/configuration/
path-instructions, same date: "Instructions let you tell CodeRabbit exactly what to focus on"). The
prompt below gives ALL of the repo's real decisions as guideline text (verbatim, no synthesis) and asks
for a structured review the way CodeRabbit returns PR comments, then this script parses for a violation
verdict -- same call shape (hermes CLI, claude-sonnet-5, --safe-mode) and same held-out 89 cases as v3's
other arms, so results are directly comparable (same scoring code, see score_baselines_v3.py).
"""
import json
import re
import subprocess
import time
from pathlib import Path

V3 = Path(__file__).parent.parent
RUN = Path(__file__).parent
CASES = json.loads((V3 / "cases_with_labels_v3.json").read_text())
HELDOUT = [c for c in CASES if c["split"] == "heldout"]

ALL_TEXT_BY_REPO = {}
_seen = set()
for c in CASES:
    if c["adr_id"] == "none":
        continue
    key = (c["repo"], c["adr_id"])
    if key in _seen:
        continue
    _seen.add(key)
    ALL_TEXT_BY_REPO.setdefault(c["repo"], []).append((c["adr_id"], c["decision_text"]))

GUIDELINES_PROMPT = """You are an automated PR reviewer (like CodeRabbit) configured with this team's
coding guidelines, imported verbatim from their decision records (ADRs). Guidelines apply across the whole
repo; check the code change against ALL of them, the way a CodeRabbit "Code Guidelines" import does.

--- TEAM GUIDELINES (verbatim decision records) ---
{all_adrs}

--- THE CODE CHANGE (unified diff) ---
{diff}

Write your review. Then, on the LAST line, output exactly one verdict line:
VERDICT: VIOLATES <adr_id>   (if the change breaks one of the guidelines above; name which one)
VERDICT: COMPLIANT           (if no guideline is broken)
"""


def call_hermes(prompt: str, usage_file: Path, retries: int = 2):
    t0 = time.time()
    last_exc = None
    for attempt in range(retries + 1):
        try:
            r = subprocess.run(
                ["hermes", "-z", prompt, "-m", "claude-sonnet-5", "--provider", "anthropic", "-t", "",
                 "--safe-mode", "--usage-file", str(usage_file)],
                capture_output=True, text=True, timeout=240,
            )
            ms = (time.time() - t0) * 1000
            usage = json.loads(usage_file.read_text()) if usage_file.exists() else {}
            return r.stdout.strip(), usage, ms
        except Exception as e:
            last_exc = e
            print(f"  retry {attempt + 1}/{retries} after error: {e}")
    ms = (time.time() - t0) * 1000
    return f"ERROR: {last_exc}", {}, ms


def parse_verdict(text: str):
    m = re.search(r"VERDICT:\s*(VIOLATES|COMPLIANT)", text, re.I)
    if not m:
        return None
    return m.group(1).upper() == "VIOLATES"


def load_out():
    p = RUN / "arm_guidelines_heldout_v3.json"
    return json.loads(p.read_text()) if p.exists() else []


def save_row(row):
    p = RUN / "arm_guidelines_heldout_v3.json"
    rows = load_out()
    rows = [r for r in rows if r["id"] != row["id"]]
    rows.append(row)
    p.write_text(json.dumps(rows, indent=1))


def main():
    done = {r["id"] for r in load_out()}
    for c in HELDOUT:
        if c["id"] in done:
            continue
        all_adrs = "\n\n".join(f"=== {aid} ===\n{txt}" for aid, txt in ALL_TEXT_BY_REPO[c["repo"]])
        prompt = GUIDELINES_PROMPT.format(all_adrs=all_adrs, diff=c["diff"])
        uf = RUN / f"usage_guidelines_{c['id']}.json"
        text, usage, ms = call_hermes(prompt, uf)
        pred = parse_verdict(text)
        m = re.search(r"VIOLATES\s+(\S+)", text, re.I)
        named = m.group(1).rstrip(".,") if m else None
        uf.unlink(missing_ok=True)
        row = {"id": c["id"], "repo": c["repo"], "adr_id": c["adr_id"], "label_final": c["label_final"],
               "split": "heldout", "predictedViolate": bool(pred), "named_adr": named, "response": text,
               "usage": usage, "wallMs": ms}
        save_row(row)
        print("guidelines", c["id"], "pred=", pred, "named=", named, "label=", c["label_final"],
              f"{ms:.0f}ms", usage.get("estimated_cost_usd"))


if __name__ == "__main__":
    main()
