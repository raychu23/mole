## Summary

Extension bumped to 0.5.0; CHANGELOG lists T62 reasoning section + T73 what-if; honestly notes steering and newer reasoning inputs (T74-T81) have no sidebar UI yet.
vsix built; install-check passed on a scratch fixture (packages/reasoning, with one file renamed so the script's hardcoded revive-check path exists); full real-editor selftest ran with SKIP_SELFTEST=1.
`npm run build` (tsc -b) had to run first -- the worktree had no built dist/, so esbuild couldn't resolve @mole/* packages.
scripts/publish-all.sh: check gate -> build -> npm/vsce/ovsx/MCP-registry, each independently skippable, already-published versions detected via a plain version query.
Tokens only ever come from a hidden `read -s` into a temp npmrc/temp dir, cleaned up by a trap on exit; no token typed, echoed, or stored.
`--provenance` is gated on actually running inside GitHub Actions (npm docs: it cannot work from a local machine, confirmed by prior-art fetch).
server.json validates against the official fetched schema with ajv (already a transitive repo dependency, no new install).
actionlint wasn't available (no binary, no npm package, Docker daemon down) so the workflow got the task's documented fallback: a structural YAML-parse check.
