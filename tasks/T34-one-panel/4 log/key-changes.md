# Key / prior-art corrections (R2: key and committed red tests untouched; logged here instead)

## 1. m26.mjs's E2E driver: NOT @vscode/test-electron

`tasks/T34-one-panel/4 log/prior-art.md` (R0, committed before this run) picked `@vscode/test-electron` for
the real-VS-Code half of M26. That is correct in general but wrong for *this* machine right now: the task
brief for this run states the disk is critically low (was ~1.7 GB free, crashed a previous attempt) and
explicitly forbids installing `@vscode/test-electron` or downloading any new Electron/Chromium binary, even
though `@vscode/test-electron` *can* point at an already-installed VS Code (as the prior-art note says) —
the risk is that importing the package at all can trigger `postinstall`/version-check downloads, and it is
not installed in this workspace, so adding it means an `npm install` that may pull a new binary under disk
pressure the previous run proved fatal.

Rewritten `apps/vscode/scripts/m26.mjs` to use the repo's own established idiom instead (same shape as
`apps/vscode/scripts/hover-check.mjs` / `install-check.mjs`): spawn the already-installed `code` CLI
(`/usr/local/bin/code`) with `--extensionDevelopmentPath`, a scratch `--user-data-dir`/`--extensions-dir`,
and one env var (`MOLE_M26_CHECK=<config path>`) that `extension.ts` checks at activation; the extension
runs the check in-process with the real `vscode` API and writes a result JSON; the script waits for that
file, reads it, and kills only its own scratch-path profile (`pkill -f <SCRATCH>`, never a bare `pkill -f`).
No new package, no Electron download.

This does not touch `tasks/T34-one-panel/4 log/m26-key.json` (the benchmark key itself, R2) — only the
*driver* script's E2E mechanism changed; the 14 features and 300 ms target it checks are unmodified.

## 2. `@mole/decisions`'s rules checker is not imported directly into the extension host bundle

`packages/decisions/src/rules/check.ts` does `await import('dependency-cruiser')` at runtime. The
extension's esbuild config (`apps/vscode/esbuild.mjs`) marks `dependency-cruiser` external **only** for
`dist/daemon.cjs` (a plain-Node bundle); `dist/extension.cjs` (the VS Code extension host bundle) has no
such exclusion, so a direct `import('@mole/decisions')`/`checkRules` call from `src/*.ts` would pull the
whole dependency-cruiser package into the extension host bundle and risks the exact "top-level await in a
CJS bundle" failure the esbuild script's own comment warns about for the daemon build.

Decision (not a key change, an implementation choice worth recording): every section that needs
`@mole/decisions`, `@mole/flows`, `@mole/agentstate`, `@mole/questions`/`@mole/history`'s `check` data, and
`rules` runs through the already-bundled `dist/daemon.cjs` CLI via `child_process` (same pattern the
existing `seen` recorder already uses in `extension.ts`), not a direct package import from `src/panelRunners.ts`.
This also matches the existing, documented limitation that `mole rules` needs a repo checkout in the
packaged `.vsix` (esbuild.mjs's own comment) — the panel's rules section degrades to "unavailable" in a
packaged extension run from a bare `.vsix` without `node_modules`, same as the CLI already does.

## 2026-10-29 reviewer P1 fix (not a loosened check)
Reviewer found: collisions() test mock used `{collisions: []}` but @mole/agentstate's real collisions() returns `{pairs: []}`,
masking a real bug (panelData.ts + webview/panel.ts read `.collisions.collisions` instead of `.collisions.pairs`, so the agents
section's emptiness/count was always wrong). Fix: both files now read `.pairs`; test fixtures corrected to `{pairs: []}` to
match the real @mole/agentstate shape. Same assertion strength, correct field name — not a loosened check (R2/R7 compliant).
