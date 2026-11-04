```notes
T91-distribution-channels      channels.md (ranked, dated sources in 4 log/prior-art.md)      tasks/T91-distribution-channels

## Summary
What: every distribution channel beyond npm/VS Code Marketplace/Open VSX/Claude Code marketplace/official MCP
registry (already done, waiting on Raymond's publish), ranked by reach x effort, with reach evidence and
whether it needs Raymond's own account/login. Answer: 7 channels built + tested locally with no credentials
(action.yml, HTTP MCP transport, one-click install links, Gemini/Codex/Continue/opencode/Goose config
snippets, Smithery/Glama/Docker-catalog manifest files, pre-commit hook, Homebrew tap formula draft); the
rest need a GitHub-authenticated submission (Raymond's account) and are the checklist at the bottom. What's
open: Smithery's hosting is sunsetting (2026-10-31) per one of the two sources below — verify before relying
on it; PulseMCP submissions were paused with no reopening date at last check (2026-10-17).

## Design doc alignment (Raymond correction 11-04 15:25, read in full before continuing)

"Integrate with existing tools... goal = an actual usable product for my users, integrated with the rest of
the frontier, not just my own little thing." Followed:

- `context/product-plan/3 Agentic workflow + integrations.md` §10.1: "Integration isn't the gap. Every tool
  now plugs into every other, through MCP, Slack and Linear apps, and GitHub's Agent HQ. Use those
  connections; don't compete on them." -> every channel below is Mole appearing INSIDE an existing surface
  (an existing CI check, an existing pre-commit run, an existing MCP client's native "add server" flow), not
  a new Mole-only surface.
- Same doc §2 ("telemetry + plugins... ship Mole as one plugin") and §8 O1 ("One Mole plugin for Claude Code
  + Codex... build first: it's how L1-L3 reach you") -> the Claude Code plugin (npm `mole-code`, done
  pre-T91) and this task's harness config snippets (Codex/Gemini/Goose/Continue/opencode) are the SAME move
  repeated per harness: carry Mole's existing MCP server into the harness's own native config format, never a
  Mole-specific install path.
- Same doc §4 "How they connect" (bridges table): MCP, hooks and git are the three bridges Mole already uses;
  this task adds no new bridge, only more entry points onto the same three (HTTP transport is still MCP;
  the GitHub Action still runs through git + hooks' PR-check equivalent).
- `context/product-plan/7 Build vs take.md` §2 rule: "take anything a focused project already solved well."
  -> every manifest file this task writes copies a real, cited, currently-documented format from the owning
  project (Docker's own `server.yaml` shape from docker/mcp-registry, Smithery's own minimal `smithery.yaml`,
  Gemini's own `gemini-extension.json`, pre-commit.com's own `.pre-commit-hooks.yaml` shape) rather than
  inventing a Mole-specific shape -- sources are the same ones fetched into 4 log/prior-art.md, each dated.
- `context/product-plan/10 Where Mole fits.md` §"integrate, don't rival": Mole's MCP tools are read-only and
  designed to be called BY other tools/agents, not to replace them -- the HTTP transport and directory
  listings this task adds make that posture reachable from more places (a Docker-run agent, a hosted MCP
  client) without changing what the tools do.

## Ranked table (reach x effort; "built" = file(s) exist in this branch, tested as noted; "plugs into" =
the existing tool/surface each channel puts Mole inside of, per the alignment above)

| # | channel | audience + reach evidence (dated, see prior-art.md) | effort | needs Raymond's account? | status |
|---|---|---|---|---|---|
| 1 | GitHub Marketplace Action (`raychu23/mole-code-map@v0`) | every GitHub Actions user browsing Marketplace; mole already has mole-pr-check workflow + composite action in daily use | low: turn existing composite action into a root `action.yml` + branding + add to public export | no to build; YES to actually tag+publish a release with "Publish to GitHub Marketplace" checked (docs.github.com, 2026-11-04) | BUILT + TESTED LOCALLY: `action.yml` at repo root (added to `scripts/export-public.mjs` include list, with its `author: Raymond Chu` field added to the export script's crediting-field allowlist so the private-string scan stays clean), `.github/workflows/action-self-test.yml` exercises it via a local path ref for the next real GitHub Actions run. `act` (the standard local-runner tool for this) is not installable in this environment (Homebrew blocked: Intel-macOS Tier-3 + no sudo to fix `/usr/local/share/man` ownership) -- `scripts/test/action-local.sh` instead runs the action's three `runs.steps` literally against a synthetic git repo + PR event (build, `mole pr-check`, and a dry-run print of the final `gh api` call), confirmed it produces the exact governed-decision annotation (`4 log/action-local-run.txt`). Marketplace listing itself NOT RUN (needs a tagged release on the public GitHub repo). |
| 2 | Remote MCP over streamable HTTP (`mole-mcp --http`) | any MCP client that prefers a URL over a local process (Docker MCP Toolkit remote type, Smithery URL publish, VS Code/Cursor "http" server type) | medium: packages/mcp already has `createServer()`; added a stateless StreamableHTTPServerTransport entrypoint, no DB/auth (team server's authed HTTP MCP is a separate, DB-backed feature, out of scope) | no | BUILT + TESTED: `packages/mcp/src/http.ts` + `src/http-cli.ts` (`mole-mcp --http [port]`), vitest `test/http.test.ts` does a real `initialize` + `tools/list` HTTP round trip. `npx tsc -b packages/mcp` and `npx vitest run packages/mcp/test/http.test.ts` both pass locally (see runs below). |
| 3 | Cursor one-click install link + VS Code "Add to VS Code" badge | Cursor/VS Code users land on our README/Pages site and click once | very low: one URL each, computed from the real `mole-mcp` stdio command | no | BUILT: `docs/install-mcp-clients.md` has both badges with the real base64/url-encoded config for `npx -y -p mole-code mole-mcp`; decoded and diffed against the source JSON in a local Node one-liner (matches). Clicking them NOT RUN (no Cursor/VS Code app in this environment). |
| 4 | MCP directory manifest files (Smithery, Glama, Docker MCP catalog) | Smithery ~20.8k listings, Glama ~106k servers + ~34k remote connectors, Docker catalog "20M+ developers" via Docker Hub/Desktop (all dated 2026-10, see prior-art.md) | low-medium: one manifest file each, no server-side step needed to have them exist and be valid | listing itself needs Raymond (Smithery submit flow / GitHub sign-in; Docker needs a merged PR reviewed by the Docker team) | BUILT: `smithery.yaml` (root, `runtime: "typescript"`, point at the stdio bin), `glama.json` (root, Glama reads npm `package.json` + this for extra metadata), `distribution/docker-mcp-catalog/mole-code/server.yaml` + `readme.md` (shape matches docker/mcp-registry's `type: server` example with the real npm `mole-code` identifier) + a real `tools.json` listing all 17 current `mole_*` tools with their actual descriptions and arguments, extracted from `packages/mcp/src/*.ts` (per CONTRIBUTING.md: "Avoiding build --tools failures... provide a tools.json file and the build process will not try to run the server" -- an empty array is only Docker's documented shape for `type: remote`, which this server isn't yet; it still needs its own stdio-wrapping Dockerfile before a real PR, noted in readme.md). Validated as parseable YAML/JSON locally; NOT submitted. |
| 5 | Agent-harness config snippets (Gemini CLI extension, Codex, Continue, opencode, Goose) | each harness's own user base; no directory to get stuck on besides Gemini's (see #6) | low: static config snippets pointing at the same `mole-mcp` stdio command, no new code | no | BUILT: `docs/install-mcp-clients.md` section per harness with copy-pasteable config (Codex `config.toml` table, Continue `.continue/mcpServers/mole.yaml`, opencode `opencode.json` mcp block, Goose `config.yaml` extensions block) + `gemini-extension.json` at the repo root (Gemini's gallery crawler needs the manifest AT the repo root per geminicli.com/docs, not a subfolder or just a docs snippet; also added to `scripts/export-public.mjs`). JSON/TOML/YAML snippets syntax-checked locally (parsed with `node -e`/`python3 -c`). |
| 6 | Gemini CLI extensions gallery (auto-crawled) | public gallery at geminicli.com/extensions, crawled daily from any repo tagged `gemini-cli-extension` (2026-11-04) | low to build (manifest above), needs Raymond to add the GitHub topic to the public repo | yes (repo-settings access) | MANIFEST BUILT (see #5); adding the `gemini-cli-extension` topic is on the needs-Raymond checklist (one checkbox in repo settings, not a token). |
| 7 | pre-commit.com hook | anyone already using `pre-commit`; no central registry — discovered via our own README + GitHub search (prior-art.md: pre-commit.com has no submission form, a repo just needs `.pre-commit-hooks.yaml`) | very low: one YAML file, `mole check` is already a CLI subcommand with no daemon requirement for most paths | no | BUILT: root `.pre-commit-hooks.yaml` (id `mole-check`, entry `mole check`, language `node`) + README usage snippet; added to `scripts/export-public.mjs` include list. NOT RUN against a real external repo's `.pre-commit-config.yaml` (would need a second checked-out repo + pre-commit installed — out of this task's local test reach; the hook's underlying `mole check` command is already covered by existing CLI tests). |
| 8 | Homebrew tap (`raychu23/homebrew-mole`) | macOS/Linuxbrew users who `brew install` CLIs instead of npm | medium: own tap repo + a formula that wraps the npm-published tarball (needs a real release artifact + its sha256, which doesn't exist until T85/T86's npm publish happens) | yes to host the tap repo under Raymond's account; the publish step (filling in a real URL+sha256) needs the npm/GHCR release to exist first | DRAFTED, not fully working: `distribution/homebrew/mole-code.rb` formula skeleton (depends_on "node", placeholder url/sha256 clearly marked TODO) + `distribution/homebrew/README.md` explaining the two prerequisites. Cannot be tested end-to-end until `mole-code` is actually published (T85/T86, waiting on Raymond's tokens). |
| 9 | awesome-mcp-servers PR (punkpeye/awesome-mcp-servers) | ~60k-96k GitHub stars depending on tracker/date (prior-art.md), single largest curated MCP list, plain README PR | very low (one list entry) | yes — needs a PR from a GitHub account (can be Raymond's or a bot's, but requires that account + the public repo already being live, which it is) | NOT BUILT (no local file — it's an edit to someone else's repo). On needs-Raymond checklist with the exact repo + PR shape. |
| 10 | Claude Code community plugin marketplace lists (awesome-claude-code-plugins etc.) | curated READMEs + claudemarket.ai aggregator (self-reported "1,036 marketplaces / 3,314 plugins", unverified independently) | very low (one list entry), Mole's own `.claude-plugin/marketplace.json` already exists (T10) | yes — PR to someone else's repo | NOT BUILT, needs-Raymond checklist item. |
| 11 | Docker MCP catalog PR (submission, not just the file) | "20M+ developers" via Docker Hub/Desktop MCP Toolkit (Docker's own 2026 blog post) | low to prepare (file built, #4), PR + Docker-team review needed to actually land | yes — PR from a GitHub account, Docker team reviews | File built (#4); PR itself on needs-Raymond checklist. |
| 12 | mcp.so / MCP Market / Glama claim / PulseMCP / Cline MCP marketplace / JetBrains Marketplace / Zed extension gallery | each has its own public index (sizes in prior-art.md: Glama ~106k, mcp.so ~10k+, PulseMCP ~1.2k curated — PAUSED for new submissions as of 2026-10-17 per plugandship.dev) | low per site, but each is a separate account/sign-in/submit-form flow | yes (GitHub sign-in or email per site) | NOT BUILT, needs-Raymond checklist (exact submit URLs below). |
| 13 | Windsurf MCP Marketplace, VS Code MCP gallery listing (vs. just the install badge) | Windsurf's built-in Cascade marketplace (one-click installs for servers IT has indexed); VS Code's own extension-style MCP gallery | low per site | yes — each is a vendor-curated inclusion, not self-serve | NOT BUILT (the one-click *link* at #3 works without being listed in a gallery); gallery inclusion on needs-Raymond checklist. |
| 14 | Show HN / Reddit (r/programming, r/ClaudeAI, r/mcp) / Dev.to launch posts | one-time traffic spike, long tail if it resonates; no reach number to cite honestly (not posted, no data) | low to draft, but posting itself is a judgment call Raymond should make (voice, timing, which subreddit rules) | yes (his own accounts + his own voice) | DRAFTED ONLY, not posted: `docs/launch-drafts/show-hn.md`, `docs/launch-drafts/reddit.md`, `docs/launch-drafts/devto.md`, each marked "DRAFT -- NOT POSTED" at the top. |

## Needs Raymond: exact steps checklist (nothing here was pushed, published, or submitted)

1. **GitHub Marketplace listing for the Action** (#1): after a real tagged release on `github.com/raychu23/
   mole-code-map` (the exported public repo) that includes the new `action.yml`, go to that release's edit
   page and check "Publish this Action to the GitHub Marketplace" (docs.github.com, Publishing actions in
   GitHub Marketplace). Needs the action's `name:` to be unique on the Marketplace (not checked here — would
   need a Marketplace search while logged in).
2. **Gemini CLI extensions gallery** (#6): in the public repo's GitHub settings -> About, add the topic
   `gemini-cli-extension`; the manifest (`gemini-extension.json` at the repo root, built and already in the
   export allowlist) reaches the public export automatically once a release is cut.
3. **Smithery**: smithery.ai/new, paste the public repo URL (or publish the MCPB bundle via `smithery mcp
   publish`) — re-verify Smithery's hosting status first; one source says hosting sunsets 2026-10-31 (see
   prior-art.md), so this may now be listing-only.
4. **Glama**: glama.ai, "claim" the server once it's auto-indexed from the public repo, or submit directly —
   no local file needed beyond what npm/MCP-registry already provides.
5. **Docker MCP catalog**: fork `github.com/docker/mcp-registry`, copy `distribution/docker-mcp-catalog/
   mole-code/` (built) into `servers/mole-code/`, run their `task validate`/`task build` (needs their `task`
   CLI + Docker installed), open a PR per CONTRIBUTING.md; Docker team reviews.
6. **PulseMCP**: pulsemcp.com/submit — paused as of 2026-10-17 per plugandship.dev; check before trying.
7. **mcp.so**: mcp.so/submit (free with review, or $39 to skip review per plugandship.dev).
8. **MCP Market, Cline MCP marketplace, JetBrains Marketplace, Zed extension gallery**: each vendor's own
   submit flow; none were fetched in detail this round (listed as not-fetched in prior-art.md) — look up the
   current submit URL before acting, these move.
9. **awesome-mcp-servers PR**: fork `punkpeye/awesome-mcp-servers`, add one line linking the public repo in
   the appropriate category, PR.
10. **Claude Code community marketplace lists** (ccplugins/awesome-claude-code-plugins or similar): same
    shape, one PR per list.
11. **Homebrew tap** (#8): once `mole-code` has a real npm tarball or GitHub release asset (T85/T86), fill in
    `distribution/homebrew/mole-code.rb`'s TODO url/sha256, create `raychu23/homebrew-mole` repo, push the
    formula there (own repo under his account, not a `brew install` into homebrew-core).
12. **Show HN / Reddit / Dev.to** (#14): review the three drafts in `docs/launch-drafts/`, edit in his own
    voice, post from his own accounts whenever he judges the timing right — not automated here on purpose.

## Fixed during this pass
`scripts/export-public.mjs`'s `include` allowlist now lists `action.yml`, `smithery.yaml`, `glama.json`,
`gemini-extension.json`, `.pre-commit-hooks.yaml`, and `distribution/` (the Docker catalog + Homebrew drafts),
and the private-string scan passes clean against a real export run (`node scripts/export-public.mjs <dir>` →
"private-string scan: clean", re-verified after adding `action.yml`'s `author: Raymond Chu` field to the
crediting-field allowlist). `integrations/` is not used -- `gemini-extension.json` lives at the repo root
(Gemini's own crawler requirement), same root as every other manifest file above.
```
