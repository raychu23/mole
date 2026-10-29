#!/usr/bin/env bash
# T15 done-when 4 proof: run the Claude Code plugin's hook scripts by hand on a fixture session diff (no ~/.claude install).
# Fixture: a throwaway git repo under $SCRATCH with a fix commit (reason comment + guarding test) and notes (one fresh, one
# stale, one out of play); the "session" re-edits the fix's line. Prints each hook's stdin and stdout.
#   bash "tasks/T15-surface-hover-and-agent-hooks/3 work/hooks-run.sh" > "tasks/T15-surface-hover-and-agent-hooks/4 log/hooks-run.txt"
set -euo pipefail
repo="$(cd "$(dirname "$0")/../../.." && pwd)"
cli="$repo/packages/daemon/dist/cli.js"
plugin="$repo/plugins/claude-code"
SCRATCH="${SCRATCH:-${TMPDIR:-/tmp}/mole-t15-hooks}"
rm -rf "$SCRATCH"; mkdir -p "$SCRATCH/repo/src" "$SCRATCH/repo/test" "$SCRATCH/data"
r="$SCRATCH/repo"
g() { git -C "$r" -c user.name=Fixture -c user.email=f@example.com -c commit.gpgsign=false "$@"; }
mole() { node --no-warnings "$cli" "$@" --root "$r" >/dev/null; }
g init -q -b main
printf 'export function c() {\n  return 3;\n}\n' > "$r/src/c.ts"; g add .; g commit -q -m 'add c'
mole note add src/c.ts#c 'NOTE-C old helper nobody touches'; g add .; g commit -q -m 'note on c'
printf 'export function a(x: number) {\n  return x * 2;\n}\n' > "$r/src/a.ts"; g add .; g commit -q -m 'add a'
printf 'export function a(x: number) {\n  // negative input must give 0: the caller sums these\n  if (x < 0) return 0;\n  return x * 2;\n}\n' > "$r/src/a.ts"
printf "import { a } from '../src/a';\nit('negative input gives 0', () => {\n  expect(a(-1)).toBe(0);\n});\n" > "$r/test/a.test.ts"
g add .; g commit -q -m 'fix: negative input returned a negative double'
printf 'export function b() {\n  return 1;\n}\n' > "$r/src/b.ts"
mole note add src/a.ts#a 'NOTE-A callers sum these, keep 0 for negatives'
mole note add src/b.ts#b 'NOTE-B returns one on purpose'
g add .; g commit -q -m 'add b + notes'
printf 'export function b() {\n  return 2;\n}\n' > "$r/src/b.ts"; g commit -q -am 'b returns two'

run() { # script, stdin json
  echo "\$ echo '$2' | node plugins/claude-code/scripts/$1.mjs"
  local out; out=$(echo "$2" | MOLE_BIN="$cli" CLAUDE_PLUGIN_ROOT="$plugin" CLAUDE_PLUGIN_DATA="$SCRATCH/data" node "$plugin/scripts/$1.mjs"); echo "exit=$?"
  if [ -n "$out" ]; then echo "$out" | node -e 'const j=JSON.parse(require("fs").readFileSync(0,"utf8"));console.log(JSON.stringify(j,null,1))'; else echo '(no output)'; fi
  echo
}
echo "# fixture: $(g log --oneline | wc -l | tr -d ' ') commits in a scratch repo; plugin $plugin"
g log --oneline
echo
echo '## 1. SessionStart (source startup)'
run session-start "{\"session_id\":\"s1\",\"cwd\":\"$r\",\"hook_event_name\":\"SessionStart\",\"source\":\"startup\"}"
echo '## 2. the session edits the fix line (if (x < 0) -> if (x <= 0)); Stop'
sed -i '' 's/x < 0/x <= 0/' "$r/src/a.ts"
echo '$ git diff'; g diff; echo
run stop "{\"session_id\":\"s1\",\"cwd\":\"$r\",\"hook_event_name\":\"Stop\",\"stop_hook_active\":false}"
echo '## 3. the session commits its edit; Stop still checks it (base = HEAD at SessionStart)'
g commit -q -am 'session commit: <= 0'
run stop "{\"session_id\":\"s1\",\"cwd\":\"$r\",\"hook_event_name\":\"Stop\",\"stop_hook_active\":false}"
echo '## 4. a new session that changes nothing: Stop is silent'
run session-start "{\"session_id\":\"s2\",\"cwd\":\"$r\",\"hook_event_name\":\"SessionStart\",\"source\":\"startup\"}"
run stop "{\"session_id\":\"s2\",\"cwd\":\"$r\",\"hook_event_name\":\"Stop\",\"stop_hook_active\":false}"
rm -rf "$SCRATCH"
