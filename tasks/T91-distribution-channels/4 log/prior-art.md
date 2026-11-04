```notes
T91-distribution-channels      prior art (fetched + dated, newest first)      tasks/T91-distribution-channels

## Summary
What: dated, primary sources for every distribution channel researched for channels.md. What's open: PulseMCP
and Smithery submissions were paused/sunsetting at fetch time (see below) — re-check before using either.

## Sources (newest first by fetch/publish date)

- 2026-11-04 (fetched). Smithery docs, Publish: smithery.ai/docs/build/publish — publish flow is URL-based
  (streamable HTTP) or MCPB bundle; a `smithery.yaml` at repo root with `runtime: "typescript"` auto-detects
  the config schema; `target: "local"` registers a CLI-installable server for discovery without hosting.
  Cross-check (agentopsguide.com/smithery-vs-glama-vs-official-mcp-registry, dated "after October 31, 2026"):
  Smithery's HOSTING ends 2026-10-31 after the Arcade.dev acquisition (2026-08-05); browsing/listing may still
  work, but the hosted-connection pathway promised in docs above is being wound down -- verify current state
  before relying on Smithery hosting.
- 2026-10-20 (captured). agentopsguide.com/smithery-vs-glama-vs-official-mcp-registry — registry size
  snapshot: Smithery 20,784 listings, Glama 106,279 servers + 33,925 remote connectors, official MCP registry
  45,863 active entries. Official registry requires namespace proof (GitHub/DNS/HTTP); Glama does a sandbox
  build + behavior scan; official registry does no scanning by design.
- 2026-10-17 (checked). plugandship.dev/guides/where-to-submit-mcp-server — submission order recommendation:
  official MCP Registry first (Glama ingests it; PulseMCP said it would pick up registry entries once its
  own submissions reopen), then Glama, then Smithery, then mcp.so. PulseMCP's submit page was PAUSED with no
  reopening date as of this check — do not count on a PulseMCP listing landing soon.
- 2026-07-14 (published). thinkneo.ai/blog/mcp-registries-compared-20260714 — Glama largest by index (~37.8k
  servers then, tiered Official/Claimed/anonymous-crawl, ~6,000 hosted connectors, self-reported 1M+ tool
  calls/month across 50k+ developers mid-2026); PulseMCP ~1,200+ editorially curated (highest bar, most
  selective); mcp.so ~10,000+ broad/basic. Recommended order: official registry -> PulseMCP (if accepted) ->
  Smithery -> mcp.so.
- (no date on page, verified live 2026-11-04). docs.docker.com/ai/mcp-catalog-and-toolkit/catalog + Docker
  blog "Docker MCP Catalog" — submission via PR to github.com/docker/mcp-registry; CONTRIBUTING.md: add a
  `servers/<name>/server.yaml` (generate with `task wizard` or `task create -- --category <cat> <github-url>`
  from a repo with a Dockerfile); for a stdio/local server Docker builds+signs the image after review (merged
  PRs usually live within 24h in Docker Desktop's MCP Toolkit, hub.docker.com/mcp, and the catalog); for a
  REMOTE server over streamable HTTP, the directory is just `server.yaml` (type: remote, no Dockerfile) +
  empty `tools.json` + `readme.md` linking docs — this is the path that fits Mole's local-stdio-only MCP
  today only if we add an HTTP transport (see below); needs a real PR + Docker team review (their account
  gate), so this is a "needs Raymond" checklist item, but the file can be drafted now.
- (live, checked 2026-11-04). cursor.com/docs/mcp/install-links — one-click install deeplink format:
  `cursor://anysphere.cursor-deeplink/mcp/install?name=$NAME&config=$BASE64_ENCODED_CONFIG` where config is
  the same JSON object Cursor's `.cursor/mcp.json` server entry would use, base64-encoded. No auth/account
  needed to construct or test the link's base64 payload (decode locally to verify); actually clicking it
  requires Cursor installed, not tested here (NOT RUN: no Cursor app in this environment).
- (live, checked 2026-11-04). VS Code "Add to VS Code" install URL pattern, confirmed via
  support.atlassian.com's own worked example: `https://insiders.vscode.dev/redirect/mcp/install?name=<name>
  &config=<url-encoded-json>` (stable `vscode.dev` host works too; `insiders.vscode.dev` targets VS Code
  Insiders). The query config is the same `{"type":"stdio","command":...}` or `{"type":"http","url":...}`
  object `.vscode/mcp.json` uses, URL-encoded (not base64, unlike Cursor's). Confirmed by a second real
  listing (orshot.com/docs/integrations/mcp-server) showing the matching `.vscode/mcp.json` "servers" block.
- 2026-10-19+ (page states "fetched daily", checked 2026-11-04). geminicli.com/docs/extensions/releasing +
  .../reference + .../writing-extensions — Gemini CLI's extension gallery auto-indexes ANY public GitHub repo
  tagged with topic `gemini-cli-extension` whose `gemini-extension.json` sits at the repo root (or release
  archive root); crawled daily, no submission form. Manifest shape: `{name, version, description, mcpServers:
  {<key>: {command, args, cwd}}, contextFileName, excludeTools}`; `${extensionPath}` substitutes the
  extension's own dir. A real-world failure report (github.com/google-gemini/gemini-cli/issues/27838, open at
  fetch time) shows even a spec-compliant manifest can silently miss the crawl -- so "tag + wait" is not a
  guaranteed listing, just the documented mechanism.
- (live, checked 2026-11-04). developers.openai.com/codex/mcp — Codex CLI + IDE extension share
  `~/.codex/config.toml` (or project-scoped `.codex/config.toml`); add a stdio server either via
  `codex mcp add <name> -- <command> <args...>` or a `[mcp_servers.<name>]` TOML table (`command`, `args`,
  `env`); streamable-HTTP servers use `url` + `bearer_token_env_var` instead. No marketplace/gallery for Codex
  configs — distribution here just means publishing a copy-pasteable config snippet in our docs.
- (live, checked 2026-11-04). docs.continue.dev/customize/deep-dives/mcp + mcp-examples — Continue reads MCP
  blocks from `.continue/mcpServers/*.yaml` (own schema: `name`/`version`/`schema: v1`/`mcpServers:` list with
  `command`/`args`/`env`) or auto-imports a dropped-in Claude-Desktop-style `.continue/mcpServers/mcp.json`.
  No central Continue MCP directory found; again, distribution = a docs snippet.
- (live, checked 2026-11-04). opencode.ai/docs/config — opencode reads `opencode.json`
  (project or `~/.config/opencode/`) with a `mcp` map; local stdio servers use
  `{"type": "local", "command": [...], "environment": {...}}`, remote servers `{"type": "remote", "url":
  ..., "enabled": true}`. No public opencode MCP directory found.
- (live, checked 2026-11-04). mintlify docs for Goose (aaif-goose/goose, formerly block/goose) — extensions
  configured in `~/.config/goose/config.yaml` under `extensions:`, each with `type: stdio|streamable_http`,
  `command`/`args` or `uri`. No official Goose MCP directory found either; `goose session --with-extension
  "name:command"` is the one-shot CLI form worth documenting.
- 2026-10-31 to -11-04 window (checked 2026-11-04). windsurf.run (community directory, unofficial) +
  mcpbundles.com/blog/windsurf-mcp-tools (dated 2026-03-26, re-checked) — Windsurf's own built-in MCP
  Marketplace (Cascade panel) does one-click installs for servers it has indexed; anything else goes in
  `~/.codeium/windsurf/mcp_config.json` by hand. No public self-submission form found for Windsurf's own
  marketplace (community directories like windsurf.run and mcp.directory are separate, unofficial).
- (live, checked 2026-11-04). docs.github.com/.../publishing-actions-in-github-marketplace +
  .../metadata-syntax — Marketplace publish requirements: action must be in a PUBLIC repo; exactly one
  `action.yml`/`action.yaml` AT THE REPO ROOT (sub-folder action files are usable via `owner/repo/path@ref`
  but never auto-listed); name must be unique (not an existing action, GitHub Marketplace category, or
  org/user name unless that account owns it); actions publish immediately on a tagged release with "Publish
  this Action to the GitHub Marketplace" checked, no review queue. `branding: {icon, color}` is optional,
  icon from a fixed Feather-icon allowlist (tool/key/coffee/etc. are explicitly excluded).
- 2026-04-18ish README snapshot, repo pages re-checked live 2026-11-04 (openpulse.info / ossinsight.io /
  gitgenius.co / llmrepos.com / hhstats.com, cross-referencing punkpeye/awesome-mcp-servers): star counts vary
  60k-96k across trackers/snapshot dates (different crawl days), consistently the single largest curated
  general MCP list on GitHub; contribution is a plain PR adding one line/entry to its README list (no bot, no
  schema file) — lowest-effort, pure-reach channel, needs a public repo URL only (have one: mole-code-map).
- (checked 2026-11-04). ccplugins/awesome-claude-code-plugins (github) + claudemarket.ai/marketplaces +
  buildwithclaude.com/marketplaces — "there is no official Claude Code plugin marketplace"; discovery is
  curated READMEs (PR to add a line/bullet) plus `.claude-plugin/marketplace.json`-based community
  marketplaces users add with `/plugin marketplace add owner/repo`. claudemarket.ai's own count: "1,036
  marketplaces holding 3,314 plugins" (self-reported aggregator stat, not independently verified here).
  Mole already ships via its OWN marketplace.json (T10, done) — this adds Mole as a listed ENTRY in
  someone else's curated README (PR, same low-effort shape as awesome-mcp-servers).
- (live, checked 2026-11-04). pre-commit.com's own docs (#creating-new-hooks section) + several worked
  examples (stefaniemolin.com/pre-commit-workshop, stackoverflow/stefmolin's exif-stripper repo) — there is
  NO central pre-commit.com registry/listing to submit to; a repo becomes "a pre-commit hook" simply by
  having a `.pre-commit-hooks.yaml` at its root (id/name/entry/language/files per hook) that OTHER repos then
  reference directly by git URL + rev in their own `.pre-commit-config.yaml`. Distribution here = the file
  existing in our already-public repo, discovered by users searching GitHub/our README, not a submission.
- (live, checked 2026-11-04). docs.brew.sh/Formula-Cookbook + justin.searls.co "Distributing your own scripts
  via Homebrew" + github.com/jaywcjlove/homebrew-tap (worked example) — getting into homebrew-core requires
  meeting core's notability bar (not available to a new tool); the standard path for a new CLI is the
  author's OWN tap: a separate repo named `homebrew-<name>` holding `Formula/<name>.rb` (a Ruby DSL file with
  `url`, `sha256`, `depends_on "node"`, an `install` block). Users then run `brew tap raychu23/mole-code &&
  brew install mole-code`. Needs a real tagged GitHub release tarball + its sha256 to fill in the formula
  (today's state: v0.5.0 release exists on GHCR/Pages but the npm tarball isn't published yet, T85/T86) — so
  the formula can be drafted with a placeholder revision today, but can't be a real working tap until a
  real npm/GitHub release artifact exists to point the URL+sha256 at.

## Not fetched / explicitly out of scope this round
- mcp.so, MCP Market, PulseMCP, Glama, Cline MCP marketplace, JetBrains Marketplace, Zed extension gallery:
  covered via the comparison articles above (thinkneo.ai, agentopsguide.com, plugandship.dev) rather than
  each site's own submit page individually — all are submission-form or GitHub-sign-in flows that need
  Raymond's account/decision on which identity to submit under; listed in channels.md's "needs Raymond"
  checklist with the exact submit URL from these sources.
```
