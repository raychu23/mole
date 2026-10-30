# M22 junior study kit (T30): does the annotated file tree help a newcomer answer "why is this code like this?"

Written 2026-10-29 for Raymond. **Not run** (D7: people studies wait for you). The agent proxy (fresh subagents with vs without the
tree's text, `packages/decisions/bench/m22`) is the cheap first look; this kit is the human version of the same 5 questions.

```notes
question        Can someone new to a repo find the reason behind code faster and more correctly when the file tree shows the decisions?
repo            backstage, plugins/notifications (unfamiliar to all of them), clone pinned at e8c4d056e3c
key             packages/decisions/bench/m22-key.json (5 questions, expected ADR + key phrases, written before the code)
people          3 or more juniors / classmates who can read TypeScript and have not worked on Backstage
time            ~25 min each: 3 setup · 2 practice · up to 15 answering · 5 debrief
claim limit     3-4 people is descriptive only: report each person's numbers, no significance
```

## Setup (once, ~10 minutes)

```sh
# 1. the clone the key was written on (sparse: only the ADRs and the folder)
git clone --filter=blob:none --sparse https://github.com/backstage/backstage ~/m22-backstage
git -C ~/m22-backstage checkout e8c4d056e3c850a467e34eba810a3ed00d62cfe2
git -C ~/m22-backstage sparse-checkout set docs/architecture-decisions plugins/notifications
# 2. Mole built at the commit that contains this kit
cd <Mole checkout> && npm ci && npm run build && npm run bundle
# 3. a "with" copy that carries the decision records (the "without" copy has none)
cp -R ~/m22-backstage ~/m22-with && cp -R packages/decisions/bench/m22/overlay/.mole ~/m22-with/
```

- **with arm:** `code --new-window --extensionDevelopmentPath "$PWD/apps/vscode" ~/m22-with`. Folders in the Explorer show a badge
  (decisions in force there) and a color; hovering a folder shows its card (purpose, decisions, why, replaced ones).
  Check once before the first person: `plugins/notifications/src/api` shows a badge `2`. In this sparse clone `packages/` is not on disk,
  so adr003 / adr004 show yellow ("scope ... no longer exists"); tell them yellow here means "partly checked out", nothing else.
  The extension may also start indexing the clone in the background; ignore the map panel (close it).
  Paper fallback if the Explorer will not show badges: print the tree section of `packages/decisions/bench/m22/prompt-with.md`.
- **without arm:** close the "with" window first, then `code --new-window ~/m22-backstage` (no extension, no `.mole/`).
- Both arms may open any file in the clone and use VS Code search. No web, no Backstage docs site, no git log.

## Order (between people: each person answers all 5 questions in one arm)

| person | arm | answers file |
| --- | --- | --- |
| P1 | with | `study/m22-junior/answers/with-1.json` |
| P2 | without | `study/m22-junior/answers/without-2.json` |
| P3 | with | `study/m22-junior/answers/with-3.json` |
| P4 (if you have one) | without | `study/m22-junior/answers/without-4.json` |

Alternate the arm by arrival order, not by who seems stronger. The questions are the same 5 for everyone, in the key's order
(q1 → q5), read aloud from `m22-key.json` → `questions[].text`. Never show the key's `expect` or `phrases`.

## Script (read aloud)

1. "This is about the code, not about you. For each question tell me why the code is like this and where you found it. 'Don't know' is a fine answer."
2. 2 minutes to look around the window (with arm: "the numbers next to folders count decisions; hover a folder to read it").
3. Per question: start the stopwatch when you finish reading it, stop at "done" or 3 minutes. Write the answer and the source file they name.
4. Last: "What helped, what was confusing?" Write it verbatim in the notes column.

## Timing sheet (one row per question per person)

| person | arm | q | seconds | answer (their words) | source they named | notes |
| --- | --- | --- | --- | --- | --- | --- |
| P1 | with | q1 |  |  |  |  |
| P1 | with | q2 |  |  |  |  |
| P1 | with | q3 |  |  |  |  |
| P1 | with | q4 |  |  |  |  |
| P1 | with | q5 |  |  |  |  |
| P2 | without | q1 |  |  |  |  |
| P2 | without | q2 |  |  |  |  |
| P2 | without | q3 |  |  |  |  |
| P2 | without | q4 |  |  |  |  |
| P2 | without | q5 |  |  |  |  |
| P3 | with | q1..q5 |  |  |  |  |

## Score

Copy each person's 5 answers into their answers file (`{"q1": {"answer": "...", "source": "..."}, ...}`), then:

```sh
node packages/decisions/dist/bench/m22.js --score study/m22-junior/answers
```

The scorer is the same code that grades the agent proxy: correct = names the expected ADR (adr007, ADR 7, adr007-use-msw... all count)
or uses at least 2 of its key phrases. Report per arm: correct of 5 per person, median seconds per question from the sheet, and the
debrief quotes.

## What this can and cannot show

- Can show: whether people with the tree name the right decision more often and faster on these 5 questions.
- Cannot show: anything about repos without decision records; whether people keep the knowledge (no follow-up); the records' scope was
  written by the T30 builder from the ADR texts, so a gain also measures that mapping, which a real team would write themselves.
- Known bias: the cards quote each ADR's reason, so key phrases are easier to hit in the with arm; the ADR id match is the stricter
  read. Both arms can open `docs/architecture-decisions`, so a without-arm person who searches well can score full marks: the tree's
  claim is speed and fewer wrong guesses, not access.
- q2 has a trap on purpose: adr013 (node-fetch) is superseded by adr014. Naming adr013 alone is wrong.
