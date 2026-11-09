#!/usr/bin/env python3
"""T120 rebuild, Arm C: RAG-reads-all (M2 v3's own RAG_PROMPT arm, unchanged) -- one hermes --safe-mode call per
case, given every one of the repo's real ADR texts (no routing, no oracle), asked to name the relevant ADR (if
any) and verdict. Pre-registered (Amendment 1 section (c) #3) as the non-Mole, full-read-cost baseline."""
import json, subprocess, re, time
from pathlib import Path

CASES = json.load(open("/Users/a1/.hermes/cache/scratch/t120c/cases_FINAL.json"))
REPO_PATHS = {"feast": Path("/Users/a1/.hermes/cache/scratch/t120c/feast"), "pledger-android": Path("/Users/a1/.hermes/cache/scratch/t120c/pledger-android")}
ADR_DIRS = {"feast": "docs/adr", "pledger-android": "docs/adr"}
OUT = Path("/Users/a1/.hermes/cache/scratch/t120c/arm_C_rag.json")
results = json.loads(OUT.read_text()) if OUT.exists() else []
done = {r["id"] for r in results}

def git(repo, *args):
    return subprocess.run(["git", "-C", str(repo)] + list(args), capture_output=True, text=True, check=True).stdout

def all_adr_texts(repo_key):
    repo = REPO_PATHS[repo_key]
    adr_dir = repo / ADR_DIRS[repo_key]
    out = []
    for f in sorted(adr_dir.glob("*.md")):
        if f.name.lower() == "readme.md":
            continue
        text = f.read_text()
        if re.search(r"status\s*\n*\s*(superseded|deprecated|rejected|retired)", text, re.I):
            continue
        out.append((f.stem, text))
    return out

ADR_CORPUS = {repo: all_adr_texts(repo) for repo in REPO_PATHS}
print("ADR corpus sizes:", {k: len(v) for k, v in ADR_CORPUS.items()})

PROMPT = """You are reviewing a code change against a repo's full set of architecture decision records (ADRs).

--- ALL ADRs IN THIS REPO ---
{adrs}

--- THE CODE CHANGE (unified diff) ---
{diff}

Which ADR (if any) does this change violate? Answer with exactly one line first:
VERDICT: VIOLATES <adr-filename-stem> or VERDICT: COMPLIANT <adr-filename-stem> or VERDICT: NONE
Then one short sentence of reasoning."""

def call_hermes(prompt):
    r = subprocess.run(["hermes", "-z", prompt, "-m", "claude-sonnet-5", "--provider", "anthropic", "-t", "", "--safe-mode"], capture_output=True, text=True, timeout=180)
    return r.stdout.strip()

def diff_of(c):
    repo = REPO_PATHS[c["repo"]]
    r = subprocess.run(["git", "-C", str(repo), "diff", f"{c['base']}..{c['head']}"], capture_output=True, text=True)
    return r.stdout

def parse(text, repo_key):
    m = re.search(r"VERDICT:\s*(VIOLATES|COMPLIANT|NONE)\s*([\w.-]*)", text, re.I)
    if not m:
        return None, None
    verdict = m.group(1).upper()
    adr = m.group(2) or None
    return verdict, adr

for c in CASES:
    if c["id"] in done:
        continue
    diff = diff_of(c)
    adrs_text = "\n\n".join(f"=== {stem} ===\n{text}" for stem, text in ADR_CORPUS[c["repo"]])
    prompt = PROMPT.format(adrs=adrs_text[:60000], diff=diff[:6000])
    t0 = time.time()
    text = call_hermes(prompt)
    ms = int((time.time() - t0) * 1000)
    verdict, adr_stem = parse(text, c["repo"])
    # match stem containing the case's own adr_id (e.g. "adr0003" in "ADR-0003-on-demand...", or "005" in "005-room...")
    matched_target = bool(adr_stem) and c["adr_id"] != "none" and c["adr_id"].lstrip("0") in re.sub(r"[^0-9]", "", adr_stem or "").lstrip("0") if adr_stem else False
    flagged_any = verdict == "VIOLATES"
    predicted_violate = flagged_any if c["adr_id"] == "none" else (verdict == "VIOLATES")
    row = {"id": c["id"], "repo": c["repo"], "adr_id": c["adr_id"], "label_final": c["label_constructor_intent"],
           "predictedViolate": predicted_violate, "rawVerdict": verdict, "rawAdr": adr_stem, "wallMs": ms, "response": text[:300]}
    results.append(row)
    OUT.write_text(json.dumps(results, indent=2))
    print(c["id"], "pred=", predicted_violate, "label=", c["label_constructor_intent"], f"{ms}ms")
print(f"wrote {len(results)} rows -> {OUT}")
