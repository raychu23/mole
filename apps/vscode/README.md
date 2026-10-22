# Mole for VS Code (T2 / plan M1)

An always-on map panel beside the code: it follows the file you have open and shows its ranked neighbourhood
(what it defines, who calls it, what it calls, who imports it; at most 25 nodes, the rest as "+N more").
Click a node to open `file:line`. **Impact** highlights everything that calls into the file. Facts come from the
TypeScript compiler index (`packages/indexer`) served by a per-repo daemon (`packages/daemon`); no LLM call.

## Run it (development)

```sh
npm install && npm run build && npm run bundle          # repo root
code --extensionDevelopmentPath "$PWD/apps/vscode" /path/to/a/typescript/repo
```

The extension starts (or finds) the repo's daemon, opens the panel in a locked right-hand group at 50% width and
restores it on reload. Settings: `mole.tsconfig`, `mole.srcDir`, `mole.stateDir`, `mole.daemonCli`, `mole.autoOpen`.
The daemon keeps its lock and graph in `<git common dir>/mole` (set `MOLE_STATE_DIR` / `mole.stateDir` for a read-only repo).

Commands: *Mole: Open map beside the code*, *Toggle impact view*, *Re-index repository*.

## Proof

`node scripts/selftest.mjs` launches a separate VS Code window on a scratch copy of the ui-tui fixture, switches through
40 files, records warm file-switch latency inside the real webview, screenshots the panel (ok / index unavailable /
restored after relaunch) and writes `generated data/m1-latency.json`.

## Known limits

- The daemon outlives the editor on purpose (shared by every window of the repo); there is no idle shutdown yet.
- The extension finds the daemon CLI next to itself in the repo (`../../packages/daemon/dist/cli.js`) or via `mole.daemonCli`; it is not packaged as a .vsix.
- TypeScript only (the indexer is the TypeScript compiler API).
