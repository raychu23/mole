#!/usr/bin/env bash
# T91-distribution-channels: runs the root action.yml's own steps locally, in order, without a GitHub Actions
# runner. `act` (nektos/act, the common local-runner tool) was tried first and is not installable in this
# environment (Homebrew Tier-3/Intel-macOS blocked it, no sudo available to fix /usr/local/share/man
# ownership) -- this script is the brief's documented fallback: "a script that runs its steps". It mirrors
# action.yml's three `runs.steps` literally; only the last step (the real `gh api` POST, which needs a live
# GITHUB_TOKEN + GITHUB_REPOSITORY inside an actual Actions run) is a dry-run print instead of a real call.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

echo "== step 1: build mole (action.yml 'build mole') =="
npm ci --no-audit --no-fund >/dev/null 2>&1 || true # already installed in a dev worktree; action.yml runs this fresh in CI
npx tsc -b
echo "tsc -b: ok"

echo "== step 2: mole pr-check (action.yml 'mole pr-check') =="
# `--records` resolves relative to the CLI's CWD, not --root (packages/decisions/src/check/index.ts: `resolve(records)`).
# In the real GitHub Actions run the checkout dir IS the CWD, so action.yml's default `--records .` is already
# correct there; here CWD stays the main repo (to run packages/daemon/dist/cli.js from this checkout), so we
# pass the synthetic repo's own path explicitly instead of '.'.
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
git -C "$work" init -q -b main
mkdir -p "$work/.mole/decisions" "$work/src"
printf 'export function foo(): number {\n  return 1;\n}\n' > "$work/src/a.ts"
cat > "$work/.mole/decisions/0001.md" <<'EOF'
---
id: '0001'
title: Foo returns one
status: accepted
scope:
  - src/a.ts#foo
---
EOF
echo '* @team/core' > "$work/CODEOWNERS"
git -C "$work" add -A
git -C "$work" -c user.name=T -c user.email=t@example.com -c commit.gpgsign=false commit -q -m base
base_sha=$(git -C "$work" rev-parse HEAD)
printf 'export function foo(): number {\n  return 2;\n}\n' > "$work/src/a.ts"
git -C "$work" -c user.name=T -c user.email=t@example.com -c commit.gpgsign=false commit -q -am 'change foo'
head_sha=$(git -C "$work" rev-parse HEAD)

event="$work/event.json"
node -e "require('fs').writeFileSync(process.argv[1], JSON.stringify({action:'synchronize', number:7, pull_request:{number:7, base:{sha:process.argv[2]}, head:{sha:process.argv[3]}}}))" "$event" "$base_sha" "$head_sha"

out="$work/mole-check-run.json"
node packages/daemon/dist/cli.js pr-check --event "$event" --root "$work" --records "$work" --out "$out"
echo "pr-check: wrote $out"
node -e "const p=require(process.argv[1]); if (p.name!=='mole') throw new Error('bad payload name'); if (!p.output.annotations.some(a=>a.title.includes('0001'))) throw new Error('missing governed-decision annotation'); console.log('payload check: ok (name=mole, annotates decision 0001)');" "$out"

echo "== step 3: post the check run (action.yml 'post the check run') =="
echo "DRY RUN (no live GITHUB_TOKEN/GITHUB_REPOSITORY here): would run"
echo "  gh api --method POST repos/\$GITHUB_REPOSITORY/check-runs --input $out --jq '.html_url'"
echo "payload is valid JSON for that call (checked above); the gh api call itself is NOT RUN -- it needs a real Actions run's token+repo, exactly what .github/workflows/action-self-test.yml exercises once this branch's checks run in GitHub Actions."

echo "== action-local.sh: all local steps passed =="
