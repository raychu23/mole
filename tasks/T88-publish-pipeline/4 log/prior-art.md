# T88 prior art (official docs, fetched 2026-11-03/04)

- npm publish --provenance / trusted publishing: https://docs.npmjs.com/trusted-publishers/ and
  corroborating sources on the OIDC flow. Provenance needs a short-lived OIDC token the npm CLI
  exchanges with Sigstore's Fulcio authority; only GitHub Actions and GitLab CI issue that token today.
  "Publishing from a local machine ... fails because the CLI has no OIDC issuer to obtain a signing
  certificate from." => publish-all.sh only adds `--provenance` when `GITHUB_ACTIONS` and
  `ACTIONS_ID_TOKEN_REQUEST_URL` are both set (i.e. it is itself running inside GitHub Actions);
  Raymond's laptop run never gets it, and the script says so instead of failing silently.

- vsce (VS Code Marketplace) and ovsx (Open VSX): PUBLISH.md and apps/vscode/scripts/publish.sh (already
  in the repo, written against code.visualstudio.com/api/working-with-extensions/publishing-extension and
  github.com/eclipse/openvsx) document the hidden-prompt pattern reused here; publish-all.sh does not
  change those mechanics, only sequences them with the other three publish targets and the --dry-run gate.

- MCP registry server.json + mcp-publisher CLI: github.com/modelcontextprotocol/registry --
  docs/reference/server-json/generic-server-json.md (schema fields, `$schema` pinned to
  https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json), docs/modelcontextprotocol-io/
  quickstart.mdx (`mcp-publisher init/login/validate/publish`, name format `io.github.<user>/<name>`, the
  `mcpName` field in package.json must match server.json's `name`), docs/reference/cli/commands.md (exact
  command surface, token storage at ~/.config/mcp-publisher/token.json, `--token` only on `login github` for
  CI), docs/reference/server-json/official-registry-requirements.md (namespace auth, trusted registry base
  URLs, `_meta` restrictions). The CLI ships as a GitHub release binary (no npm package) -- publish-all.sh
  downloads `mcp-publisher_<os>_<arch>.tar.gz` into a throwaway temp dir and runs it from there, never
  installed globally, matching the boundary rule.

- GHCR / GitHub Actions Docker push: docs.github.com/en/actions/publishing-packages/publishing-docker-images
  -- the repo-scoped `GITHUB_TOKEN` is sufficient with a `packages: write` permission; no PAT needed.
  docker/login-action, docker/metadata-action and docker/build-push-action are the documented official
  actions for this flow.

- Schema validation: ajv + ajv-formats (draft-07, already resolved as transitive deps of
  @modelcontextprotocol/sdk and @fastify/ajv-compiler in this repo's own node_modules -- no new install)
  compiled against the fetched server.schema.json; this is what `--dry-run` runs instead of
  `mcp-publisher validate`/`publish` (scripts/ci/validate-server-json.mjs).

- actionlint: no Go binary on PATH, no npm package named `actionlint`, and the local Docker daemon is not
  running (`docker run rhysd/actionlint` failed to connect) -- per the task's fallback, the workflow is
  YAML-parsed and structurally checked instead (on/push.tags, jobs/steps shape, only `secrets.GITHUB_TOKEN`
  referenced, `packages: write` present).
