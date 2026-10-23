#!/usr/bin/env python3
"""Writes one brief file per (condition, ticket, repetition) into <scratch>/briefs/ and prints the delegate goals.
A brief is everything the agent is told. Both conditions get the same text except the code-map paragraph in B.
usage: briefs.py <tickets.json> <scratch> <cli.js> [reps]"""
import json, os, sys
tk = json.load(open(sys.argv[1])); S = sys.argv[2]; cli = sys.argv[3]; reps = int(sys.argv[4]) if len(sys.argv) > 4 else 1
ws = f"{S}/ui-tui"
os.makedirs(f"{S}/briefs", exist_ok=True); os.makedirs(f"{S}/answers", exist_ok=True)
MAP = (f'A compiler-derived code-map tool is also available through the terminal:\n\n    node --no-warnings "{cli}" map TARGET --root {ws} --state-dir {S}/state --no-start\n\n'
       "TARGET is a repo-relative file path, path#Symbol (for example src/a.ts#Cls.method), or a bare symbol name. It prints the ranked neighbourhood of that file or symbol: "
       "what it defines, who calls it, what it calls, who imports it (at most 25 nodes, the rest as '+N more'). Use the word impact instead of map to mark transitive callers (!impact). "
       "Its facts carry file:line evidence from the TypeScript compiler index. Use it if it helps.\n")
goals = {}
for rep in range(1, reps + 1):
    for t in tk["tickets"]:
        for cond in "ABC":
            rid = f"{cond}-{t['id']}-r{rep}"
            ans = f"{S}/answers/{rid}.json"
            body = (f"# Brief {rid}\n\nAnswer one code-comprehension question about the TypeScript repo at {ws}. Read-only: never modify files inside it.\n\n"
                    f"## Question\n\n{t['prompt']}\n\nAnswer format: {t['answerFormat']}.\n\n## Rules\n\n"
                    f"- Use only files under {ws}{' and the code-map tool described below' if cond in 'BC' else ''}. Do not look at any other directory, earlier chats, memory or the web.\n"
                    "- Stop as soon as you are confident; do not over-verify.\n"
                    f"- Finish by writing the answer JSON to {ans} with write_file, and end your reply with one line that starts with ANSWER: followed by the same json.\n")
            if cond in "BC": body += "\n## Code-map tool\n\n" + MAP
            if cond == "C": body += "\nStart with the code-map tool: run it on the relevant file or symbol before you search or read files by hand, and read the files only to confirm what it leaves open.\n"
            open(f"{S}/briefs/{rid}.md", "w").write(body)
            goals[rid] = f"m15 {rid}: Read your brief at {S}/briefs/{rid}.md and follow it exactly."
json.dump(goals, open(f"{S}/goals.json", "w"), indent=1)
print(len(goals), "briefs")
