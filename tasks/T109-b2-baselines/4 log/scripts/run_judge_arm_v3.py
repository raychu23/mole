#!/usr/bin/env python3
"""M2 v3 baseline (c): "two-sided judge" Mole variant (Wealthfront Iris pattern). T109-b2-baselines / Q2.

Prior art: Wealthfront eng blog, "Experiments with AI Code Review" (eng.wealthfront.com/2026/08/03/
experiments-with-ai-code-review/, fetched 2026-11-07): "When it finds a potential problem... This spawns
two sub-agents per problem: one model to argue that the concern is real and one model to argue it isn't
... Opus 4 is asked to weigh the evidence impartially, make a decision... Giving each model a distinct
role (plaintiff, defendant, judge) tends to produce better evidence and clearer judgement... greatly
decreased the number of false positives." (also summarized in agentrex.ai/blog/ai-code-review-argues-
against-itself/, same fetch date.) Wealthfront's version spawns 3 SEPARATE model calls (prosecutor,
defense, judge) at ~$4/review; this task's compute/time budget does not support 3x calls per case x 89
cases on top of v3's other 2 new arms, so this variant SIMULATES the 3 roles inside ONE hermes call
(prosecutor argument, then defender argument, then judge verdict, in that order, each explicitly labeled)
-- a scoped-down stand-in for the real architecture, not a faithful reproduction. This limitation is
reported in results-v3-baselines.md, not hidden.

Scope per the queue brief: "on the 1-3 routed decisions" -- this arm runs ONLY the decisions T53's own
semantic router (run/t53_semantic_route_v3_heldout_claude-haiku-4-5_k5_m0_c1.01.json, frozen k=5 params)
actually routed for each held-out case (field "routing", 1-3 adr_ids), not the full repo corpus -- testing
whether an antagonistic judge reduces T53's false alarms on the SAME candidate set T53 already saw, not
a different retrieval step.
"""
import json
import re
import subprocess
import time
from pathlib import Path

V3 = Path(__file__).parent.parent
RUN = Path(__file__).parent
CASES = json.loads((V3 / "cases_with_labels_v3.json").read_text())
HELDOUT = {c["id"]: c for c in CASES if c["split"] == "heldout"}

ROUTE_FILE = V3 / "run" / "t53_semantic_route_v3_heldout_claude-haiku-4-5_k5_m0_c1.01.json"
ROUTES = {r["id"]: r for r in json.loads(ROUTE_FILE.read_text())}

ALL_TEXT_BY_REPO_ADR = {}
for c in CASES:
    if c["adr_id"] == "none":
        continue
    ALL_TEXT_BY_REPO_ADR.setdefault((c["repo"], c["adr_id"]), c["decision_text"])

JUDGE_PROMPT = """You are simulating a 3-role antagonistic code review (Wealthfront's "Iris" pattern:
prosecutor argues a violation is real, defender argues it isn't, judge weighs the evidence).

--- CANDIDATE DECISION(S) ROUTED BY THE SEMANTIC ROUTER (not necessarily the right one) ---
{adrs}

--- THE CODE CHANGE (unified diff) ---
{diff}

Do this in order, each section clearly labeled:

PROSECUTOR: Argue, using specific evidence from the diff and the decision text above, that this change
VIOLATES one of the candidate decisions. If you cannot find a plausible violation, say so plainly (a null
result is expected and fine -- do not invent one).

DEFENDER: Argue the opposite: that the change is COMPLIANT, or that no candidate decision actually applies
here (e.g. it's out of scope, or the decision is superseded/dead). Use specific evidence.

JUDGE: Weigh both arguments impartially and decide. End with exactly one line:
VERDICT: VIOLATES <adr_id>
VERDICT: COMPLIANT
"""


def call_hermes(prompt: str, usage_file: Path, retries: int = 2):
    t0 = time.time()
    last_exc = None
    for attempt in range(retries + 1):
        try:
            r = subprocess.run(
                ["hermes", "-z", prompt, "-m", "claude-sonnet-5", "--provider", "anthropic", "-t", "",
                 "--safe-mode", "--usage-file", str(usage_file)],
                capture_output=True, text=True, timeout=300,
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
    lines = [l for l in text.splitlines() if re.search(r"VERDICT:\s*(VIOLATES|COMPLIANT)", l, re.I)]
    if not lines:
        return None
    m = re.search(r"VERDICT:\s*(VIOLATES|COMPLIANT)", lines[-1], re.I)
    return m.group(1).upper() == "VIOLATES"


def load_out():
    p = RUN / "arm_judge_heldout_v3.json"
    return json.loads(p.read_text()) if p.exists() else []


def save_row(row):
    p = RUN / "arm_judge_heldout_v3.json"
    rows = load_out()
    rows = [r for r in rows if r["id"] != row["id"]]
    rows.append(row)
    p.write_text(json.dumps(rows, indent=1))


def main():
    done = {r["id"] for r in load_out()}
    for cid, c in HELDOUT.items():
        if cid in done:
            continue
        route = ROUTES.get(cid)
        routed_adrs = route["routing"] if route else []
        if not routed_adrs:
            # T53's router returned nothing (zero-llm "no candidate" path) -- the judge has nothing to
            # weigh, so this arm abstains for this case rather than fabricate a candidate.
            row = {"id": cid, "repo": c["repo"], "adr_id": c["adr_id"], "label_final": c["label_final"],
                   "split": "heldout", "abstain": True, "reason": "router returned 0 candidates",
                   "predictedViolate": None}
            save_row(row)
            print("judge", cid, "ABSTAIN (0 routed candidates)")
            continue
        adr_texts = []
        for aid in routed_adrs:
            txt = ALL_TEXT_BY_REPO_ADR.get((c["repo"], aid))
            if txt:
                adr_texts.append(f"=== {aid} ===\n{txt}")
        prompt = JUDGE_PROMPT.format(adrs="\n\n".join(adr_texts), diff=c["diff"])
        uf = RUN / f"usage_judge_{cid}.json"
        text, usage, ms = call_hermes(prompt, uf)
        pred = parse_verdict(text)
        m = re.search(r"VIOLATES\s+(\S+)", text, re.I)
        named = m.group(1).rstrip(".,") if m else None
        uf.unlink(missing_ok=True)
        row = {"id": cid, "repo": c["repo"], "adr_id": c["adr_id"], "label_final": c["label_final"],
               "split": "heldout", "abstain": False, "routed_candidates": routed_adrs,
               "predictedViolate": bool(pred), "named_adr": named, "response": text,
               "usage": usage, "wallMs": ms}
        save_row(row)
        print("judge", cid, "pred=", pred, "named=", named, "label=", c["label_final"],
              f"{ms:.0f}ms", usage.get("estimated_cost_usd"))


if __name__ == "__main__":
    main()
