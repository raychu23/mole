#!/usr/bin/env bash
# T32 local proof of .github/workflows/mole-pr-check.yml + .github/actions/mole-check/action.yml (as T16 proved its CI):
# run the action's step commands in a clean clone of this branch with a fake pull_request event, gh stubbed on PATH so the
# check-run POST is captured to a file instead of sent. Never pushes, never calls GitHub.
# usage: bash packages/decisions/bench/m24-workflow-local.sh WORKTREE BASE HEAD OUTDIR
set -euo pipefail
WT="$1"; BASE="$2"; HEAD="$3"; OUT="$4"
mkdir -p "$OUT"
JOB="$(mktemp -d "${TMPDIR:-/tmp}/mole-wf-XXXXXX")"
trap 'rm -rf "$JOB"' EXIT
echo "## job workspace: fresh clone of $WT at $HEAD (actions/checkout fetch-depth: 0)"
git clone -q --no-hardlinks "$WT" "$JOB/repo"
git -C "$JOB/repo" checkout -q "$HEAD"
cd "$JOB/repo"
export GITHUB_WORKSPACE="$PWD" GITHUB_REPOSITORY="raymond/mole" RUNNER_TEMP="$JOB/runner-temp" GITHUB_EVENT_NAME=pull_request
mkdir -p "$RUNNER_TEMP" "$JOB/bin"
export GITHUB_EVENT_PATH="$JOB/event.json"
cat > "$GITHUB_EVENT_PATH" <<EOF
{"action":"synchronize","number":32,"pull_request":{"number":32,"base":{"sha":"$BASE","ref":"main"},"head":{"sha":"$HEAD","ref":"ledger/t32-team-pr-check"}}}
EOF
echo "## fake event: $(cat "$GITHUB_EVENT_PATH")"
# gh stub: records argv, env token presence and the --input body; prints a fake html_url like `--jq .html_url` would
cat > "$JOB/bin/gh" <<EOF
#!/usr/bin/env bash
echo "gh \$*" >> "$OUT/gh-calls.txt"
echo "GH_TOKEN set: \${GH_TOKEN:+yes}" >> "$OUT/gh-calls.txt"
prev=""; for a in "\$@"; do if [ "\$prev" = "--input" ]; then cp "\$a" "$OUT/check-run-post-body.json"; fi; prev="\$a"; done
echo "https://github.com/raymond/mole/runs/0"
EOF
chmod +x "$JOB/bin/gh"
export PATH="$JOB/bin:$PATH"
: > "$OUT/gh-calls.txt"
ACTION=.github/actions/mole-check/action.yml
# run each `run:` block of the composite action in order, with the step's env, as the runner would (bash -e)
node --input-type=module -e "
import { readFileSync, writeFileSync } from 'node:fs';
import { parse } from '$WT/node_modules/yaml/dist/index.js';
const a = parse(readFileSync('$ACTION', 'utf8'));
const steps = a.runs.steps.map((s, i) => ({ name: s.name, env: s.env ?? {}, run: s.run }));
writeFileSync('$JOB/steps.json', JSON.stringify(steps));
"
n=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$JOB/steps.json','utf8')).length)")
for i in $(seq 0 $((n-1))); do
  name=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$JOB/steps.json','utf8'))[$i].name)")
  node -e "
    const s = JSON.parse(require('fs').readFileSync('$JOB/steps.json','utf8'))[$i];
    const sub = (v) => String(v).replace(/\\$\{\{\s*inputs\.token\s*\}\}/g, 'fake-github-token').replace(/\\$\{\{\s*inputs\.records\s*\}\}/g, '.');
    let sh = '';
    for (const [k, v] of Object.entries(s.env)) sh += 'export ' + k + '=' + JSON.stringify(sub(v)) + '\n';
    sh += s.run;
    require('fs').writeFileSync('$JOB/step.sh', sh);
  "
  echo "## step $((i+1))/$n: $name"
  sed 's/^/   | /' "$JOB/step.sh"
  start=$(date +%s)
  set +e; bash -e "$JOB/step.sh" > "$JOB/step.log" 2>&1; rc=$?; set -e
  tail -15 "$JOB/step.log" | sed 's/^/   > /'
  echo "   (exit $rc, $(( $(date +%s) - start )) s)"
  [ "$rc" = 0 ] || exit "$rc"
done
echo "## gh calls (stub log)"; sed 's/^/   /' "$OUT/gh-calls.txt"
echo "## check runs POSTed: $(grep -c 'check-runs' "$OUT/gh-calls.txt")"
echo "## comment calls: $(grep -cE 'comment|/comments' "$OUT/gh-calls.txt" || true)"
