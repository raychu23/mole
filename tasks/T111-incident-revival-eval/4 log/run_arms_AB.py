#!/usr/bin/env python3
"""T111: build .mole decision/argument/incident records from the FROZEN cases.json
(hand-checked quotes, no model call). Writes one throwaway repo per case under a temp dir
and runs `mole incident suggest` for real (arm A). Also runs BM25 (arm B) and prints the
exact prompt for arm C (LLM baseline), which is run separately via hermes -z (no API key).
"""
import json, hashlib, subprocess, sys, tempfile, shutil, re, math
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO_ROOT = HERE.parents[2]  # .../Mole-worktrees/T111-incident-revival-eval
MOLE_REPO = Path("/Users/a1/Desktop/CS Code/Project/Mole")  # unmodified, read-only: built dist/cli.js
CLI = MOLE_REPO / "packages/daemon/dist/cli.js"

CASES = json.loads((HERE / "cases.json").read_text())
got = hashlib.sha256((HERE / "cases.json").read_bytes()).hexdigest()
want = (HERE / "frozen.sha256").read_text().split()[0]
assert got == want, f"cases.json changed since freeze! {got} != {want}"


def write_repo(case, tmp):
    r = tmp / case["id"]
    (r / ".mole/decisions").mkdir(parents=True)
    (r / ".mole/arguments").mkdir(parents=True)
    (r / ".mole/incidents").mkdir(parents=True)
    d = case["decision_id"]
    # options[0] is the ORIGINAL (pre-incident, later reversed) option; options[1] is the option that later won.
    orig, later = case["options"][0], case["options"][1]
    (r / ".mole/decisions" / f"{d}.md").write_text(
        f"---\nid: {d}\ntitle: {case['decision_text'][:60]}\nstatus: accepted\nscope: [{case['domain']}]\n"
        f"cites: [{orig['id']}]\n---\n\n{case['decision_text']}\n")
    # Mutual attack (same shape as T58/T68's python-tuf best-effort/parallel fixture); resolved by a phase
    # (tenet-status-quo > tenet-safety, matching each case's real pre-incident rationale: convenience/minimal
    # change outranked the safety concern UNTIL the incident). This is the same, already-tested mechanism
    # T58/T68 use (VAF tenet tiebreak), not a new invented construct.
    (r / ".mole/arguments" / f"{d}.argdown").write_text(
        f"<{orig['id']}>: {orig['text']} #tenet-status-quo\n  -> <{later['id']}>\n\n"
        f"<{later['id']}>: {later['text']} #tenet-safety\n  -> <{orig['id']}>\n")
    (r / ".mole/tenets.md").write_text(
        "# Tenets\n\n## tenet-status-quo · Minimize disruption / keep existing convenience\n\n"
        "## tenet-safety · Prevent ecosystem-wide or security harm\n")
    (r / ".mole/priorities.md").write_text(
        "# Priorities\n\n## before · from 2000-01-01\n1. tenet-status-quo\n2. tenet-safety\n")
    inc = case["incident"]
    (r / ".mole/incidents" / f"{inc['id']}.md").write_text(
        f"---\nid: {inc['id']}\ntitle: {case['id']} trigger\ndate: {inc['date']}\n"
        f"decisions: [{d}]\nscope: [{case['domain']}]\n---\n\n{inc['text']}\n")
    subprocess.run(["git", "init", "-q"], cwd=r, check=True)
    subprocess.run(["git", "-c", "user.name=t111", "-c", "user.email=t111@example.com", "add", "-A"], cwd=r, check=True)
    subprocess.run(["git", "-c", "user.name=t111", "-c", "user.email=t111@example.com", "commit", "-qm", "init"], cwd=r, check=True)
    return r


def run_mole_suggest(repo, incident_id):
    out = subprocess.run(["node", str(CLI), "incident", "suggest", incident_id, "--phase", "before", "--root", str(repo)],
                          capture_output=True, text=True)
    if out.returncode != 0:
        return {"error": out.stderr.strip() or out.stdout.strip()}
    return json.loads(out.stdout)


def bm25_rank(query, docs, k1=1.5, b=0.75):
    """docs: list of (id, text). Own implementation, same params as B2/M-A BM25 baselines."""
    def tok(s):
        return re.findall(r"[a-z0-9]+", s.lower())
    qtoks = tok(query)
    dtoks = [(i, tok(t)) for i, t in docs]
    N = len(dtoks)
    avgdl = sum(len(t) for _, t in dtoks) / N
    df = {}
    for _, t in dtoks:
        for w in set(t):
            df[w] = df.get(w, 0) + 1
    scores = []
    for i, t in dtoks:
        dl = len(t)
        tf = {}
        for w in t:
            tf[w] = tf.get(w, 0) + 1
        s = 0.0
        for w in set(qtoks):
            if w not in df:
                continue
            idf = math.log(1 + (N - df[w] + 0.5) / (df[w] + 0.5))
            f = tf.get(w, 0)
            s += idf * (f * (k1 + 1)) / (f + k1 * (1 - b + b * dl / avgdl))
        scores.append((i, s))
    scores.sort(key=lambda x: -x[1])
    return scores


def main():
    tmp = Path(tempfile.mkdtemp(prefix="t111-cases-"))
    results = []
    for case in CASES["cases"]:
        repo = write_repo(case, tmp)
        suggestion = run_mole_suggest(repo, case["incident"]["id"])
        # arm A: top candidate argument id per mole's own ranking (score field)
        cands = suggestion.get("candidates", []) if isinstance(suggestion, dict) else []
        armA_top = cands[0]["argument"] if cands else None
        armA_ranked = [c["argument"] for c in cands]

        # arm B: BM25 over the 2 options' text vs incident text (no structural gate)
        docs = [(o["id"], o["text"]) for o in case["options"]]
        ranked = bm25_rank(case["incident"]["text"], docs)
        armB_ranked = [i for i, _ in ranked]
        armB_top = armB_ranked[0] if armB_ranked else None

        results.append({
            "case": case["id"], "ground_truth": case["ground_truth_winner"],
            "armA_mole_suggest_raw": suggestion, "armA_top": armA_top, "armA_ranked": armA_ranked,
            "armB_bm25_ranked": armB_ranked, "armB_top": armB_top,
        })
    (HERE / "arms_AB_raw.json").write_text(json.dumps(results, indent=1))
    for r in results:
        print(r["case"], "truth=", r["ground_truth"], "A_top=", r["armA_top"], "B_top=", r["armB_top"])
    shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    main()
