```notes
T15 insights (assumptions, choices, limits)                                    2026-10-29 worker (Hermes subagent)

assumption   "daemon not running -> hover shows nothing" (done-when 6): the hover pings the repo's daemon before answering and
             returns nothing when it is down; a refresh with the daemon down clears the gutter marks; an editor switch re-pings
             (one socket call) so marks do not outlive the daemon. The check itself needs only git (mole check --worktree), so
             gating on the daemon is a contract choice, not a technical need.
assumption   hover data = `mole check --worktree --json` + `mole memory --json`, run as CLI child processes with the editor's Node
             (ELECTRON_RUN_AS_NODE), refreshed after the daemon boots, on save (800 ms debounce) and on window focus. Not on every
             keystroke: an unsaved edit is not in the check until saved.
choice       "opening the commit/file on click": mole.showCommit opens `git show --stat --patch <sha>` and mole.openAt opens the
             file AS OF the fix commit (`git show sha:file`) at the source line, both as read-only mole-git: documents. The
             working file opens only when git fails. Hover links are limited to these two commands (isTrusted.enabledCommands).
choice       note end lines come from VS Code document symbols (MemoryEntry has only the start line); no symbol provider =
             the note marks its first line only.
choice       the since list sits in its own #since container under the map (body flex column, max 35% height); empty state
             text when nothing is recorded. Rows open path:line through the panel's existing 'open' message.
limit        hover-check "clicks" a link by executing the exact command + args parsed from the hover markdown: a real mouse
             click on a hover link cannot be driven through the extension API. Popups counted by wrapping
             vscode.window.show*Message in the extension host (patched: true in both runs).
limit        the "revive the daemon on an index-unavailable map" path is off under MOLE_HOVER_CHECK (as under MOLE_SELFTEST), so
             the down case measures the hover, not the panel restarting the daemon. In normal use an editor switch can restart
             the daemon, after which hovers come back on the next refresh.
limit        Claude Code plugin is tested by running its scripts with fixture stdin JSON (vitest + 3 work/hooks-run.sh), never
             installed into a real ~/.claude. Stop informs (systemMessage), never blocks; MOLE_STOP_CONTINUE=1 also hands the
             questions to Claude. CLI lookup: MOLE_BIN, `mole` on PATH, then packages/daemon/dist/cli.js in the repo or beside
             the plugin.
proof        4 log/hover-check-dev.json, 4 log/hover-check-vsix.json (8/8 checks each), 4 log/selftest-vsix-summary.json (T9
             selftest on the vsix, screenshots in generated data/t15-panel*.png, gitignored), 4 log/hooks-run.txt, runs.jsonl.
no test/key edits after the red commit (key-changes.md unchanged).
```
