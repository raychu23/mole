#!/usr/bin/env bash
# T91-distribution-channels review fix HIGH 3: proves .pre-commit-hooks.yaml's SHAPE (language: node,
# `additional_dependencies` providing the real `mole` bin, `entry: mole check --worktree`) actually works
# end-to-end via `pre-commit try-repo`, without needing a real npm publish or network access.
#
# Why this can't just run `pre-commit try-repo` against the repo unmodified: the real shipped
# .pre-commit-hooks.yaml pins `additional_dependencies: ["mole-code@0.5.0"]`, which needs the real npm
# registry (not published yet -- T85/T86 wait on Raymond's token). This script copies the repo's hook spec
# into a scratch dir and swaps ONLY that one version string for the LOCAL release tgz path -- same
# `additional_dependencies` mechanism `npm install` always supports (a tarball path is as valid an argument
# as a registry spec), so this proves the real mechanism, not a different one.
#
# Usage: bash scripts/test/pre-commit-local.sh
# Requires: a `pre-commit` on PATH (the venv at $PRE_COMMIT_VENV/bin/pre-commit, or system pre-commit) and
# the release tgz at $MOLE_RELEASE_TGZ (default: /Users/a1/.hermes/cache/scratch/mole-code-0.1.0.tgz, built
# by T88-publish-pipeline). NOT RUN here if either is missing -- this script says so and exits 1, never
# fabricates a pass.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TGZ="${MOLE_RELEASE_TGZ:-/Users/a1/.hermes/cache/scratch/mole-code-0.1.0.tgz}"
PRE_COMMIT="${PRE_COMMIT_BIN:-/Users/a1/.hermes/cache/scratch/mole-ab-venv/bin/pre-commit}"

if [ ! -x "$PRE_COMMIT" ]; then
  if command -v pre-commit >/dev/null 2>&1; then PRE_COMMIT="$(command -v pre-commit)"; else
    echo "NOT RUN: no pre-commit found (checked $PRE_COMMIT and PATH)"; exit 1
  fi
fi
if [ ! -f "$TGZ" ]; then
  echo "NOT RUN: release tgz not found at $TGZ (set MOLE_RELEASE_TGZ)"; exit 1
fi

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# A scratch copy of ONLY what language: node's install_environment needs to see at the hook-repo root: the
# real .pre-commit-hooks.yaml (version string swapped for the local tgz path) plus the SAME root
# package.json this repo ships (private, no bin -- proving the fix tolerates that file, doesn't require
# removing it) and a .git dir (install_environment only attempts `git+file://` when prefix.exists('.git')
# AND prefix.exists('package.json') -- matching the real repo's layout exactly, not a simplified one).
HOOK_REPO="$WORK/hook-repo"
mkdir -p "$HOOK_REPO"
sed "s#mole-code@0.5.0#$TGZ#" "$REPO_ROOT/.pre-commit-hooks.yaml" > "$HOOK_REPO/.pre-commit-hooks.yaml"
cp "$REPO_ROOT/package.json" "$HOOK_REPO/package.json"
git -C "$HOOK_REPO" init -q -b main
git -C "$HOOK_REPO" -c user.name=T -c user.email=t@example.com add -A
git -C "$HOOK_REPO" -c user.name=T -c user.email=t@example.com commit -q -m scratch

# A scratch target repo with one governed line + one staged edit to it, so the hook has something real to
# flag (not just "ran without crashing").
TARGET="$WORK/target-repo"
mkdir -p "$TARGET/.mole/decisions" "$TARGET/src"
git -C "$TARGET" init -q -b main
cat > "$TARGET/.mole/decisions/0001.md" <<'EOF'
---
id: '0001'
title: Use integer cents for money
status: accepted
scope:
  - src/money.ts
---

## Decision

Store money as integer cents, never floats.
EOF
printf 'export const priceCents = 100;\n' > "$TARGET/src/money.ts"
git -C "$TARGET" -c user.name=T -c user.email=t@example.com add -A
git -C "$TARGET" -c user.name=T -c user.email=t@example.com commit -q -m base
printf 'export const priceCents = 150;\n' > "$TARGET/src/money.ts"
git -C "$TARGET" -c user.name=T -c user.email=t@example.com add -A

echo "== pre-commit try-repo against the scratch hook repo (same shape as .pre-commit-hooks.yaml) =="
cd "$TARGET"
"$PRE_COMMIT" try-repo "$HOOK_REPO" mole-check --verbose
echo "== exit 0: the node-language hook installed the tgz's real 'mole' bin and ran it =="
