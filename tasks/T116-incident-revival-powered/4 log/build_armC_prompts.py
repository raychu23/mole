#!/usr/bin/env python3
"""T116 arm C: build the exact LLM-baseline prompt per case (same shape as T111's armC_llm_raw.json).
Printed prompts are run separately via `hermes -z "<prompt>" -m claude-sonnet-5 --provider anthropic -t "" --safe-mode`
(Raymond's subscription CLI, never a paid API key, per brief.md)."""
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
CASES = json.loads((HERE / "cases.json").read_text())["cases"]


def prompt_for(case):
    opts = "\n".join(f"- {o['id']}: {o['text']}" for o in case["options"])
    return (
        f"A real decision was made: \"{case['decision_text']}\"\n\n"
        f"Several real options were considered at the time:\n{opts}\n\n"
        f"A later real incident/trigger occurred:\n\"{case['incident']['text']}\"\n\n"
        "Given this incident, which ONE of the listed option ids does it most vindicate "
        "(i.e. which option would now get adopted instead)? "
        "Reply with ONLY the option id, nothing else."
    )


if __name__ == "__main__":
    prompts = {c["id"]: prompt_for(c) for c in CASES}
    (HERE / "armC_prompts.json").write_text(json.dumps(prompts, indent=1))
    for k, v in prompts.items():
        print("=== " + k + " ===")
        print(v)
        print()
