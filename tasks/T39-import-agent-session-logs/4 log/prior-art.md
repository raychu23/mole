```notes
T39 prior art      agent session logs → code      2026-10-29 (prior-art-first; searched today)
    entire              ex-GitHub CEO Thomas Dohmke · $60M seed · open-source CLI 'Checkpoints': on each agent commit stores transcript, prompts, files touched, tokens, line attribution as git objects (entire/checkpoints/v1 or refs/entire/checkpoints/*), linked by commit trailer
                        roadmap: 'a git-compatible database that unifies code, intent, constraints, and reasoning' + 'semantic reasoning layer' → closest future competitor to Mole's center
                        https://entire.io/blog/hello-entire-world · https://github.com/entireio/cli (docs/architecture/sessions-and-checkpoints.md)
    git-ai              open source · agents call 'git ai checkpoint'; on commit line-level Authorship Log in Git Notes (refs/notes/ai): line → agent, model, prompt · 'git ai blame' + VS Code gutter · Prompt + Context Store 'surfaces the why behind every line of AI-generated code'
                        https://github.com/git-ai-project/git-ai · https://usegitai.com/docs/get-started/ai-blame
    agent trace         open spec (Cursor RFC, Cognition, Jan 2026) v0.1.0: per file → conversations → line ranges + content_hash + model · https://agent-trace.dev/
    specstory           saves chats as markdown in .specstory/history, derives rules files · https://docs.specstory.com/
    gap Mole fills      all four record what an agent did when it wrote a line; none re-checks that the intent still holds after later edits, ties it to the team's decisions, or scopes it to a function (Agent Trace has content_hash per range, the closest hook)
    decision            consume, don't capture: Entire + git-ai + Agent Trace as sources; Mole adds function anchoring + staleness + decisions

    addendum 2026-10-30 (mole-builder-16/a21, build): exact wire shapes fetched before implementing any parser
        entire checkpoint       CheckpointSummary (checkpointId, commitSha, filesTouched[], sessions[]) per entire-page-sessions-and-checkpoints.txt.
                                the docs give the checkpoint-level shape but not a published per-session file/line-range field name; src/importers/entire.ts's
                                `fileRanges` on each session is HAND-BUILT from the described domain model (a session = touched files + the line spans its
                                redacted transcript covers), not copied from an undocumented field. Labelled as such in entire.ts's header comment.
        git-ai note format     fetched usegitai.com/docs/cli/how-git-ai-works 2026-10-30 ("Git Note Format", "Authorship Notes"): table of
                                `<file>   <sessionId> <ranges>[   <sessionId2> <ranges2> ...]` rows, then `---`, then one JSON object
                                { schema_version, git_ai_version, base_commit_sha, prompts: { <sessionId>: { agent, model, author, messages_url } } }
                                attached as a git note under refs/notes/ai (usegitai.com/docs/get-started/how-git-ai-works, "Attribution storage").
                                `git log --show-notes=ai` pretty-prints the same table under "Notes (ai):" with extra indent; src/importers/gitai.ts accepts both.
        agent trace v0.1.0      fetched agent-trace.dev 2026-10-30 ("6. Core Specification" + "Appendix A. Minimal Valid Trace Record"):
                                { version, id, timestamp, vcs?, tool?, files: [{ path, conversations: [{ url?, contributor: {type, model_id?}, ranges: [{start_line, end_line, content_hash?}], related? }] }], metadata? }.
                                src/importers/agenttrace.ts implements this exactly; only contributor.type === 'ai' ranges carry agent intent (human-written
                                ranges are explicitly in-spec but out of scope for "what an agent did").
        real-repo readers       the three source readers in src/importers/external.ts are best-effort, read-only, 0 capture: git-ai via `git notes --ref=ai
                                list/show` (documented ref); Entire via the legacy git-branch backend ref `entire/checkpoints/v1` walked with `git ls-tree`
                                + `git show` (the newer git-refs-per-checkpoint backend, refs/entire/checkpoints/<shard>/<id>, has no single enumerable ref
                                from outside Entire's own CLI -- not covered, logged as a gap in 2 insights.md, not claimed met by M33); Agent Trace has no
                                published standard storage location in the fetched spec text, so a `.agent-trace/*.json` sidecar-file convention is this
                                reader's own INFERENCE (Cognition's and Jujutsu's agent-trace integrations write plain trace files beside the repo per
                                dev.classmethod.jp's Agent Trace x Jujutsu writeup, fetched 2026-10-30, so a directory of JSON files is the closest shape).
        why fixtures!=readers   M33's bench (bench/m33.ts) exercises the three parse+anchor+recheck functions directly against hand-built fixture content in
                                each documented format (the thing whose correctness is actually measurable and frozen in bench/m33-key.json); the real-repo
                                readers in external.ts are a thin, best-effort "find it if it's there" layer with no repo in this environment that actually
                                runs Entire/git-ai/Agent Trace to test against, so they are not separately scored by M33 -- a real gap, named here rather
                                than silently assumed working (R7: report the real coverage, never invent a passing number for an untested path).
```
