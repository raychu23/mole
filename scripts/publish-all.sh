#!/usr/bin/env bash
# scripts/publish-all.sh -- builds mole-code + the VS Code extension, then publishes to npm, the
# VS Code Marketplace, Open VSX and the MCP registry. Every publish step is independently skippable;
# already-published versions are detected and skipped automatically. Tokens are only ever read from
# a hidden `read -s` prompt, held in a shell variable just long enough to use, then unset; the npm
# token touches disk only as a mode-600 file inside one private (mode 700, umask 077) temp dir
# created once at the top of the script and removed by a trap on EXIT/INT/TERM/HUP no matter how
# the script ends (success, publish failure, or Ctrl-C mid-run) -- never echoed, never written to a
# permanent file, never passed on the command line (vsce/ovsx get their tokens via the VSCE_PAT /
# OVSX_PAT env vars they document, scoped to a single command, not `-p`, which is visible to any
# other local user via `ps`).
#
# The MCP registry publish step (step 6) must be run logged in to GitHub as the raychu23 account --
# see the note printed just before `mcp-publisher login github`, and apps/vscode/PUBLISH.md.
#
#   scripts/publish-all.sh [--dry-run] [--skip-check] [--skip-npm] [--skip-vsce] [--skip-ovsx] [--skip-mcp]
#
# --dry-run runs every step except the final publish calls: `npm publish --dry-run` instead of
# `npm publish`, `vsce package` (already done by the build step) instead of `vsce publish`/`ovsx publish`,
# and server.json schema validation instead of `mcp-publisher publish`. No token is requested in --dry-run.
#
# --skip-check skips the `npm run check` gate and is only accepted together with --dry-run (a real
# publish always runs the full check first).
#
# Prior art (fetched + dated 2026-11-03, see tasks/T88-publish-pipeline/4 log/prior-art.md):
#   npm provenance / trusted publishing: docs.npmjs.com/trusted-publishers, requires a GitHub Actions/
#     GitLab CI OIDC token -- cannot be produced from a local machine, so --provenance is only added
#     when this script detects it is itself running inside GitHub Actions.
#   vsce / Marketplace: code.visualstudio.com/api/working-with-extensions/publishing-extension
#   ovsx: github.com/eclipse/openvsx/tree/master/cli
#   MCP registry server.json + mcp-publisher: github.com/modelcontextprotocol/registry (quickstart.mdx,
#     reference/cli/commands.md, reference/server-json/*.md)
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

DRY_RUN=0
SKIP_CHECK=0
SKIP_NPM=0
SKIP_VSCE=0
SKIP_OVSX=0
SKIP_MCP=0

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --skip-check) SKIP_CHECK=1 ;;
    --skip-npm) SKIP_NPM=1 ;;
    --skip-vsce) SKIP_VSCE=1 ;;
    --skip-ovsx) SKIP_OVSX=1 ;;
    --skip-mcp) SKIP_MCP=1 ;;
    -h|--help)
      sed -n '2,20p' "$0"
      exit 0
      ;;
    *)
      echo "unknown argument: $arg" >&2
      exit 2
      ;;
  esac
done

if [ "$SKIP_CHECK" = "1" ] && [ "$DRY_RUN" != "1" ]; then
  echo "refusing: --skip-check is only accepted together with --dry-run (a real publish always checks first)" >&2
  exit 2
fi

# ---- one private temp dir for the whole run, removed no matter how the script exits -----------
# A single mktemp -d in THIS (parent) shell, not inside a helper called via $(...) -- a command
# substitution runs in a subshell, so anything a helper appended to an array there would vanish
# the moment the subshell exited, leaving the real (parent-shell) array empty and the EXIT trap
# with nothing to delete. umask 077 first so the dir (and every file written under it, e.g. the
# npmrc holding the real npm token) is created private (dir 700, plain files 600) from birth,
# with no window where it's briefly world/group readable.
umask 077
WORK="$(mktemp -d "${TMPDIR:-/tmp}/mole-publish-all.XXXXXX")"
cleanup() { rm -rf "$WORK"; }
trap cleanup EXIT
# A plain `trap cleanup INT TERM HUP` without an explicit exit would run cleanup and then bash
# would carry on executing the *next* step (vsce/ovsx/MCP publish) instead of stopping -- Ctrl-C
# on the npm step must abort the whole run, not skip ahead. Disable the traps first so cleanup
# doesn't double-fire via the EXIT trap below, then exit with the conventional 128+signal code.
on_signal() {
  local sig="$1"
  trap - EXIT INT TERM HUP
  cleanup
  case "$sig" in
    INT) exit 130 ;;
    TERM) exit 143 ;;
    HUP) exit 129 ;;
    *) exit 1 ;;
  esac
}
trap 'on_signal INT' INT
trap 'on_signal TERM' TERM
trap 'on_signal HUP' HUP

hidden_prompt() {
  # usage: hidden_prompt "prompt text" VARNAME
  local prompt="$1" varname="$2" value
  printf '%s' "$prompt" >&2
  stty -echo 2>/dev/null || true
  IFS= read -r value
  stty echo 2>/dev/null || true
  printf '\n' >&2
  printf -v "$varname" '%s' "$value"
}

say() { printf '\n=== %s ===\n' "$1"; }

# ---- 1. npm run check gate ---------------------------------------------------------------------
say "1/5 npm run check"
if [ "$DRY_RUN" = "1" ] && [ "$SKIP_CHECK" = "1" ]; then
  echo "skipped (--dry-run --skip-check)"
else
  npm run check
fi

# ---- 2. build: mole-code + the vsix -------------------------------------------------------------
say "2/5 build mole-code + vsix"
(cd release/mole-code && npm run build)
npm run package -w @mole/vscode
VSIX="$(ls apps/vscode/mole-code-map-*.vsix | sort -V | tail -1)"
echo "vsix: $VSIX ($(du -h "$VSIX" | cut -f1))"

MOLE_CODE_VERSION="$(node -p "require('./release/mole-code/package.json').version")"
EXT_NAME="raychu23.mole-code-map"
EXT_VERSION="$(node -p "require('./apps/vscode/package.json').version")"

# ---- 3. npm publish mole-code --------------------------------------------------------------------
say "3/5 npm publish mole-code@$MOLE_CODE_VERSION"
if [ "$SKIP_NPM" = "1" ]; then
  echo "skipped (--skip-npm)"
else
  ALREADY="$(npm view "mole-code@$MOLE_CODE_VERSION" version 2>/dev/null || true)"
  if [ "$ALREADY" = "$MOLE_CODE_VERSION" ]; then
    echo "mole-code@$MOLE_CODE_VERSION is already on npm -- skipping"
  elif [ "$DRY_RUN" = "1" ]; then
    (cd release/mole-code && npm publish --dry-run)
  else
    NPM_TOKEN=""
    hidden_prompt "npm token (hidden, Enter to skip npm publish): " NPM_TOKEN
    if [ -z "$NPM_TOKEN" ]; then
      echo "no token entered -- skipping npm publish"
    else
      NPMRC="$WORK/.npmrc"
      printf '//registry.npmjs.org/:_authToken=%s\n' "$NPM_TOKEN" > "$NPMRC"
      chmod 600 "$NPMRC"
      unset NPM_TOKEN
      # No array of optional flags here: an empty array expanded as "${arr[@]}" under `set -u`
      # throws "unbound variable" on the plain bash 3.2 that ships as /bin/bash on macOS (the
      # /usr/bin/env bash this script's shebang resolves to, if /bin comes first on PATH) even
      # though the array was assigned empty, not unset. Two plain branches sidestep that instead.
      if [ -n "${GITHUB_ACTIONS:-}" ] && [ -n "${ACTIONS_ID_TOKEN_REQUEST_URL:-}" ]; then
        (cd release/mole-code && npm publish --userconfig "$NPMRC" --provenance)
      else
        echo "note: npm provenance needs a GitHub Actions/GitLab CI OIDC token (docs.npmjs.com/trusted-publishers, fetched 2026-11-03) -- not available on this machine, publishing without --provenance"
        (cd release/mole-code && npm publish --userconfig "$NPMRC")
      fi
      rm -f "$NPMRC"
    fi
  fi
fi

# ---- 4. vsce publish (VS Code Marketplace) -------------------------------------------------------
say "4/5 vsce publish $EXT_NAME@$EXT_VERSION"
if [ "$SKIP_VSCE" = "1" ]; then
  echo "skipped (--skip-vsce)"
else
  MARKET_VERSION="$(npx --yes @vscode/vsce show "$EXT_NAME" --json 2>/dev/null | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{console.log(JSON.parse(d).versions[0].version)}catch{process.exit(1)}})" 2>/dev/null || true)"
  if [ "$MARKET_VERSION" = "$EXT_VERSION" ]; then
    echo "$EXT_NAME@$EXT_VERSION is already on the Marketplace -- skipping"
  elif [ "$DRY_RUN" = "1" ]; then
    echo "dry-run: vsix already packaged at $VSIX (vsce package ran as part of the build step); not uploading"
  else
    VSCE_PAT=""
    hidden_prompt "VS Code Marketplace token (hidden, Enter to skip): " VSCE_PAT
    if [ -z "$VSCE_PAT" ]; then
      echo "no token entered -- skipping vsce publish"
    else
      # Env var scoped to this one command, not -p "$VSCE_PAT" on argv (visible to any other
      # local user via `ps`); @vscode/vsce documents VSCE_PAT as its token env var.
      VSCE_PAT="$VSCE_PAT" npx --yes @vscode/vsce publish --packagePath "$VSIX"
      unset VSCE_PAT
    fi
  fi
fi

# ---- 5. ovsx publish (Open VSX) --------------------------------------------------------------------
say "5/5 ovsx publish $EXT_NAME@$EXT_VERSION"
if [ "$SKIP_OVSX" = "1" ]; then
  echo "skipped (--skip-ovsx)"
else
  OVSX_VERSION="$(curl -fsSL "https://open-vsx.org/api/raychu23/mole-code-map" 2>/dev/null | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{console.log(JSON.parse(d).version)}catch{process.exit(1)}})" 2>/dev/null || true)"
  if [ "$OVSX_VERSION" = "$EXT_VERSION" ]; then
    echo "raychu23.mole-code-map@$EXT_VERSION is already on Open VSX -- skipping"
  elif [ "$DRY_RUN" = "1" ]; then
    echo "dry-run: vsix already packaged at $VSIX; not uploading to Open VSX"
  else
    OVSX_PAT=""
    hidden_prompt "Open VSX token (hidden, Enter to skip): " OVSX_PAT
    if [ -z "$OVSX_PAT" ]; then
      echo "no token entered -- skipping ovsx publish"
    else
      # Env var scoped to each command, not -p "$OVSX_PAT" on argv (visible to any other local
      # user via `ps`); ovsx documents OVSX_PAT as its token env var.
      OVSX_PAT="$OVSX_PAT" npx --yes ovsx create-namespace raychu23 || echo "(namespace probably exists already)"
      OVSX_PAT="$OVSX_PAT" npx --yes ovsx publish "$VSIX"
      unset OVSX_PAT
    fi
  fi
fi

# ---- 6. MCP registry (server.json) -----------------------------------------------------------------
say "6/6 MCP registry: server.json"
if [ "$SKIP_MCP" = "1" ]; then
  echo "skipped (--skip-mcp)"
else
  SERVER_NAME="$(node -p "require('./server.json').name")"
  SERVER_VERSION="$(node -p "require('./server.json').version")"
  REGISTRY_VERSION="$(curl -fsSL "https://registry.modelcontextprotocol.io/v0/servers?search=$SERVER_NAME" 2>/dev/null | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{const j=JSON.parse(d);const s=(j.servers||[]).find(s=>s.name===process.env.SERVER_NAME);console.log(s?s.version:'')}catch{process.exit(1)}})" 2>/dev/null || true)"
  if [ -n "$REGISTRY_VERSION" ] && [ "$REGISTRY_VERSION" = "$SERVER_VERSION" ]; then
    echo "$SERVER_NAME@$SERVER_VERSION is already in the MCP registry -- skipping"
  elif [ "$DRY_RUN" = "1" ]; then
    SCHEMA_DIR="$WORK/schema"
    mkdir -p "$SCHEMA_DIR"
    SCHEMA="$SCHEMA_DIR/server.schema.json"
    curl -fsSL "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json" -o "$SCHEMA"
    node "$REPO_ROOT/scripts/ci/validate-server-json.mjs" "$SCHEMA" "$REPO_ROOT/server.json"
  else
    MCP_DIR="$WORK/mcp"
    mkdir -p "$MCP_DIR"
    OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
    ARCH="$(uname -m | sed 's/x86_64/amd64/;s/aarch64/arm64/')"
    echo "downloading mcp-publisher (${OS}_${ARCH}) into $MCP_DIR (never installed globally)"
    curl -fsSL "https://github.com/modelcontextprotocol/registry/releases/latest/download/mcp-publisher_${OS}_${ARCH}.tar.gz" | tar xz -C "$MCP_DIR" mcp-publisher
    "$MCP_DIR/mcp-publisher" validate "$REPO_ROOT/server.json"
    echo "logging in to the MCP registry with GitHub (documented device-code flow -- opens a browser, no token typed here)"
    echo "note: the GitHub login must be the raychu23 account -- the registry name io.github.raychu23/mole-code requires owning that account; logging in as any other account will fail the publish below"
    "$MCP_DIR/mcp-publisher" login github
    "$MCP_DIR/mcp-publisher" publish "$REPO_ROOT/server.json"
  fi
fi

say "done"
echo "vsix: $VSIX"
echo "mole-code: $MOLE_CODE_VERSION  extension: $EXT_NAME@$EXT_VERSION  mcp server.json: $(node -p "require('./server.json').name")@$(node -p "require('./server.json').version")"
