## Summary
T105 (I2, product centre D90): decisions/rules governing the open file now surface in VS Code the way
GitLens/ADR-tools users already expect — a CodeLens above the governed file/symbol (click opens the real
decision record), plus the existing Problems-panel rule-violation diagnostics now link to the record too.
Reuses the existing `mole decisions`/`mole rules` CLI; no new backend reasoning. One backend field was added
(decision `scope` anchors, already computed by loadGraph, were not serialized by `mole decisions --json`).
What's open: a real-VS-Code-window screenshot proof and vsix package/install check are NOT RUN — the shared
Mac's disk hit 2.6 GB free mid-task (other wave agents), below the 6 GB stop line in the wave brief.

## Goal
Read: context/product-plan/0 start.md (D90 centre), 3 Agentic workflow + integrations.md, 11 Who Mole is
for.md, apps/vscode (existing surfaces). Build (a) decisions/rules governing the open file + line ranges with
rationale one click away, (b) crisp rule violations as Problems-panel diagnostics (already built, T62/panelView.ts
— just confirmed + extended), (c) a command to open the decision record. No new backend logic; prove it with
the extension's own test harness + a real VS Code screenshot; package the vsix and test-install it.

## What changed (branch ledger/t105-vscode-reasoning-surface, worktree Mole-worktrees/T105-vscode-reasoning-surface)
- `apps/vscode/src/decisions-for-file.ts` (new, no vscode import): `decisionsForFile(decisions, file, symbols,
  lastLine)` — which decisions govern a file and at which 0-based line range (file/folder scope = whole file,
  `file#Symbol` scope = that symbol's document-symbol span), excluding rejected/superseded/deprecated/retired
  decisions, widest-match-wins when a decision has both a file- and symbol-level anchor.
- `apps/vscode/src/decisions-codelens.ts` (new): `DecisionsCodeLensProvider` — one CodeLens at line 0 when any
  file/folder-scoped decision governs the file, one CodeLens per governed symbol's declaration line; each
  resolves to `mole.openDecisionRecord`. Header cites the prior-art decision (CodeLens for governance, Problems
  panel for violations) with dated sources (GitLens docs, SonarLint/Error Lens docs, adr-tools VS Code extension).
- `apps/vscode/src/extension.ts`: `registerDecisionsCodeLens()` wires the provider (loads `mole decisions
  --json`, refetches on `.mole/decisions/*` save), registers `mole.openDecisionRecord` (CodeLens click passes
  id/file/line directly; a command-palette invocation shows a QuickPick over the loaded list); `t105Check()`
  (MOLE_T105_CHECK env, same real-Extension-Development-Host idiom as the existing m26Check/hoverCheck) for the
  self-test harness.
- `apps/vscode/src/panelView.ts`: rule-violation diagnostics (`updateDiagnostics`, already built in T62) now
  carry `DiagnosticRelatedInformation` pointing at the decision record's file:line, so the Problems panel links
  straight to the record that forbids the change — reuses data `mole rules` already returns.
- `apps/vscode/package.json`: registered `mole.openDecisionRecord` in `contributes.commands`.
- `packages/decisions/src/types.ts`, `packages/decisions/src/flags.ts`: `FlagResult` (what `mole decisions
  --json` returns) now includes `scope: Anchor[]` — the record's own scope anchors, already computed by
  `loadGraph`, previously silently dropped at the last step of `computeFlags`. No new computation; same pattern
  as T100's `rationale` field.
- `apps/vscode/scripts/t105-check.mjs` (new): drives a real `code --extensionDevelopmentPath` session against
  this repo's own live `.mole/decisions/0007-idle-shutdown.md` / `0008-indexing-never-idle.md` (scope-anchored
  to `packages/daemon/src/server.ts#Daemon.startIdleWatch` / `#Daemon.onWorker` — dogfooding, no fixture needed),
  reads real CodeLenses via `vscode.executeCodeLensProvider`, clicks through the file-level one, screenshots.
- `apps/vscode/test/decisions-for-file.test.ts` (new, 8 tests): file/folder/symbol matching, inert-status
  exclusion, unrelated scope, widest-match-wins, rationale/id/title passthrough. Red saved: `4 log/red.txt`.

## Test evidence
- `npx vitest run apps/vscode/test/decisions-for-file.test.ts`: red (module missing) → green, 8/8.
- `npx tsc -b` (repo root, then `apps/vscode`): clean, 0 errors.
- `npx vitest run apps/vscode/`: 11 files, 78/78 passed (no regression in the existing panel/hover/tree suites).
- `npx vitest run packages/decisions/test`: 51 files, 555/555 passed (the `scope` field addition to `FlagResult`
  breaks nothing; no test asserted the old exact shape).
- `node apps/vscode/scripts/t105-check.mjs` (real Extension Development Host, before the `scope` fix): ran, but
  `lenses: []` — root-caused to `mole decisions --json` not serializing `scope` (fixed above, see commit). NOT
  RE-RUN after the fix: disk dropped from 8.5 GB → 2.6 GB free during this task (other wave agents), below the
  G-wave brief's 6 GB stop line; launching another VS Code Extension Development Host window risked repeating
  today's earlier disk-triggered agent kills, so it was deliberately not re-run.

## NOT RUN (reason: disk < 6 GB mid-task, per the wave brief's hygiene rule)
- Re-running `t105-check.mjs` after the `scope` fix (expected to pass: the unit tests, CLI output, and manual
  `node packages/daemon/dist/cli.js decisions --json` inspection all confirm `scope` is now present for 0007/0008
  pointing at `Daemon.startIdleWatch`/`Daemon.onWorker`, which is exactly what `decisionsForFile` needs).
- A fresh screenshot of the real window (the one screenshot taken, pre-fix, showed no lenses and was deleted —
  not a valid proof of the shipped feature).
- `npx vsce package` + test-install into a scratch VS Code profile (`code --user-data-dir ... --extensions-dir
  ...`), per the brief's packaging step.

## Open questions for the next session
- Confirm `t105-check.mjs` goes green once disk recovers (>6 GB), then package + test-install the vsix.
- Whether `mole.cli.decisions`'s existing read-only dump command should be superseded by the new QuickPick
  (`mole.openDecisionRecord` with no args) for discoverability, or both kept (currently both exist).
