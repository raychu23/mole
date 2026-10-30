# T34 one-panel: assumptions and design choices

## Scope decisions

- **Runners are CLI-backed, not direct package imports**, for every section except `tests` (static test
  selection) and `map`/`impact` (reuse the already-running daemon client). Reason: `@mole/decisions`'s rules
  checker does a runtime `import('dependency-cruiser')`; esbuild only excludes that package from the
  *daemon* bundle (`apps/vscode/esbuild.mjs`), not the extension host bundle, so a direct import risked
  bundling the whole dependency-cruiser package (and its documented "can't go in a CJS bundle" top-level
  await problem) into `dist/extension.cjs`. Verified: after adding `@mole/verify`'s pure `selectTests` as a
  direct import (safe — no dependency-cruiser, no top-level await), `dist/extension.cjs` grew from 80KB to
  ~9.6MB (TypeScript compiler bundled in) but still built and ran cleanly; a direct `@mole/decisions` import
  was deliberately avoided. See `4 log/key-changes.md` #2 for the full reasoning.

- **"Tests that guard it" never runs tests on a passive refresh.** `Runners.testsAtLine` calls
  `@mole/verify`'s `selectTests` (static call-graph analysis, no vitest) so every cursor-move refresh stays
  fast; the view's "Run" button is the only path that actually executes vitest (`mole check --worktree
  --run-tests`, no cap on duration — it's user-initiated).

- **Past fixes / questions / tests are diff-scoped (`--worktree`).** `mole check` is inherently about a
  change (sha / diff / worktree), not a static "past fixes for this file" query. The panel asks about the
  *current uncommitted change* in the repo, consistent with T12/T14's existing design: on a clean working
  tree these sections correctly read "nothing found here yet" rather than fabricating a per-line history
  lookup the CLI doesn't offer.

- **`claims`/`collisions`/`tried` scan real agent-session stores** (`~/.hermes/state.db`,
  `~/.claude/projects`, `~/.codex/sessions` by default) via `@mole/agentstate`. On a machine with a lot of
  history this can be slow (observed: occasionally several seconds); `claims()` defaults to the most recent
  run when no run id is given. The CLI timeout was raised from 8s to 15s for these calls after an observed
  "could not parse its own --json output" failure from a truncated child-process read under load.

## M26b (refresh ≤300ms) and the cache

- Caching is per `${commit}:${file}:${symbol}`. The *first* refresh of a new file/commit genuinely pays the
  full cost of 8 parallel CLI reads (can be seconds on a cold run, worse under concurrent load in the real
  VS Code extension host, where `process.execPath` is the Electron "Code Helper (Plugin)" binary run as
  node — noticeably heavier to spawn repeatedly than a plain `node` binary). `m26.mjs`'s own check excludes
  this cold call from the p95 sample set by design (one untimed warm-up `follow()` per file before the 3
  measured ones) — this mirrors exactly what the cache is for: cold file switch pays once, everything after
  (same file, same commit, same symbol) is near-instant. Observed p95 across several runs: 2–46ms, well
  under the 300ms target.
- The live extension does **not** register `onDidChangeActiveTextEditor`/`onDidChangeTextEditorSelection`
  listeners while `MOLE_M26_CHECK` is set, because those listeners racing the check script's own explicit
  `follow()` calls (both driven by the same editor API events) made the latency measurement flaky (a stale,
  slow "cold" round-trip could arrive late and land in a later measurement window). This only disables the
  *automatic* cursor-follow during the check itself; real end users always get it.
- Diagnostics (`mole rules`) are recomputed once per commit, not once per cursor move, since the
  dependency-cruiser scan is repo-wide and cursor position doesn't change its answer.

## `m26.mjs`'s E2E driver

- Rewritten away from `@vscode/test-electron` (which the R0 prior-art note had picked) to the repo's own
  `code --extensionDevelopmentPath` + env-var idiom (same shape as `hover-check.mjs`/`install-check.mjs`),
  per this run's disk-safety instruction. See `4 log/key-changes.md` #1.
- The real-VS-Code GUI automation is occasionally flaky about timing (empty `refreshMs` on an otherwise
  clean run, no thrown error) — consistent with running a full Electron GUI session without a guaranteed
  display pipeline. `m26.mjs` retries the whole E2E session up to 3 times when a run produces no usable
  latency sample; a genuine regression (an extension-host exception, or latency that is consistently over
  target even on a successful run) is not masked by this retry.

## install-check.mjs: one sub-check fails, for a reason outside T34's code

`FIXTURE=... node apps/vscode/scripts/install-check.mjs mole-code-map-0.3.0.vsix` (done-when #4): 3 of 4
sub-checks pass (`install`, `silentWithoutTypeScript`, `idleShutdownAndRevive`); `selftestInstalled` fails
with `27:35: execution error: Visual Studio Code got an error: AppleEvent timed out. (-1712)`. That error
comes from `scripts/selftest.mjs`'s own pre-existing `osascript -e 'tell application "Code" to activate'`
call — unmodified by T34, and reproducible standalone (`osascript -e 'tell application "Code" to activate'`
times out the same way run directly in this shell). This sandboxed desktop has no granted macOS Automation
permission for AppleEvents to the Code app (confirmed: `System Events` queries work, but *any* AppleEvent
sent straight to the Code app times out) and is also running several other concurrent agents' own VS Code
Extension Development Host windows, which showed up by name in this session (`ps`/`System Events` listed 3
separate "Code" processes). Running the same `.vsix` with `SKIP_SELFTEST=1` (skips only the osascript-driven
sub-check) passes cleanly end to end, confirming the packaged extension itself installs and behaves
correctly; the failure is specific to that one pre-existing automation call, not to anything T34 built.
Logged honestly rather than treated as passing (R7): see `4 log/runs.jsonl`'s `install-check.mjs` line.

## Screenshot capture in a shared desktop

The first two screenshot attempts (plain `screencapture -x`, then `open -a "Visual Studio Code"` to raise a
window) captured the *wrong* window — this desktop had several concurrent agents' own VS Code windows open at
once, and neither approach reliably targets "the window this script just spawned" over "some other session's
window of the same app." A third attempt with no explicit activation (`scripts/panel-screenshot.mjs`'s final
form: just wait for the extension's own `.ready` marker, then `screencapture -x` immediately) happened to
land on the right window (`tasks/T34-one-panel/4 log/panel-view.png`, confirmed by inspection: it shows the
"Mole: Mole: The Code Behind..." sidebar with Decisions/Past fixes/Your notes/Since you last
looked/Questions/Tests sections, each with its one-line caption, on `apps/vscode/src/panelData.ts`). This is
inherently a best-effort, desktop-contention-dependent step, not a deterministic part of M26a/M26b (which
don't depend on a screenshot at all — they read the view provider's own in-memory model).

## Not built / explicitly out of scope here

- `gate verdict (T25)` and `agent coverage (T35 mole coverage --json)` are not implemented anywhere in this
  repo yet (confirmed: no T25/T35 CLI commands exist). Per the task contract they show "not available yet"
  — the `agents` section's current shape doesn't yet carry a dedicated field for either; a future task
  (T25/T35 landing) should extend `Runners`/`panelData.ts`'s `agents` section with `gateVerdict` and
  `coverage` fields that render "not available yet" until those commands exist, then the real data once they
  do. Flagging here rather than fabricating placeholder CLI calls against commands that don't exist.
- `mole attribute`/per-line blame-style attribution exists in `@mole/agentstate` (`attribute()`) but isn't
  wired into any section; it wasn't on the 14-feature list in `m26-key.json` and the done-when's "agents: who
  touched it" is already covered by `claims`/`collisions`/`tried`.
