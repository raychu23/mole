#!/usr/bin/env python3
"""T110 (Q4) linter-only arm: v3's linter_arm_v3.py compile_rule() verbatim (deterministic regex
extraction from decision text, zero model calls), applied to the 7 frozen real-history cases."""
import json
import re
from pathlib import Path

TASK = Path(__file__).parent.parent
CASES = json.loads((TASK / "cases_h2.json").read_text())

STOPWORD_TERMS = {"it", "this", "that", "them", "these", "those", "which", "the", "a", "an", "our", "its"}


def _clean_term(t):
    t = t.strip()
    t = re.sub(r"^[*_`\[\(]+|[*_`\]\)]+$", "", t).strip()
    t = re.sub(r"\s+", " ", t)
    t = t.rstrip(".,:;")
    if not t or len(t) < 2 or len(t) > 40:
        return None
    if len(t.split()) > 5:
        return None
    if t.lower() in STOPWORD_TERMS:
        return None
    if not re.search(r"[A-Za-z0-9]", t):
        return None
    return t


def compile_rule(decision_text):
    txt = decision_text
    if re.search(r"status:\s*superseded\b", txt, re.I) or re.search(r"\bsuperseded by\b", txt, re.I):
        return {"abstain": True, "reason": "ADR text marks itself superseded", "terms": []}
    terms = set()
    patterns = [
        r"instead of ([^.,;\n]{2,60})", r"rather than ([^.,;\n]{2,60})",
        r"in favor of [^.,;\n]+ over ([^.,;\n]{2,60})", r"must not use ([^.,;\n]{2,60})",
        r"should not use ([^.,;\n]{2,60})", r"never use ([^.,;\n]{2,60})",
        r"avoid(?:ing)? ([^.,;\n]{2,60})", r"no longer uses? ([^.,;\n]{2,60})",
        r"not? ([A-Z][\w.-]{2,30})(?= is | are | was )",
    ]
    for pat in patterns:
        for m in re.finditer(pat, txt):
            c = _clean_term(m.group(1))
            if c:
                terms.add(c)
    alt_block = re.search(r"Considered Alternatives?\s*\n(.*?)(?:\n##|\nDecision Outcome|\Z)", txt, re.S)
    chosen = None
    cm = re.search(r"Chosen Alternative:\s*\*?\*?([^\n*]{2,40})", txt, re.I)
    if cm:
        chosen = _clean_term(cm.group(1))
    if alt_block:
        for line in alt_block.group(1).splitlines():
            m = re.match(r"\s*[\*\-]\s*(.+)", line)
            if m:
                c = _clean_term(m.group(1))
                if c and (not chosen or c.lower() != chosen.lower()):
                    terms.add(c)
    terms = sorted(terms)
    if not terms:
        return {"abstain": True, "reason": "no extractable reject-term via the compilation patterns", "terms": []}
    return {"abstain": False, "reason": "", "terms": terms}


def diff_added_lines(diff):
    out = []
    for line in diff.splitlines():
        if line.startswith("+++"):
            continue
        if line.startswith("+"):
            out.append(line[1:])
    return "\n".join(out)


def main():
    rules_by_adr = {}
    for c in CASES:
        aid = c["adr_id"]
        if aid in rules_by_adr:
            continue
        rules_by_adr[aid] = compile_rule(c["decision_text"])

    rows = []
    for c in CASES:
        rule = rules_by_adr[c["adr_id"]]
        if rule["abstain"]:
            rows.append({"id": c["id"], "adr_id": c["adr_id"], "label_final": c["label_final"],
                         "abstain": True, "reason": rule["reason"], "predictedViolate": None})
            continue
        added = diff_added_lines(c["diff"])
        hit_terms = [t for t in rule["terms"] if re.search(r"(?<![\w-])" + re.escape(t) + r"(?![\w-])", added, re.I)]
        pred = len(hit_terms) > 0
        rows.append({"id": c["id"], "adr_id": c["adr_id"], "label_final": c["label_final"],
                     "abstain": False, "predictedViolate": pred, "hit_terms": hit_terms,
                     "rule_terms": rule["terms"]})

    n_abstain = sum(1 for r in rows if r["abstain"])
    out = {"n_decisions": len(rules_by_adr), "n_cases": len(rows), "n_abstain": n_abstain, "rows": rows}
    out_path = Path(__file__).parent / "arm_linter_h2.json"
    out_path.write_text(json.dumps(out, indent=1))
    for r in rows:
        print(r["id"], "abstain=", r["abstain"], "pred=", r.get("predictedViolate"), "label=", r["label_final"])
    print(f"wrote {out_path}")


if __name__ == "__main__":
    main()
