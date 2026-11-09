#!/usr/bin/env python3
"""T116 (Q5b): build .mole decision/argument/incident records from the FROZEN cases.json
(hand-sourced, dated, real-PEP quotes -- no model call in case construction). Unlike T111,
every case has >=3 options (1 winner + >=2 real dissents), so `mole incident suggest --phase
before` always faces a candidate set >= 2 -- this is the T111 defect fix the queue item asked
for. Writes one throwaway repo per case, runs the real CLI (arm A), own BM25 (arm B), and
prints arm C's exact prompts (run separately via hermes -z, no API key).
"""
import json, hashlib, subprocess, sys, tempfile, shutil, re, math
from pathlib import Path

HERE = Path(__file__).resolve().parent
MOLE_REPO = Path("/Users/a1/Desktop/CS Code/Project/Mole")  # unmodified, read-only: built dist/cli.js
CLI = MOLE_REPO / "packages/daemon/dist/cli.js"

CASES = json.loads((HERE / "cases.json").read_text())


def freeze_check():
    got = hashlib.sha256((HERE / "cases.json").read_bytes()).hexdigest()
    frozen_file = HERE / "frozen.sha256"
    if frozen_file.exists():
        want = frozen_file.read_text().split()[0]
        assert got == want, f"cases.json changed since freeze! {got} != {want}"
    else:
        frozen_file.write_text(f"{got}  cases.json\n")
        print("FROZE cases.json ->", got)
    return got


# Tenet names are kept distinct per option so each has its own priority rank; the FIRST option
# in each case's "options" list is always the pre-incident winner (status quo / original decision),
# the rest are real dissents -- all of which must be 'out' (losing) at phase "before" so the
# candidate set mole incident suggest returns is >= len(options)-1 (>=2 for every case here).
def tenet_for(case_id, opt_idx):
    return f"tenet-{case_id}-{opt_idx}"


def write_repo(case, tmp):
    r = tmp / case["id"]
    (r / ".mole/decisions").mkdir(parents=True)
    (r / ".mole/arguments").mkdir(parents=True)
    (r / ".mole/incidents").mkdir(parents=True)
    d = case["decision_id"]
    opts = case["options"]
    winner = opts[0]
    dissents = opts[1:]
    (r / ".mole/decisions" / f"{d}.md").write_text(
        f"---\nid: {d}\ntitle: {case['decision_text'][:60]}\nstatus: accepted\nscope: [{case['domain']}]\n"
        f"cites: [{winner['id']}]\n---\n\n{case['decision_text']}\n")
    # Full mutual-attack graph among all options (every option attacks every other), resolved by
    # tenet priority -- same mechanism as T58/T68/T111 (VAF tenet tiebreak), scaled from 2 to N
    # options. priorities.md ranks the winner's tenet above every dissent's tenet "before" the
    # incident; the incident (built separately) knocks out the winner's tenet "after".
    lines = []
    for i, o in enumerate(opts):
        others = " ".join(f"<{opts[j]['id']}>" for j in range(len(opts)) if j != i)
        attacks = "\n".join(f"  -> <{opts[j]['id']}>" for j in range(len(opts)) if j != i)
        lines.append(f"<{o['id']}>: {o['text']} #{tenet_for(case['id'], i)}\n{attacks}\n")
    (r / ".mole/arguments" / f"{d}.argdown").write_text("\n".join(lines))
    tenet_md = ["# Tenets", ""]
    for i, o in enumerate(opts):
        tenet_md.append(f"## {tenet_for(case['id'], i)} · {o['id']}")
        tenet_md.append("")
    (r / ".mole/tenets.md").write_text("\n".join(tenet_md))
    order = ", ".join(tenet_for(case["id"], i) for i in range(len(opts)))
    (r / ".mole/priorities.md").write_text(
        f"# Priorities\n\n## before · from 2000-01-01\n" +
        "\n".join(f"{i+1}. {tenet_for(case['id'], i)}" for i in range(len(opts))) + "\n")
    inc = case["incident"]
    (r / ".mole/incidents" / f"{inc['id']}.md").write_text(
        f"---\nid: {inc['id']}\ntitle: {case['id']} trigger\ndate: {inc['date']}\n"
        f"decisions: [{d}]\nscope: [{case['domain']}]\n---\n\n{inc['text']}\n")
    subprocess.run(["git", "init", "-q"], cwd=r, check=True)
    subprocess.run(["git", "-c", "user.name=t116", "-c", "user.email=t116@example.com", "add", "-A"], cwd=r, check=True)
    subprocess.run(["git", "-c", "user.name=t116", "-c", "user.email=t116@example.com", "commit", "-qm", "init"], cwd=r, check=True)
    return r


def run_mole_suggest(repo, incident_id):
    out = subprocess.run(
        ["node", str(CLI), "incident", "suggest", incident_id, "--phase", "before", "--root", str(repo)],
        capture_output=True, text=True)
    if out.returncode != 0:
        return {"error": out.stderr.strip() or out.stdout.strip()}
    try:
        return json.loads(out.stdout)
    except json.JSONDecodeError:
        return {"error": f"non-JSON stdout: {out.stdout[:400]}"}


def bm25_rank(query, docs, k1=1.5, b=0.75):
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
    freeze_check()
    tmp = Path(tempfile.mkdtemp(prefix="t116-cases-"))
    results = []
    for case in CASES["cases"]:
        repo = write_repo(case, tmp)
        suggestion = run_mole_suggest(repo, case["incident"]["id"])
        cands = suggestion.get("candidates", []) if isinstance(suggestion, dict) else []
        armA_ranked = [c["argument"] for c in cands]
        armA_top = armA_ranked[0] if armA_ranked else None
        candidate_set_size = len(cands)  # the T111 defect metric: must be >= 2

        docs = [(o["id"], o["text"]) for o in case["options"]]
        ranked = bm25_rank(case["incident"]["text"], docs)
        armB_ranked = [i for i, _ in ranked]
        armB_top = armB_ranked[0] if armB_ranked else None

        results.append({
            "case": case["id"], "ground_truth": case["ground_truth_winner"],
            "n_options": len(case["options"]), "candidate_set_size": candidate_set_size,
            "armA_mole_suggest_raw": suggestion, "armA_top": armA_top, "armA_ranked": armA_ranked,
            "armB_bm25_ranked": armB_ranked, "armB_top": armB_top,
        })
    (HERE / "arms_AB_raw.json").write_text(json.dumps(results, indent=1))
    for r in results:
        print(r["case"], "n_opts=", r["n_options"], "candidate_set=", r["candidate_set_size"],
              "truth=", r["ground_truth"], "A_top=", r["armA_top"], "B_top=", r["armB_top"])
    shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    main()
