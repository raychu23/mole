## Summary
T105 (I2, product centre D90): decisions/rules governing the open file surface in VS Code the way
GitLens/ADR-tools users already expect — a CodeLens above the governed file/symbol (click opens the real
decision record), plus the existing Problems-panel rule-violation diagnostics link to the record too.
Reuses the existing `mole decisions`/`mole rules` CLI; no new backend reasoning. A live-toggle setting and an
external-change watcher were added (review findings 3/4). Review FAIL fixed (review deleg_b3fb4dbe/task-2):
the self-test gate was miscalibrated (dogfooding a repo with only symbol-scoped decisions can never prove a
file-level lens) and the screenshot proof used `screencapture`/`osascript`, which have no Accessibility
permission in this sandbox. Both fixed; branch merged with main (T104/T106/T107); full proof chain reran clean.

## Goal
Read: context/product-plan/0 start.md (D90 centre), 3 Agentic workflow + integrations.md, 11 Who Mole is
for.md, apps/vscode (existing surfaces). Build (a) decisions/rules governing the open file + line ranges with
rationale one click away, (b) crisp rule violations as Problems-panel diagnostics, (c) a command to open the
decision record, (d) a live-toggle setting, (e) refresh on external `.mole/decisions/*` changes. No new backend
logic; prove it with the extension's own test harness + a real VS Code screenshot; package the vsix and
test-install it.

## What changed (branch ledger/t105-vscode-reasoning-surface; merged main @ 91acaaf first)
- `apps/vscode/src/decisions-for-file.ts`, `decisions-codelens.ts`, `extension.ts`, `panelView.ts`: as before
  (file/symbol-scoped CodeLens, click-through to the record, Problems-panel `DiagnosticRelatedInformation`).
- Review fix 1 (BLOCKING, gate miscalibration): `apps/vscode/scripts/t105-check.mjs` no longer dogfoods this
  repo's own decisions (symbol-scoped only on `server.ts` — can never produce a file-level lens). It now
  generates a small dedicated fixture repo (scratch, `git init`) with one file-scoped decision
  (`src/file-scoped.ts`), one symbol-scoped decision (`src/symbol-scoped.ts#governedFunction`, with an
  unrelated `otherFunction` proving the lens lands on the RIGHT line only), and one crisp rule violation
  (`forbid: import` from `src/ui/` to `src/db/`, same shape as `packages/decisions/test/rules-check.test.ts`).
  `apps/vscode/src/extension.ts`'s `t105Check()` asserts: file-level lens present, symbol-level lens on the
  governed line (not the other), click-through on both opens the real `.mole/decisions/*.md` record, and a
  Problems diagnostic whose `relatedInformation` links to the rule's decision record. Root-caused a stray
  colon in the fixture's own YAML `source:` field breaking the parse (not an extension bug) along the way.
- Review fix 2 (BLOCKING, screenshot): `t105-check.mjs` launches `code --remote-debugging-port=<port>` and
  captures the real workbench page over CDP (`fetch http://127.0.0.1:<port>/json` for the target,
  `Page.captureScreenshot` over its websocket) instead of `osascript`/`screencapture` (no Accessibility
  permission in this sandbox — confirmed empirically, a prior shot was blank desktop wallpaper). Environment
  note found and documented in the script: spawning `code` and then touching network/child_process APIs in
  the SAME node process crashes ("process has forked...CoreFoundation") when that node process runs in a
  FOREGROUND shell call in this sandbox; identical code is clean when the whole script runs backgrounded
  (confirmed by direct repro). Not an extension bug; a sandbox quirk, documented in the script's header comment.
- Review fix 3 (MEDIUM): `mole.decisionsCodeLens.enabled` setting (default true) in
  `apps/vscode/package.json` `contributes.configuration`, honoured live via `onDidChangeConfiguration` ->
  `provider.configChanged()` forcing an immediate lens recompute — same per-feature CodeLens toggle idiom as
  GitLens's `gitlens.codeLens.enabled` (cited in `decisions-codelens.ts`'s doc comment).
- Review fix 4 (LOW): a `vscode.workspace.createFileSystemWatcher('.mole/decisions/**')` (create/change/delete,
  debounced 300ms) in `registerDecisionsCodeLens`, alongside the existing `onDidSaveTextDocument` (in-editor
  saves refresh immediately, undebounced); catches external changes (git checkout/pull, another worktree,
  `mole init`) that never touch this window's editor.
- Review fix 5: packaged via the repo's own `apps/vscode/scripts/package.mjs` (not bare `npx vsce package`,
  which fails on the `@mole/vscode` package name), installed into a scratch VS Code profile
  (`--user-data-dir`/`--extensions-dir`), confirmed activation from the INSTALLED copy (daemon processes
  spawned from `<ext-dir>/raychu23.mole-code-map-0.5.0/dist/daemon.cjs`, not the source tree) and the
  CodeLens visible via a second CDP screenshot.
- `apps/vscode/test/decisions-for-file.test.ts` (8 tests, unchanged from the prior pass).

## Test evidence
- `npx vitest run apps/vscode packages/decisions`: 63 files, 637/637 passed.
- `npx tsc -b`: clean, 0 errors (run 3x across the session: post-merge, post review-fixes, pre-commit).
- `node apps/vscode/scripts/t105-check.mjs` (real Extension Development Host, backgrounded per the sandbox
  note above), fixture repo, exit 0:
  `hasFileLevelCodeLens: true`, `hasSymbolLevelCodeLens: true`, `clickThroughFileLens: true`,
  `clickThroughSymbolLens: true`, `diagnosticRelatedInfoLinksToRecord: true`, `paletteCommandRegistered: true`.
  Screenshot: `4 log/codelens.png` (visually confirmed: CodeLens "Mole: decision D-symbol governs this —
  governedFunction must stay pure" above the right function, D-file.md opened in a background tab from the
  file-lens click-through, view.ts's forbidden import squiggled with the Problems count showing 1 warning).
- vsix package + scratch-profile install-check: `node apps/vscode/scripts/package.mjs` ->
  `mole-code-map-0.5.0.vsix` (6.71 MB), installed via `code --install-extension ... --user-data-dir
  --extensions-dir`, activation confirmed (daemon processes running from the installed extension's own `dist/`,
  not the source tree), CodeLens visible via a second CDP screenshot: `4 log/installed-vsix-codelens.png`.

## NOT RUN
- None outstanding from this review cycle.

## Open questions for the next session
- Whether `mole.cli.decisions`'s existing read-only dump command should be superseded by the new QuickPick
  (`mole.openDecisionRecord` with no args) for discoverability, or both kept (currently both exist).
