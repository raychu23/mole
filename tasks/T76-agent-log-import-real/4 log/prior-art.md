```notes
T76 prior art      real output vs docs-only fixtures      2026-11-03
    git-ai              pinned v1.7.5 (github.com/git-ai-project/git-ai/releases/tag/v1.7.5), binary downloaded
                        directly (not install.sh, which installs IDE/agent hooks + a VS Code extension globally --
                        tried once, reverted, see 2 insights.md). Real `source files`: the actual JSON the v1.7.5
                        daemon writes to `refs/notes/ai` (4 log/real-samples/gitai/*.txt), produced with git-ai's
                        own documented non-AI test presets (`git-ai checkpoint human|mock_ai|known_human`, per
                        `git-ai --help` and AGENTS.md's "For testing, invoke via..." lines) -- no live AI agent
                        session. Real shape differs from usegitai.com's docs (T39's basis): docs describe
                        `meta.prompts: { <sessionId>: {agent, model, author, messages_url} }`; the real binary
                        always emits `prompts: {}` and puts attribution under two undocumented keys instead:
                        `meta.sessions` (AI checkpoints, keyed by a base session id; table rows use a composite
                        `<base>::<sub>` id) and `meta.humans` (`known_human` checkpoints -- not agent work). Fixed
                        in src/importers/gitai.ts: reads both shapes, and a row whose id is a `meta.humans` key is
                        never imported as an agent intent (importing it would be a wrong link).
    entire              pinned CLI v0.12.2 (github.com/entireio/cli, binary from the GitHub releases API's
                        "latest"). `entire --help` / `entire checkpoint --help` / `entire session --help` /
                        `entire labs --help` surveyed for a non-AI way to produce a checkpoint: none exists --
                        `entire checkpoint` is inspect/search-only (list, explain, tokens, search, delete; no
                        create/mock), and checkpoint creation is only ever a side effect of `entire enable` wiring
                        a *live* coding-agent CLI's hooks, which this environment cannot drive (no live AI agent
                        session available, per task constraints). `entire labs` -> `entire import claude-code`
                        imports existing Claude Code transcripts into Entire's own local session store, not an
                        exportable `metadata.json` in the shape entire.ts's parser reads, and a GitHub code search
                        for real `entire/checkpoints/v1` metadata.json content or public repos carrying
                        `refs/entire/checkpoints/*` turned up none (only Entire's own spec/doc repos). NOT RUN --
                        claim stays fixture-only for Entire.
    agent-trace         agent-trace.dev / github.com/cursor/agent-trace is a spec (RFC, v0.1.0), not a CLI --
                        there is no reference tool that emits a trace record outside of Cursor's/Cognition's own
                        closed products, which are not installable here. A GitHub code search for real committed
                        `.agent-trace/*.json` / `traces.jsonl` records or public repos using the schema turned up
                        none (only the spec's own repos, mirrors, and one third-party survey page describing the
                        format, not emitting it). NOT RUN -- claim stays fixture-only for Agent Trace.
    takeaway            the one real tool actually exercised (git-ai) revealed a genuine wrong-link class the
                        docs-only fixtures could never have caught (human-attested ranges imported as agent
                        intent) -- real output surfaced a real bug, confirming the task's premise.
```
