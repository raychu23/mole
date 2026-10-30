#!/usr/bin/env bash
# Runs after /speckit.implement: `mole check` on the working tree, filtered to the decisions this
# change touched (spec-kit constitution tenets + specs/*/research.md decisions + any ADR folders).
# Install: copy this file into your spec-kit project and call it from your agent's implement step,
# or wire it as a git post-commit hook. See ../README.md.
set -euo pipefail

MOLE_BIN="${MOLE_BIN:-mole}"
ADR_DIRS="${MOLE_ADR_DIRS:-}"

if ! command -v "$MOLE_BIN" >/dev/null 2>&1; then
  echo "post-implement: '$MOLE_BIN' not found on PATH (set MOLE_BIN=... or npm install -g the Mole daemon package)" >&2
  exit 1
fi

args=(check --worktree --spec-kit)
if [ -n "$ADR_DIRS" ]; then
  args+=(--adr-dir "$ADR_DIRS")
fi

"$MOLE_BIN" "${args[@]}" "$@"
