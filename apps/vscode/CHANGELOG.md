# Changelog

## 0.3.0

- New sidebar view in the Activity Bar ("Mole: the code behind this"), always visible, follows the function
  under the cursor: governing decisions, past fixes + guarding tests, your notes (+ add-note box), since you
  last looked, up to 3 questions (+ an "explain it back" box saved privately to `.mole/local`), tests that
  guard it with a Run button, agents (claims/collisions/tried), and blast radius (map/impact/flows). Every
  section says what it is for in one line: the decisions behind the code, shown where you already work.
- Decision-rule violations (`mole rules`) now show in the Problems panel, not just the CLI.
- 14 new command-palette entries, one per CLI read feature (map, impact, note add, memory, since, past
  fixes, questions, decisions, rules, run tests, claims, flows, collisions, tried) — none of them need a
  terminal.
- Refresh is cached per (file, commit): a cursor move within the same function is near-instant; a cold
  file/commit pays the real read once.

## 0.2.0

- Hover on a function: your notes on it, and the past fixes behind its lines (from git history), with a link to each commit.
- Gutter marks on lines that a past fix touched.
- Map panel lists what changed since you last looked, only in code you have read.
- Records what you look at (a symbol visible 5 s or hovered) in `.mole/local/`, never sent anywhere (setting `mole.recordSeen`).

## 0.1.0

First packaged version.

- Map panel beside the code that follows the open file: what it defines, who calls it, what it calls, who imports it.
- Every box opens its file and line; callers and importers open the line where the call or import happens.
- Impact view (what a change could affect, up to three calls away).
- Local only: no network, no telemetry, no AI call. Index kept in `.git/mole`.
- Background indexer stops itself after 30 idle minutes and restarts on demand.
- Stays silent in workspaces without TypeScript.
