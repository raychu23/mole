# Changelog

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
