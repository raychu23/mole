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
                        `entire labs --help` surveyed for a non-AI way to PRODUCE a NEW checkpoint: none exists
                        -- `entire checkpoint` is inspect/search-only (list, explain, tokens, search, delete; no
                        create/mock), and checkpoint creation is only ever a side effect of `entire enable`
                        wiring a *live* coding-agent CLI's hooks, which this environment cannot drive (no live
                        AI agent session available, per task constraints). That part of the original claim
                        stands.
                        CORRECTED 2026-11-03 (T76 review): the next sentence of this entry previously claimed a
                        GitHub code search "found none" for real public Entire checkpoint data -- that was
                        FALSE. `git ls-remote https://github.com/entireio/cli.git | grep refs/entire/checkpoints`
                        lists 59 real checkpoint refs in entireio/cli's own repo (the tool dogfoods itself,
                        confirmed by Peyton Montei/entire.io-authored commits in that history) -- fetchable with
                        plain `git fetch`/`git cat-file`, no `entire` CLI, no clone, no live agent. 5 of them
                        (10 metadata.json files: root + session) are captured in `4 log/real-samples/entire/`
                        with exact commands in its README. The claim should have been scoped to "no way to
                        create a *new* test checkpoint", never extended to "no real data exists to examine".
                        Real data confirmed T39's `entire.ts` was itself wrong: the real format is snake_case
                        (`checkpoint_id`, `files_touched`, `token_usage`...), matching entireio/cli's own
                        `api/checkpoint/metadata.go` (`CheckpointSummary`/`Metadata` structs) and
                        `docs/architecture/sessions-and-checkpoints.md`, and has NO per-session line-range field
                        anywhere -- T39's hand-built `EntireSessionRecord.fileRanges` does not exist in any real
                        checkpoint. Fixed in `src/importers/entire.ts` (real snake_case parser, file-level
                        `entireToRawIntents`, legacy fixture functions renamed and marked LEGACY) and
                        `src/importers/unify.ts` (a file-level claim is an explicit miss, never a fabricated
                        anchor). Commit linkage is the `Entire-Checkpoint:` trailer (confirmed in the source's
                        own `Metadata.CommitSHA` comment and docs.entire.io, real instance saved in
                        `commit-trailer-example.txt`), not a `commit_sha` metadata field (absent on every real
                        non-imported sample) -- `src/importers/external.ts`'s `findCommitForCheckpoint` now
                        resolves it via `git log --grep`, matching the real mechanism. Full detail and the
                        hand-checked link table: `4 log/link-table-entire.md`.
    agent-trace         agent-trace.dev / github.com/cursor/agent-trace is a spec (RFC, v0.1.0), not a CLI --
                        there is no reference tool that emits a trace record outside of Cursor's/Cognition's own
                        closed products, which are not installable here. A GitHub code search for real committed
                        `.agent-trace/*.json` / `traces.jsonl` records or public repos using the schema turned up
                        none (only the spec's own repos, mirrors, and one third-party survey page describing the
                        format, not emitting it). NOT RUN -- claim stays fixture-only for Agent Trace.
    takeaway            two of the three formats now have real data behind them: git-ai (live binary output)
                        revealed a genuine wrong-link class the docs-only fixtures could never have caught
                        (human-attested ranges imported as agent intent); Entire (real public checkpoint data,
                        T76 review 2026-11-03) revealed the parser itself was built against an invented shape --
                        T39's `fileRanges` field does not exist in any real checkpoint, and the real granularity
                        is file-level, not line-level. Agent Trace remains NOT RUN (still no reference CLI and no
                        real public instances found); claim stays fixture-only there, scoped correctly this time.
```
