#!/usr/bin/env python3
"""T110 (Q4) reviewer (oracle-given decision) + RAG (reads all live ADRs, no oracle) arms. Same prompt
shapes as v3's run_arms_v3.py, run once on the 7 frozen real-history cases. Resumable."""
import json, subprocess, time, re
from pathlib import Path

TASK = Path(__file__).parent.parent
CASES = json.loads((TASK / "cases_h2.json").read_text())
RECORDS = TASK / "run" / "records_backstage" / ".mole" / "decisions"
ADR_TEXT = {
    "adr003": Path("/Users/a1/.hermes/cache/scratch/t110/adrs/adr003.md").read_text(),
    "adr004": Path("/Users/a1/.hermes/cache/scratch/t110/adrs/adr004.md").read_text(),
}
ALL_ADRS = []
for p in sorted(RECORDS.glob("adr*.md")):
    aid = p.stem
    text = ADR_TEXT.get(aid, p.read_text())
    ALL_ADRS.append((aid, text))

REVIEWER_PROMPT = """You are reviewing a code change against one specific team architecture decision (an ADR).

--- THE DECISION (full text) ---
{adr_text}

--- THE CODE CHANGE (unified diff) ---
{diff}

Does this change VIOLATE the decision above? Answer with exactly one line first:
VERDICT: VIOLATES or VERDICT: COMPLIANT
Then one short sentence of reasoning."""

RAG_PROMPT = """You are reviewing a code change against your team's architecture decisions (ADRs). You are
NOT told which ADR applies -- find the relevant one yourself from the list below, or say none apply.

--- ALL CURRENT ADRs (full text) ---
{all_adrs}

--- THE CODE CHANGE (unified diff) ---
{diff}

First say which ADR (if any) is relevant: RELEVANT_ADR: <id or NONE>
Then say: VERDICT: VIOLATES or VERDICT: COMPLIANT (COMPLIANT if no ADR applies)
Then one short sentence of reasoning."""


def call_hermes(prompt, usage_file, retries=2):
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
            print(f"  retry {attempt+1}/{retries} after error: {e}")
    return f"ERROR: {last_exc}", {}, (time.time() - t0) * 1000


def parse_verdict(text):
    m = re.search(r"VERDICT:\s*(VIOLATES|COMPLIANT)", text, re.I)
    return None if not m else m.group(1).upper() == "VIOLATES"


def load_out(name):
    p = Path(__file__).parent / name
    return json.loads(p.read_text()) if p.exists() else []


def save_row(name, row):
    p = Path(__file__).parent / name
    rows = [r for r in load_out(name) if r["id"] != row["id"]]
    rows.append(row)
    p.write_text(json.dumps(rows, indent=1))


def run_reviewer():
    name = "arm_reviewer_h2.json"
    done = {r["id"] for r in load_out(name)}
    for c in CASES:
        if c["id"] in done:
            continue
        prompt = REVIEWER_PROMPT.format(adr_text=c["decision_text"], diff=c["diff"])
        uf = Path(__file__).parent / f"usage_reviewer_{c['id']}.json"
        text, usage, ms = call_hermes(prompt, uf)
        pred = parse_verdict(text)
        uf.unlink(missing_ok=True)
        row = {"id": c["id"], "adr_id": c["adr_id"], "label_final": c["label_final"],
               "predictedViolate": bool(pred), "response": text, "usage": usage, "wallMs": ms}
        save_row(name, row)
        print("reviewer", c["id"], "pred=", pred, "label=", c["label_final"], f"{ms:.0f}ms")


def run_rag():
    name = "arm_rag_h2.json"
    done = {r["id"] for r in load_out(name)}
    for c in CASES:
        if c["id"] in done:
            continue
        all_adrs = "\n\n".join(f"=== {aid} ===\n{txt}" for aid, txt in ALL_ADRS)
        prompt = RAG_PROMPT.format(all_adrs=all_adrs, diff=c["diff"])
        uf = Path(__file__).parent / f"usage_rag_{c['id']}.json"
        text, usage, ms = call_hermes(prompt, uf)
        pred = parse_verdict(text)
        m = re.search(r"RELEVANT_ADR:\s*(\S+)", text, re.I)
        picked = m.group(1).rstrip(".,") if m else None
        uf.unlink(missing_ok=True)
        row = {"id": c["id"], "adr_id": c["adr_id"], "label_final": c["label_final"],
               "predictedViolate": bool(pred), "picked_adr": picked, "response": text,
               "usage": usage, "wallMs": ms}
        save_row(name, row)
        print("rag", c["id"], "pred=", pred, "picked=", picked, "label=", c["label_final"], f"{ms:.0f}ms")


if __name__ == "__main__":
    run_reviewer()
    run_rag()
