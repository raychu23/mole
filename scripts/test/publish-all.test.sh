#!/usr/bin/env bash
# scripts/test/publish-all.test.sh -- stub-based integration tests for scripts/publish-all.sh
#
# Stubs npm/npx/curl on PATH so no network call and no real publish ever happens. Every stub
# invocation's argv is logged, plus (for npx vsce/ovsx publish and npm publish --userconfig) the
# file mode / env vars actually seen, so we can prove:
#   (a) fake tokens never appear in any logged argv
#   (b) after a stubbed npm publish failure, the script's temp dir is gone and no file anywhere
#       under the test TMPDIR contains the fake token
#   (c) same, after SIGINT mid-run
#   (d) same, on the success path
#   (e) an already-published version is still detected and skipped (no token ever requested)
#
# Run: bash scripts/test/publish-all.test.sh
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$HERE/../.." && pwd)"
SCRIPT_UNDER_TEST="$REPO_ROOT/scripts/publish-all.sh"

TESTS_PASSED=0
TESTS_FAILED=0
ok()  { printf 'ok   - %s\n' "$1"; TESTS_PASSED=$((TESTS_PASSED + 1)); }
bad() { printf 'FAIL - %s\n' "$1"; TESTS_FAILED=$((TESTS_FAILED + 1)); }

FAKE_NPM_TOKEN="npm_fakeFEEDFACE00000000000000000011"
FAKE_VSCE_TOKEN="vsce-fake-PAT-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
FAKE_OVSX_TOKEN="ovsx-fake-PAT-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
export FAKE_NPM_TOKEN FAKE_VSCE_TOKEN FAKE_OVSX_TOKEN

REAL_MOLE_VERSION="$(node -p "require('$REPO_ROOT/release/mole-code/package.json').version")"
REAL_EXT_VERSION="$(node -p "require('$REPO_ROOT/apps/vscode/package.json').version")"
VSIX_PATH="$REPO_ROOT/apps/vscode/mole-code-map-$REAL_EXT_VERSION.vsix"
export VSIX_PATH

STATE_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/publish-all-test.XXXXXX")"
cleanup_all() { rm -rf "$STATE_ROOT"; rm -f "$VSIX_PATH"; }
trap cleanup_all EXIT

file_mode() { stat -f '%Lp' "$1" 2>/dev/null || stat -c '%a' "$1" 2>/dev/null; }

make_stub_bin() {
  local bin_dir="$1"
  mkdir -p "$bin_dir"

  cat > "$bin_dir/npm" <<'EOS'
#!/usr/bin/env bash
echo "npm $*" >> "$ARGV_LOG"
if [ "$1" = "run" ] && [ "$2" = "check" ]; then exit 0; fi
if [ "$1" = "run" ] && [ "$2" = "build" ]; then exit 0; fi
if [ "$1" = "run" ] && [ "$2" = "package" ]; then
  : > "$VSIX_PATH"
  exit 0
fi
if [ "$1" = "view" ]; then
  echo "${NPM_VIEW_VERSION:-}"
  exit 0
fi
if [ "$1" = "publish" ]; then
  prev=""
  for a in "$@"; do
    if [ "$prev" = "--userconfig" ] && [ -f "$a" ]; then
      mode="$(stat -f '%Lp' "$a" 2>/dev/null || stat -c '%a' "$a" 2>/dev/null)"
      workdir="$(dirname "$a")"
      wmode="$(stat -f '%Lp' "$workdir" 2>/dev/null || stat -c '%a' "$workdir" 2>/dev/null)"
      echo "NPMRC_MODE=$mode" >> "$ENV_LOG"
      echo "WORK_DIR_MODE=$wmode" >> "$ENV_LOG"
      if grep -qF "$FAKE_NPM_TOKEN" "$a" 2>/dev/null; then
        echo "NPMRC_HAS_TOKEN=yes" >> "$ENV_LOG"
      else
        echo "NPMRC_HAS_TOKEN=no" >> "$ENV_LOG"
      fi
    fi
    prev="$a"
  done
  case "${NPM_PUBLISH_BEHAVIOR:-success}" in
    fail) exit 1 ;;
    hang) sleep 30; exit 0 ;;
    *) exit 0 ;;
  esac
fi
exit 0
EOS

  cat > "$bin_dir/npx" <<'EOS'
#!/usr/bin/env bash
echo "npx $*" >> "$ARGV_LOG"
args="$*"
case "$args" in
  *"@vscode/vsce show"*)
    echo "${VSCE_SHOW_JSON:-{\"versions\":[{\"version\":\"0.0.0-not-published\"}]}}"
    exit 0 ;;
  *"@vscode/vsce publish"*)
    echo "VSCE_PAT_ENV=${VSCE_PAT:-<unset>}" >> "$ENV_LOG"
    exit "${NPX_VSCE_PUBLISH_EXIT:-0}" ;;
  *"ovsx create-namespace"*)
    exit 0 ;;
  *"ovsx publish"*)
    echo "OVSX_PAT_ENV=${OVSX_PAT:-<unset>}" >> "$ENV_LOG"
    exit "${NPX_OVSX_PUBLISH_EXIT:-0}" ;;
  *)
    exit 0 ;;
esac
EOS

  cat > "$bin_dir/curl" <<'EOS'
#!/usr/bin/env bash
echo "curl $*" >> "$ARGV_LOG"
case "$*" in
  *open-vsx.org/api*) echo "${OVSX_CURRENT_JSON:-{\"version\":\"0.0.0-not-published\"}}" ;;
  *registry.modelcontextprotocol.io*) echo "${MCP_REGISTRY_JSON:-{\"servers\":[]}}" ;;
  *) echo "" ;;
esac
exit 0
EOS

  chmod +x "$bin_dir/npm" "$bin_dir/npx" "$bin_dir/curl"
}

setup_case() {
  local name="$1"
  CASE_DIR="$STATE_ROOT/$name"
  mkdir -p "$CASE_DIR/tmp"
  make_stub_bin "$CASE_DIR/bin"
  ARGV_LOG="$CASE_DIR/argv.log"; : > "$ARGV_LOG"
  ENV_LOG="$CASE_DIR/env.log"; : > "$ENV_LOG"
  export ARGV_LOG ENV_LOG
  CASE_TMPDIR="$CASE_DIR/tmp"
}

# Common post-run assertions: the script's own temp dir must be fully gone, and the fake npm
# token must appear nowhere under the test TMPDIR tree nor in the logged argv of any stub call.
assert_clean() {
  local label="$1"
  if [ -z "$(ls -A "$CASE_TMPDIR" 2>/dev/null)" ]; then
    ok "$label: temp dir cleaned (nothing left under TMPDIR)"
  else
    bad "$label: temp dir NOT cleaned: $(ls -A "$CASE_TMPDIR" | tr '\n' ' ')"
  fi
  if grep -R -l -F "$FAKE_NPM_TOKEN" "$CASE_TMPDIR" >/dev/null 2>&1; then
    bad "$label: fake npm token found on disk under TMPDIR"
  else
    ok "$label: no fake npm token left on disk under TMPDIR"
  fi
  if grep -F "$FAKE_NPM_TOKEN" "$ARGV_LOG" >/dev/null 2>&1; then
    bad "$label: fake npm token leaked into logged argv"
  else
    ok "$label: fake npm token absent from logged argv"
  fi
}

run_script() {
  PATH="$CASE_DIR/bin:$PATH" TMPDIR="$CASE_TMPDIR" "$SCRIPT_UNDER_TEST" "$@"
}

# ---- (a) npm publish fails -----------------------------------------------------------------
setup_case "npm-fail"
export NPM_VIEW_VERSION=""
export NPM_PUBLISH_BEHAVIOR="fail"
run_script --skip-vsce --skip-ovsx --skip-mcp <<< "$FAKE_NPM_TOKEN" > "$CASE_DIR/stdout.log" 2>&1
rc=$?
[ "$rc" -ne 0 ] && ok "npm-fail: script exits non-zero on publish failure" || bad "npm-fail: script exited 0 despite publish failure"
assert_clean "npm-fail"
if grep -q "^NPMRC_MODE=600$" "$CASE_DIR/env.log" 2>/dev/null; then
  ok "npm-fail: npmrc was written mode 600"
else
  bad "npm-fail: npmrc was NOT mode 600 ($(grep NPMRC_MODE "$CASE_DIR/env.log" 2>/dev/null))"
fi
unset NPM_VIEW_VERSION NPM_PUBLISH_BEHAVIOR

# ---- (b) SIGINT mid-run ------------------------------------------------------------------
setup_case "sigint"
export NPM_VIEW_VERSION=""
export NPM_PUBLISH_BEHAVIOR="hang"
# `set -m` so the backgrounded script gets its own process group, distinct from this test
# harness's -- Ctrl-C in a real terminal signals the whole foreground process group (script +
# the npm child it's waiting on), so the test must reproduce that, not just signal the script's
# own PID (which a non-interactive bash can leave stuck waiting on its still-running child,
# never actually reacting to the delivered signal).
set -m
PATH="$CASE_DIR/bin:$PATH" TMPDIR="$CASE_TMPDIR" "$SCRIPT_UNDER_TEST" --skip-vsce --skip-ovsx --skip-mcp <<< "$FAKE_NPM_TOKEN" > "$CASE_DIR/stdout.log" 2>&1 &
PID=$!
for _ in $(seq 1 50); do
  grep -q '^npm publish' "$CASE_DIR/argv.log" 2>/dev/null && break
  sleep 0.2
done
kill -INT -- -"$PID" 2>/dev/null
wait "$PID" 2>/dev/null
rc=$?
set +m
[ "$rc" -ne 0 ] && ok "sigint: script exits non-zero after SIGINT" || bad "sigint: script exited 0 after SIGINT"
assert_clean "sigint"
unset NPM_VIEW_VERSION NPM_PUBLISH_BEHAVIOR

# ---- (c) success path --------------------------------------------------------------------
setup_case "success"
export NPM_VIEW_VERSION=""
export NPM_PUBLISH_BEHAVIOR="success"
run_script --skip-vsce --skip-ovsx --skip-mcp <<< "$FAKE_NPM_TOKEN" > "$CASE_DIR/stdout.log" 2>&1
rc=$?
[ "$rc" -eq 0 ] && ok "success: script exits 0 on successful publish" || bad "success: script exited $rc"
assert_clean "success"
unset NPM_VIEW_VERSION NPM_PUBLISH_BEHAVIOR

# ---- (d) already-published version is skipped, no token ever requested -------------------
setup_case "skip"
export NPM_VIEW_VERSION="$REAL_MOLE_VERSION"
run_script --skip-vsce --skip-ovsx --skip-mcp < /dev/null > "$CASE_DIR/stdout.log" 2>&1
rc=$?
[ "$rc" -eq 0 ] && ok "skip: script exits 0 for an already-published version" || bad "skip: script exited $rc"
if grep -q "already on npm -- skipping" "$CASE_DIR/stdout.log" 2>/dev/null; then
  ok "skip: printed the already-published skip message"
else
  bad "skip: did not print the already-published skip message"
fi
assert_clean "skip"
unset NPM_VIEW_VERSION

# ---- (e) vsce/ovsx tokens travel via env vars, never argv ---------------------------------
setup_case "vsce-ovsx-env"
export VSCE_SHOW_JSON='{"versions":[{"version":"0.0.0-not-published"}]}'
export OVSX_CURRENT_JSON='{"version":"0.0.0-not-published"}'
printf '%s\n%s\n' "$FAKE_VSCE_TOKEN" "$FAKE_OVSX_TOKEN" | run_script --skip-npm --skip-mcp > "$CASE_DIR/stdout.log" 2>&1
rc=$?
[ "$rc" -eq 0 ] && ok "vsce-ovsx-env: script exits 0" || bad "vsce-ovsx-env: script exited $rc"
if grep -F "$FAKE_VSCE_TOKEN" "$CASE_DIR/argv.log" >/dev/null 2>&1; then
  bad "vsce-ovsx-env: fake vsce token leaked into logged argv (-p on argv)"
else
  ok "vsce-ovsx-env: fake vsce token absent from logged argv"
fi
if grep -F "$FAKE_OVSX_TOKEN" "$CASE_DIR/argv.log" >/dev/null 2>&1; then
  bad "vsce-ovsx-env: fake ovsx token leaked into logged argv (-p on argv)"
else
  ok "vsce-ovsx-env: fake ovsx token absent from logged argv"
fi
if grep -F "VSCE_PAT_ENV=$FAKE_VSCE_TOKEN" "$CASE_DIR/env.log" >/dev/null 2>&1; then
  ok "vsce-ovsx-env: vsce token delivered via VSCE_PAT env var"
else
  bad "vsce-ovsx-env: VSCE_PAT env var not observed by npx"
fi
if grep -F "OVSX_PAT_ENV=$FAKE_OVSX_TOKEN" "$CASE_DIR/env.log" >/dev/null 2>&1; then
  ok "vsce-ovsx-env: ovsx token delivered via OVSX_PAT env var"
else
  bad "vsce-ovsx-env: OVSX_PAT env var not observed by npx"
fi
if grep -R -l -F "$FAKE_VSCE_TOKEN" "$CASE_TMPDIR" >/dev/null 2>&1 || grep -R -l -F "$FAKE_OVSX_TOKEN" "$CASE_TMPDIR" >/dev/null 2>&1; then
  bad "vsce-ovsx-env: a fake token was left on disk under TMPDIR"
else
  ok "vsce-ovsx-env: no fake token left on disk under TMPDIR"
fi
unset VSCE_SHOW_JSON OVSX_CURRENT_JSON

printf '\n%d passed, %d failed\n' "$TESTS_PASSED" "$TESTS_FAILED"
[ "$TESTS_FAILED" -eq 0 ]
