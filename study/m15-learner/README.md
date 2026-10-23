# M1.5 learner study (plan M1.5, human half)

Question: does the Mole panel help a **beginner** answer "who uses this / what breaks / how does A reach B" more
correctly and faster than reading code alone? A 4-minute no-tool "transfer probe" after each block is a weak first look at carry-over, not a learning study.
Nothing here has been run on people. `SYNTHETIC-NOT-REAL-DATA.json` only proves the scorer works.

## Who and how many
Beginners (juniors, classmates): can open a TypeScript project in VS Code, have NOT worked in the hermes ui-tui repo. Budget **60 minutes** each (task time limits alone sum to up to 50: 22 + 20 + 4 + 4; typical runs are shorter).
**Recruit 4** (the design below is balanced only for 4, or multiples of 4). With 3 or fewer, run the first rows and report each person's result; with fewer than 8 the scorer prints "descriptive only", claim no significance. Do not add a 5th person on their own: it breaks the balance.

## Setup (once, about 10 minutes)
```sh
# 1. Mole at the commit that contains this kit (branch ledger/t5-m15-learner-study-kit until it is merged to main)
git clone <Mole repo> && cd Mole && git checkout <that branch or main after merge> && npm install && npm run build && npm run bundle
# 2. the repo being studied: pin the commit the answer keys were made on (must print e06df9c2ea)
git -C ~/.hermes/hermes-agent rev-parse --short=10 HEAD
# 3. a study copy WITHOUT test files, so "every file you see is production code"
rm -rf ~/mole-study ~/mole-study-state && mkdir ~/mole-study && cp -R ~/.hermes/hermes-agent/ui-tui/src ~/.hermes/hermes-agent/ui-tui/tsconfig*.json ~/.hermes/hermes-agent/ui-tui/package.json ~/mole-study/
rm -rf ~/mole-study/src/__tests__ && find ~/mole-study/src -name '*.test.*' -delete
```
- **Mole arm:** `MOLE_STATE_DIR=$HOME/mole-study-state code --new-window --extensionDevelopmentPath "$PWD/apps/vscode" ~/mole-study` (the state dir keeps the index out of the participant's file tree). The panel opens on the right and follows the file that is open: open any file (for example `src/lib/text.ts`) and wait until the panel shows a map instead of "indexing".
- **None arm:** first CLOSE the Mole window, then `code --new-window ~/mole-study` (if the Mole window is still open on the same folder VS Code reuses it and the extension stays loaded). Check: no Mole panel and no "Mole" commands in the palette.
- VS Code search, go-to-definition and find-references are allowed in both arms; the only difference is the panel.
- Participants must not see `keys.json` or `SYNTHETIC-NOT-REAL-DATA.json`; give them only the prompts from `tasks.json`.
- Not verified by the T5 review: what the panel looks like in this window (the reviewer could not screenshot it); look at it yourself once before the first participant.

## Design: each person does both arms (crossover), order and task set counterbalanced
| Participant | Block 1 | transfer 1 (no tool) | Block 2 | transfer 2 (no tool) |
|---|---|---|---|---|
| P1 | Mole, set X | T01 | none, set Y | TX1 |
| P2 | none, set X | T01 | Mole, set Y | TX1 |
| P3 | Mole, set Y | TX1 | none, set X | T01 |
| P4 | none, set Y | TX1 | Mole, set X | T01 |

Sets (see `tasks.json`): X = T05 callers, T06 impact, T11 importers, T13 call path. Y = T04 callers, T07 impact, T12 importers, T02 callers. Transfer tasks T01 (`sessionScopedModelArg`) and TX1 (`hasSensitivePrompt`) are plain "who calls this" on functions no set task touches. Sets are NOT type-matched (X has the call-path question, Y a second callers question); the crossover is what balances it.

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
Reports per arm: mean F1, median seconds, exact-answer rate, and the paired difference per person (mole minus none; transfer after-mole minus after-none), plus how many people did better or worse. The scorer stops with the offending row if an arm is misspelled, a task has no key or a row is duplicated, and warns if the template placeholder is still in the answers. Answers must be exact repo-relative paths (`src/app/x.ts`; a leading `./` is fine) or the four function names; `file:line`, case changes or `fn()` score 0.
**Transfer is only meaningful pooled over the 4-person design** (T01 and TX1 differ in difficulty; each arm gets each transfer task twice only across P1-P4). Do not read a single person's transfer difference.

## What this can and cannot show
- Can show: direction and size of the effect for these tasks, per person.
- Cannot show: that people learn the codebase faster over weeks, effects on non-TypeScript repos, or anything about the visual-learning claim beyond "the panel helps with these questions". Tasks are about structure the panel shows, so a gain is expected; a null or negative result would be the informative outcome.
- Known weak spots: set difficulty differs (impact tasks are slow), so read the pooled arm comparison, not single sets; VS Code find-references is allowed, so the panel competes with real tooling, which is intended.
- The panel is file-level (it lists callers of a file) while the tasks ask about functions; whether that is enough for the function-level questions is part of what this tests.
- The code-review-graph comparison named in the plan needs that tool installed and is NOT part of this kit yet.
- Keys come from the TypeScript language service (see task T4 review): `T06`/`T07` accept the JSX/callback references the T4 audit found.

Rebuild tasks and keys: `TICKETS=<generated data/m15-tickets.json> node study/m15-learner/build-tasks.mjs`.
