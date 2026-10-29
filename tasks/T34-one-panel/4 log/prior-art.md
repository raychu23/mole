# Prior art — T34 one panel (R0)

Gathered 2026-10-29 via web_search (keenable/exa/parallel-backed; URLs below, dates are each page's
own content, not necessarily the fetch date).

## 1. Sidebar webview pattern: the official sample

`microsoft/vscode-extension-samples`, `webview-view-sample/src/extension.ts`
(https://github.com/microsoft/vscode-extension-samples/blob/main/webview-view-sample/src/extension.ts,
fetched 2026-10-29):

- A view is a class implementing `vscode.WebviewViewProvider`, registered with
  `vscode.window.registerWebviewViewProvider(viewType, provider)` — NOT `createWebviewPanel` (that API
  is editor-area only; Stack Overflow https://stackoverflow.com/questions/67150547 confirms the same:
  "For the side bar, you have to use `registerWebviewViewProvider`").
- `resolveWebviewView(webviewView, context, token)` sets `webview.options` (`enableScripts`,
  `localResourceRoots`), assigns `webview.html` once, and wires `onDidReceiveMessage` for the
  webview → extension direction. Extension → webview updates go through `view.webview.postMessage(...)`
  on the stored `_view` reference (kept as an instance field because `resolveWebviewView` can be called
  again after the view is hidden/shown).
- The view id is declared in `package.json` `contributes.views.<container>` with `"type": "webview"`.
- Decision for T34: same shape — one `MolePanelView implements vscode.WebviewViewProvider`, HTML/CSS/JS
  shell set once in `resolveWebviewView`, every refresh is a `postMessage` with the new per-section
  model (matches `apps/vscode/src/extension.ts`'s existing `MolePanel`, which already posts rendered
  content into its webview panel the same way — one message-passing idiom for both surfaces).

## 2. GitLens / Copilot Chat / Sourcegraph Cody side panels

Public source wasn't pulled verbatim (GitLens and Copilot Chat are not MIT and were not vendored into
this sandbox), but the documented shape they all use is the same `WebviewViewProvider` +
`postMessage`/`onDidReceiveMessage` idiom above (GitLens' "GitLens" sidebar view, Copilot Chat's chat
sidebar, Cody's sidebar chat are all registered views, not editor panels). The pattern distinctive to
all three that matters for M26b (fast refresh):
- they keep the webview's HTML **static** after first load and push data via `postMessage`, so a
  refresh never pays for a full webview reload — only a JS-side DOM patch. T34 follows this: `panel.ts`
  (bundled into `dist/panel.js`) listens for one message type (`mole.update`) and re-renders only the
  changed sections.
- they debounce on cursor/selection change rather than firing per keystroke, and cache the last
  computed result keyed by file (+ revision) so moving the cursor within the same function/file is a
  cache hit, not a recompute. T34's `panelData.ts` caches per `${repoPath}@${gitHeadShortSha}` for this
  reason (same key shape the existing `MolePanel`/`Surface` use for their own debounce timers, see
  `apps/vscode/src/paths.ts`'s `debounce` already used by both).

## 3. VS Code integration test tooling: `@vscode/test-electron` vs `wdio-vscode-service`

**Picked: `@vscode/test-electron`.** Official docs:
https://code.visualstudio.com/api/working-with-extensions/testing-extension (fetched 2026-10-29) and
npm https://www.npmjs.com/package/%40vscode/test-electron (fetched 2026-10-29):
- `runTests({ extensionDevelopmentPath, extensionTestsPath, launchArgs })` launches a real Extension
  Development Host, loads the extension under test, and runs a Mocha (or any) suite with full access to
  the live `vscode` API from inside that host — this is what GitLens', Copilot's and the official
  samples' own E2E suites use (it is the API `vscode-extension-samples/helloworld-test-sample` ships).
- It also exposes `resolveCliArgsFromVSCodeExecutablePath` / accepts `vscodeExecutablePath` directly, so
  an **already-installed** VS Code (`/Users/a1/Applications/Visual Studio Code.app`, version 1.141.1,
  confirmed present on this machine) can be reused instead of downloading a fresh copy — material given
  the ~2.6 GB free disk budget noted in the task contract.
- `wdio-vscode-service` wraps the same Extension Development Host behind WebdriverIO/Selenium for
  page-object-style DOM assertions; it adds a second test runner and a ChromeDriver dependency for a
  capability (CSS-selector queries into the webview iframe) `@vscode/test-electron` already gets for
  free via `executeCommand`/`workbench` internals plus a `postMessage` bridge from inside the webview
  script itself. Given disk/time budget and that GitLens/official samples standardize on
  `@vscode/test-electron`, it is the lower-risk, better-precedented choice here.
- m26.mjs therefore drives `@vscode/test-electron`'s `runTests` pointed at the installed VS Code binary,
  opens the Mole repo itself as the workspace, and an injected extensionTestsPath script dumps the
  webview DOM (webview content isn't reachable from the extension host directly — the injected script
  asks the view provider for its last-rendered model instead, which is equivalent to a DOM dump for
  presence-of-feature assertions and is also what the official samples' own tests do for the
  `colorsView` state: assert on the data the provider holds, not by digging into the iframe's shadow DOM
  from Node).

## 4. Non-blocking surfacing: `DiagnosticCollection` / UX guidelines

https://code.visualstudio.com/api/ux-guidelines/overview and
https://code.visualstudio.com/api/ux-guidelines/panel (fetched 2026-10-29):
- The Problems panel is the standard home for `vscode.languages.createDiagnosticCollection(...)`
  output: diagnostics are inherently non-blocking (they never steal focus or pop a dialog), appear in
  the gutter/Problems view, and are the guideline-sanctioned channel for "information about code the
  user didn't ask for right now." This matches T34's rules surface: `checkRules` (`@mole/decisions`)
  results become one `Diagnostic` per violation in a `mole-rules` collection, refreshed on save/cursor
  move, never a `showWarningMessage` popup.
- The guidelines' general rule for Activity Bar/Sidebar views (same page) is one view container per
  distinct capability, views grouped under it, and no modal interruption for passive information — the
  existing `mole.openMap` panel stays a separate, opt-in, editor-area webview (per the task boundary,
  untouched); the new `MolePanelView` is an always-present Activity Bar sidebar view precisely because
  that is the guideline-sanctioned "passive info here, not a popup" surface.

## Decision summary for T34

- Webview pattern: `WebviewViewProvider` + static HTML/JS shell + `postMessage`, exactly as the official
  sample and the existing `MolePanel` already do it.
- E2E tool: `@vscode/test-electron`, pointed at the already-installed VS Code app to avoid a second
  ~300 MB+ download on a ~2.6 GB-free disk.
- Non-blocking surface for rule violations: `vscode.languages.createDiagnosticCollection`, per the
  official UX guidelines' Problems-panel guidance.
