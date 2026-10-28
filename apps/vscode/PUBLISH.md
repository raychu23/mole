# Publishing Mole (Raymond: what only you can supply)

The package builds and installs on its own (`npm run package`, then `node scripts/install-check.mjs <vsix>`).
Nothing has been published. Publishing needs accounts, tokens and decisions that are yours. Never paste a token into a
chat; keep it in an environment variable or your password manager.

## Decisions to make first
1. **License.** There is no LICENSE file yet, so the package is built with `--skip-license`. Pick one (MIT or Apache-2.0
   are the usual choices for an extension), add `LICENSE` to `apps/vscode/` and the repo root. Open VSX asks for it.
2. **Public source repository.** Marketplace pages show a Repository link and rewrite the README screenshot from it.
   Give the URL as `MOLE_REPO_URL`. The repo must be public and must not contain `context/`, `generated data/`,
   `prototype/` or the chat archives (the root `.gitignore` already ignores `context`, `generated data`, `current data`,
   `training data`; `prototype/` is a rejected demo and should not ship).
3. **Name and publisher id.** Display name "Mole: Code Map", id `mole-code-map` (the plain name "Mole" is already used by a
   game-engine extension, and "CodeMap" / "Visual Code Map" exist). The publisher id in `package.json` (`mole`) is a placeholder.
4. **Screenshot.** `media/panel.png` shows file names from the hermes-agent ui-tui repo (MIT) and a full-window capture with the macOS menu bar, clock and an "Extension Development Host" title. Retake it, cropped to the editor, on a repo you are happy to show.
5. **Where the extension lives in the repo.** It is in `apps/vscode`, so `npm run package` passes the marketplace image and link base as `<repo>/raw/HEAD/apps/vscode` (only when `MOLE_REPO_URL` is set). If the repo layout changes, change it in `apps/vscode/scripts/package.mjs`. After publishing, open the listing and check the screenshot loads.

## VS Code Marketplace (VS Code, and the Microsoft builds)
1. Sign in at https://marketplace.visualstudio.com/manage with a Microsoft account and create a **publisher** (this is the publisher id).
2. In Azure DevOps create a **Personal Access Token**: Organization = all accessible organizations, scope **Marketplace → Manage**.
3. Build with your ids, then publish (first release as a pre-release is sensible):
   ```sh
   MOLE_PUBLISHER=<your-publisher-id> MOLE_REPO_URL=https://github.com/<you>/<repo> MOLE_PRERELEASE=1 npm run package -w @mole/vscode
   VSCE_PAT=<token> npx vsce publish --packagePath apps/vscode/mole-code-map-0.1.0.vsix
   ```

## Open VSX (Cursor, Windsurf, VSCodium, Gitpod and other VS Code forks)
1. Create an account at https://open-vsx.org (Eclipse Foundation login), sign the Publisher Agreement, create an access token.
2. Create the namespace once, then publish the same `.vsix`:
   ```sh
   npx ovsx create-namespace <your-publisher-id> -p <token>
   npx ovsx publish apps/vscode/mole-code-map-0.1.0.vsix -p <token>
   ```
3. Check which marketplace each fork uses at publish time (they change it); Open VSX is the default for VSCodium and was for
   Windsurf and Cursor when this was written. Forks on an older Electron than Node 22.13 show an explanatory message in the panel.

## Before every publish
- `npm run check` passes, `npm run package -w @mole/vscode`, `node apps/vscode/scripts/install-check.mjs apps/vscode/<vsix>` passes (clean profile).
- Bump `version` in `apps/vscode/package.json` and add a line to `CHANGELOG.md`.
- **Tested so far: macOS only** (VS Code 1.141, which runs Node 24). VS Code 1.101 to 1.122 (Node 22, the minimum the manifest allows) has not been run. Windows and Linux are untested: the daemon uses a Unix socket in `/tmp` on
  macOS/Linux and a named pipe on Windows. Say so in the listing, or test them first.
- Remote development (SSH, containers, WSL): the extension is marked `workspace`, so the daemon should run next to the files. Untested.

## Not part of the package
The `mole_map` tool for AI agents (`packages/mcp`) and the command line are not in the extension; they ship separately later.
