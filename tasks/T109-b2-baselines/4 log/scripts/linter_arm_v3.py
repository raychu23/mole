#!/usr/bin/env python3
"""M2 v3 baseline (a): linter-only arm. T109-b2-baselines / Q2.

Compiles each decision's text into a deterministic grep-style rule (regex over added diff lines),
with ZERO model calls at any point -- matching D92's named baseline ("rule linters") and the Wealthfront
critique's question "why not a linter?" (19 Can it stand up.md, fix 3).

Why grep, not dependency-cruiser: dependency-cruiser's rules are import/dependency-graph conditions
(module A must/must-not depend on module B) -- see rules-reference.md
(https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md, fetched 2026-11-07).
Sampling all 51 of v3's real ADRs (cases_with_labels_v3.json decision_text) shows every one is a PROSE
policy decision (language/library/process choice, naming convention, file layout) -- none encodes an
import-graph constraint dependency-cruiser's `forbidden`/`allowed` rules are built to check. A real
engineer compiling these by hand would reach for grep/ripgrep over the diff, not an import-graph tool.
This is the "grep rules" half of the brief's "dependency-cruiser / grep rules" phrasing (queue/brief.md).

Compilation rule (deterministic, run ONCE per decision, from decision_text alone -- never from a diff or
label, so it cannot leak held-out answers):
  1. If the ADR's own text says "superseded by" / "status: superseded" -> ABSTAIN (a real rule-writer does
     not compile a grep rule for a decision their own team already marked dead).
  2. Extract REJECTED terms via patterns: "instead of X", "rather than X", "in favor of X over Y" (rejects Y),
     "Considered Alternatives" bullet list minus the "Chosen Alternative: X" line, "must not use X",
     "never use X", "avoid X", "no longer uses X".
  3. Each extracted term is normalized (strip markdown emphasis/brackets, collapse whitespace, 2-40 chars,
     <=5 words) and kept only if it is specific enough to be a plausible grep target (not a stopword/verb).
  4. If no terms survive -> ABSTAIN for that decision (coverage counted separately, not a score of 0).
  5. At scoring time: predictedViolate = True iff any surviving term (whole-word/phrase, case-insensitive)
     appears in the diff's ADDED lines (lines starting with a single '+', not '+++').

This is a baseline, not Mole's real `mole rules` compiler (packages/decisions/src/rules, which does use
dependency-cruiser + TS AST for import/call-graph decisions in Mole's OWN .mole records -- those DO encode
graph constraints; see docs/decisions-and-rules.md). The difference is reported in results-v3-baselines.md,
not hidden.
"""
import json
import re
from pathlib import Path

V3 = Path(__file__).parent.parent
CASES_ALL = json.loads((V3 / "cases_with_labels_v3.json").read_text())
HELDOUT = [c for c in CASES_ALL if c["split"] == "heldout"]

STOPWORD_TERMS = {
    "it", "this", "that", "them", "these", "those", "which", "the", "a", "an", "our", "its",
}


def _clean_term(t: str) -> str | None:
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


def compile_rule(decision_text: str) -> dict:
    """Returns {'abstain': bool, 'reason': str, 'terms': [str,...]}."""
    txt = decision_text
    if re.search(r"status:\s*superseded\b", txt, re.I) or re.search(r"\bsuperseded by\b", txt, re.I):
        return {"abstain": True, "reason": "ADR text marks itself superseded", "terms": []}

    terms = set()
    patterns = [
        r"instead of ([^.,;\n]{2,60})",
        r"rather than ([^.,;\n]{2,60})",
        r"in favor of [^.,;\n]+ over ([^.,;\n]{2,60})",
        r"must not use ([^.,;\n]{2,60})",
        r"should not use ([^.,;\n]{2,60})",
        r"never use ([^.,;\n]{2,60})",
        r"avoid(?:ing)? ([^.,;\n]{2,60})",
        r"no longer uses? ([^.,;\n]{2,60})",
        r"not? ([A-Z][\w.-]{2,30})(?= is | are | was )",
    ]
    for pat in patterns:
        for m in re.finditer(pat, txt):
            c = _clean_term(m.group(1))
            if c:
                terms.add(c)

    # Considered Alternatives minus Chosen Alternative (easi-app-style MADR text)
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


def diff_added_lines(diff: str) -> str:
    out = []
    for line in diff.splitlines():
        if line.startswith("+++"):
            continue
        if line.startswith("+"):
            out.append(line[1:])
    return "\n".join(out)


def main():
    # 1. compile one rule per unique adr_id (from decision_text alone), across ALL 151 cases' decisions
    #    (dev + heldout) so compilation never sees which split a case is in.
    rules_by_adr = {}
    seen_adr = {}
    for c in CASES_ALL:
        aid = c["adr_id"]
        if aid == "none" or aid in seen_adr:
            continue
        seen_adr[aid] = True
        rules_by_adr[aid] = compile_rule(c.get("decision_text", ""))

    n_decisions = len(rules_by_adr)
    n_abstain_decisions = sum(1 for r in rules_by_adr.values() if r["abstain"])
    coverage_decisions = 1 - (n_abstain_decisions / n_decisions) if n_decisions else 0.0

    # 2. apply mechanically to the 89 held-out cases
    rows = []
    for c in HELDOUT:
        aid = c["adr_id"]
        if aid == "none":
            rule = {"abstain": True, "reason": "distractor case, adr_id=none, no decision to compile", "terms": []}
        else:
            rule = rules_by_adr[aid]
        if rule["abstain"]:
            rows.append({"id": c["id"], "repo": c["repo"], "adr_id": aid, "label_final": c["label_final"],
                         "split": "heldout", "abstain": True, "reason": rule["reason"],
                         "predictedViolate": None})
            continue
        added = diff_added_lines(c["diff"])
        hit_terms = [t for t in rule["terms"] if re.search(r"(?<![\w-])" + re.escape(t) + r"(?![\w-])", added, re.I)]
        pred = len(hit_terms) > 0
        rows.append({"id": c["id"], "repo": c["repo"], "adr_id": aid, "label_final": c["label_final"],
                     "split": "heldout", "abstain": False, "predictedViolate": pred, "hit_terms": hit_terms,
                     "rule_terms": rule["terms"]})

    out = {
        "n_decisions_total": n_decisions,
        "n_decisions_abstained": n_abstain_decisions,
        "decision_coverage": round(coverage_decisions, 4),
        "n_heldout_cases": len(HELDOUT),
        "n_heldout_abstained": sum(1 for r in rows if r["abstain"]),
        "case_coverage": round(1 - sum(1 for r in rows if r["abstain"]) / len(rows), 4),
        "rows": rows,
    }
    out_path = Path(__file__).parent / "arm_linter_heldout_v3.json"
    out_path.write_text(json.dumps(out, indent=1))
    print(f"decisions: {n_decisions}, abstained {n_abstain_decisions} (coverage {coverage_decisions:.3f})")
    print(f"heldout cases: {len(HELDOUT)}, abstained {out['n_heldout_abstained']} (coverage {out['case_coverage']:.3f})")
    print(f"wrote {out_path}")


if __name__ == "__main__":
    main()
