# M1.5 learner study (plan M1.5, human half)

Question: does the Mole panel help a **beginner** answer "who uses this / what breaks / how does A reach B" more
correctly and faster than reading code alone, and does what they pick up carry over to a function they meet without it?
Nothing here has been run on people. `SYNTHETIC-NOT-REAL-DATA.json` only proves the scorer works.

## Who and how many
3 to 5 beginners (juniors, classmates). Needs: can open a TypeScript project in VS Code; has NOT worked in the hermes ui-tui repo. 45 minutes each.
With fewer than 8 people the scorer prints "descriptive only": report each person's result, claim no significance.

## Setup (once, about 10 minutes)
```sh
git clone <Mole repo> && cd Mole && npm install && npm run build && npm run bundle
rm -rf ~/mole-study && mkdir ~/mole-study && cp -R ~/.hermes/hermes-agent/ui-tui/src ~/.hermes/hermes-agent/ui-tui/tsconfig*.json ~/.hermes/hermes-agent/ui-tui/package.json ~/mole-study/
```
- **Mole arm:** `code --extensionDevelopmentPath "$PWD/apps/vscode" ~/mole-study` (panel opens on the right; wait until it shows a map, not "indexing").
- **None arm:** plain `code ~/mole-study` in a window WITHOUT the extension (VS Code search, go-to-definition and find-references are allowed in both arms; the only difference is the panel).
- Participants must not see `keys.json` or `SYNTHETIC-NOT-REAL-DATA.json`; give them only `tasks.json` content (print the prompts).

## Design: each person does both arms (crossover), order and task set counterbalanced
| Participant | Block 1 | transfer 1 (no tool) | Block 2 | transfer 2 (no tool) |
|---|---|---|---|---|
| P1 | Mole, set X | T01 | none, set Y | T03 |
| P2 | none, set X | T01 | Mole, set Y | T03 |
| P3 | Mole, set Y | T03 | none, set X | T01 |
| P4 | none, set Y | T03 | Mole, set X | T01 |
| P5 | repeat P1 | | | |

Sets (see `tasks.json`): X = T05 callers, T06 impact, T11 importers, T13 call path. Y = T04 callers, T07 impact, T12 importers, T02 callers. Transfer tasks are plain "who calls this" on other functions.

## Script (read aloud)
1. "This is a quiz about how code connects, not a test of you. Answer in the format shown. Say 'done' when you want to stop. There is a time limit per question; unanswered counts as empty."
2. Give 2 minutes to look around the repo or the panel with a practice file (`src/lib/text.ts`), no answers recorded.
3. For each task: read the prompt aloud, start a stopwatch, stop at "done" or the limit (`minutes` in tasks.json). Record the answer and seconds.
4. After block 1 do the transfer task WITHOUT the tool in both groups (close the panel window if open), then block 2, then its transfer task.
5. Ask last: "Which part helped or confused you?" Write the answer verbatim in `notes.md`.

## Record and score
Copy `responses.template.json` to `responses.json`, one row per answer. `arm` is `mole`, `none`, `transfer-after-mole` or `transfer-after-none`; `answer` is the JSON list from the prompt (path task: the four function names).
```sh
node study/m15-learner/score.mjs study/m15-learner/responses.json
```
Reports per arm: mean F1, median seconds, exact-answer rate, and the paired difference per person (mole minus none; transfer after-mole minus after-none), plus how many people did better or worse.

## What this can and cannot show
- Can show: direction and size of the effect for these tasks, per person.
- Cannot show: that people learn the codebase faster over weeks, effects on non-TypeScript repos, or anything about the visual-learning claim beyond "the panel helps with these questions". Tasks are about structure the panel shows, so a gain is expected; a null or negative result would be the informative outcome.
- Known weak spots: set difficulty differs (impact tasks are slow), so use the counterbalancing and read per-person differences; VS Code find-references is allowed, so the panel competes with real tooling, which is intended.
- The code-review-graph comparison named in the plan needs that tool installed and is NOT part of this kit yet.
- Keys come from the TypeScript language service (see task T4 review): `T06`/`T07` accept the JSX/callback references the T4 audit found.

Rebuild tasks and keys: `TICKETS=<generated data/m15-tickets.json> node study/m15-learner/build-tasks.mjs`.
