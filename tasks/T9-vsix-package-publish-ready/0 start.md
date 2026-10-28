---
state: submitted
owner: unclaimed
repo: /Users/a1/Desktop/CS Code/Project/Mole
branch: ledger/t9-vsix-package-publish-ready
worktree: /Users/a1/Desktop/CS Code/Project/Mole-worktrees/T9-vsix-package-publish-ready
base: be7097f
reviewer:
updated: 2026-10-27 19:16
status: ledger submitted
next: fresh reviewer → ledger move <task> verified --reviewer … --findings …
claimed: 2026-10-27 18:51
---
```notes
T9-vsix-package-publish-ready      ledger task (rules.md §3 code features)      project tasks
    goal                    Make Mole installable in one step as a self-contained VS Code extension (.vsix, no repo checkout, no developer command) and ready to publish to the VS Code Marketplace and Open VSX (Cursor, Windsurf, VSCodium); do NOT publish (publisher accounts, tokens and license are Raymond's)
    done-when               1) one command builds apps/vscode/mole-<version>.vsix containing the extension, the webview, the daemon + index worker and TypeScript's lib files, no node_modules needed; 2) the vsix installs into a CLEAN VS Code profile (own --user-data-dir and --extensions-dir) and the selftest-style check passes there: panel opens, map renders for a TS repo, a node click lands, using only files from the installed extension; 3) the extension stays silent (no auto-open panel, no daemon) in a workspace with no TypeScript; 4) the daemon exits by itself after an idle period (setting mole.idleMinutes, default 30) and the extension restarts it on next use; 5) clear message when the host Node is too old for node:sqlite (Cursor/Windsurf older builds) instead of a crash; 6) marketplace-ready files: extension README in plain words with a screenshot, CHANGELOG, icon, privacy line (local only, no network, no telemetry), engines.vscode set to the first build with Node >=22.13, publish steps in apps/vscode/PUBLISH.md listing exactly what Raymond must supply; 7) npm run check passes
    status                  2026-10-27 submitted      report: mole-code-map-0.1.0.vsix (3.1 MB) builds with npm run package, clean-profile install check passes: silent withou
    next                    fresh reviewer → ledger move <task> verified --reviewer … --findings …
    pinned
    mode                    code
    boundary                apps/vscode/** (package.json, esbuild.mjs, src, scripts, README.md, CHANGELOG.md, PUBLISH.md, media/, .vscodeignore), packages/daemon/src (idle shutdown only), packages/daemon/test
    checks                  npm run check
    non-goals               no publishing, no accounts, no license choice, no telemetry, no new product features, no JetBrains/other IDE ports
    proof                   vsix clean-profile install log + selftest run against the installed extension + npm run check
    stop                    needs a publisher account/token/license decision to proceed (those are Raymond's)
    came from               USER 2026-10-27 'one-click install i guess, publicly available too on vscode extensions or other ide extensions marketplace'
    links                   4 log/ledger.md (every transition + its evidence)
    harness                 any
```
