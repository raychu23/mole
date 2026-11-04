## Summary

Extension bumped to 0.5.0; CHANGELOG lists T62 reasoning section + T73 what-if; honestly notes steering and newer reasoning inputs (T74-T81) have no sidebar UI yet.
vsix built; install-check passed on a scratch fixture (packages/reasoning, with one file renamed so the script's hardcoded revive-check path exists); full real-editor selftest ran with SKIP_SELFTEST=1.
`npm run build` (tsc -b) had to run first -- the worktree had no built dist/, so esbuild couldn't resolve @mole/* packages.
scripts/publish-all.sh: check gate -> build -> npm/vsce/ovsx/MCP-registry, each independently skippable, already-published versions detected via a plain version query.
`--provenance` is gated on actually running inside GitHub Actions (npm docs: it cannot work from a local machine, confirmed by prior-art fetch).
server.json validates against the official fetched schema with ajv (already a transitive repo dependency, no new install).
actionlint wasn't available (no binary, no npm package, Docker daemon down) so the workflow got the task's documented fallback: a structural YAML-parse check.

### 2026-11-03 review-fix pass (scripts/publish-all.sh)
CRITICAL fixed: `new_tmp_dir()` appended to the `TMP_DIRS` array inside a `$(...)` command
substitution (a subshell), so the parent shell's array stayed empty and the `trap cleanup EXIT`
deleted nothing -- a failed/interrupted publish left the temp `.npmrc` holding the real npm token
on disk, mode 644 (world/group readable). Replaced with one `umask 077; WORK=$(mktemp -d)` created
directly in the parent shell at the top of the script, every temp file (npmrc, MCP-publisher
download, schema fetch) now lives under `$WORK`, and a trap removes it on EXIT/INT/TERM/HUP. A
plain `trap cleanup INT TERM HUP` (no explicit `exit`) was verified to let bash finish the rest of
the publish steps after Ctrl-C instead of aborting, so the signal traps call `trap -` then `cleanup`
then `exit 130/143/129` explicitly. `NPM_TOKEN`/`VSCE_PAT`/`OVSX_PAT` are unset right after each use.
HIGH fixed: vsce/ovsx took their token via `-p "$TOKEN"` (visible in `ps` to any other local user).
Confirmed from upstream source (microsoft/vscode-vsce `src/main.ts`) and docs (eclipse-openvsx/openvsx
`cli/README.md`) that both tools read `VSCE_PAT` / `OVSX_PAT` env vars; switched to
`VSCE_PAT="$VSCE_PAT" npx ...` / `OVSX_PAT="$OVSX_PAT" npx ...`, scoped to the single command, never argv.
LOW fixed: added a note (in the script, right before `mcp-publisher login github`) and in
apps/vscode/PUBLISH.md that the MCP registry step's GitHub login must be the raychu23 account
(the registry name is `io.github.raychu23/mole-code`).
Also found and fixed in the same pass (blocking real use on this machine, not in the original
findings list): `PROVENANCE_ARGS=()` then `"${PROVENANCE_ARGS[@]}"` throws "unbound variable" under
`set -u` on plain bash 3.2 (macOS's `/bin/bash`, what `#!/usr/bin/env bash` resolves to here since
`/bin` precedes `/opt/local/bin` on PATH) even though the array was assigned empty, not unset.
Replaced with two explicit `npm publish` branches (with/without `--provenance`), no array.
Tests: `scripts/test/publish-all.test.sh`, a committed bash integration test with stub
npm/npx/curl on PATH (argv + relevant env vars logged to per-case files, no network, no real
npm/vsce/ovsx/curl ever invoked). Red run against the pre-fix script (`4 log/red.txt`): 10/24
assertions passed (only the already-published-skip path, which never touches the temp dir or a
token, was clean); 14 failed, reproducing the leaked temp dir + on-disk token + `-p` argv leak.
Green run against the fixed script (`4 log/green.txt`), reproduced twice: 24/24 passed -- fake
tokens never in logged argv, npmrc written mode 600, temp dir empty after a stubbed publish
failure/SIGINT/success, already-published skip unchanged, vsce/ovsx tokens observed arriving via
`VSCE_PAT`/`OVSX_PAT` env vars not argv. SIGINT test needed `set -m` + process-group `kill -INT -- -$PID`
in the harness (Ctrl-C in a real terminal hits the whole foreground process group, including the
npm child the script is waiting on; signaling only the script's own PID left a non-interactive bash
stuck waiting 30s on that child without ever running the INT trap -- a test-harness fix, not a
script bug). No token typed, echoed, stored, or published for real; no edits outside this worktree.
