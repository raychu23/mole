# git-ai real output (not fixture) — how these were produced

Tool: real git-ai binary, pinned release **v1.7.5** (git-ai-project/git-ai), downloaded directly from
https://github.com/git-ai-project/git-ai/releases/download/v1.7.5/git-ai-macos-arm64 into
`/Users/a1/.hermes/cache/scratch/t76-git-ai/git-ai` (scratch only — not the npm-installed `install.sh`, which also
installs IDE/agent hooks and a VS Code extension system-wide; that was tried once, found to touch the live machine,
and fully reverted — see `2 insights.md`).

Scratch repo: `/Users/a1/.hermes/cache/scratch/t76-git-ai/repo` (plain `git init`, not the Mole repo).

Exact commands run (git-ai's own non-AI test presets, documented in `git-ai --help` and `AGENTS.md`'s
"For testing, invoke via..." lines — no live AI agent session was used or needed):

```
git-ai bg start                              # background daemon (reads trace2 events, writes authorship notes)
git config trace2.eventtarget "af_unix:stream:/Users/a1/.git-ai/internal/daemon/trace2.sock"   # wires real git's
git config trace2.eventnesting 0                                                                # native trace2 hook
                                                                                                  # to the daemon
git-ai checkpoint human <file>                # pre-edit snapshot (the "untracked" baseline)
<edit file with a plain text edit — no AI involved>
git-ai checkpoint mock_ai <file>               # git-ai's own test preset for an AiAgent checkpoint
git add -A && git commit -m "..."              # real git commit; the daemon's trace2 listener writes the note
git notes --ref=ai show <commit>               # the raw note captured below
git log --show-notes=ai                        # the pretty-printed form also captured below
```

For note-3, `git-ai checkpoint known_human <file>` (the "real" human preset, per AGENTS.md) was used on `fileB.js`
to get a mixed human+AI commit, to test that the importer does not mislabel a human-attested range as agent work.

## Three real commits / notes

| file | commit | produced with |
|---|---|---|
| `note-1-single-ai-session.txt` | `d2563226c74505d514d540289914210d7513d56a` | human checkpoint on `math.js`, then edit (added a `multiply` function), then `mock_ai` checkpoint, then commit |
| `note-2-two-ranges-same-session.txt` | `9cda3e26f0eac7f17c73412a96d2c988ae30397c` | same flow on `math2.js` (added a `divide` function) — git-ai's own diff split the one `mock_ai` checkpoint into two table rows (two sub-session ids under one base session) |
| `note-3-multi-file-mixed-human-ai.txt` | `d59dfa0c7b6445b762e8b6737d32783f48123c39` | `human` checkpoint on both `fileA.js`/`fileB.js`, then `mock_ai` checkpoint on `fileA.js` only (added `a2`), then `known_human` checkpoint on `fileB.js` only (added `b2`), then one commit |

`show-notes-pretty.txt` is `git log --show-notes=ai` across all three commits in one run (the alternate pretty-printed
shape `gitai.ts` also accepts). The four `file-*.txt` captures are each file's exact content at the commit the note
is attached to (what the importer's `symbolsInFile` sees), needed to hand-check anchoring below.

## Why this matters: the real wire shape differs from the docs T39 was built against

`usegitai.com/docs/cli/how-git-ai-works` (fetched 2026-10-30, T39 prior-art) describes the JSON metadata as
`{ schema_version, git_ai_version, base_commit_sha, prompts: { <sessionId>: { agent, model, author, messages_url } } }`.
The real v1.7.5 binary instead emits `"prompts": {}` always (empty) and puts the actual attribution under two
**new, undocumented** top-level keys:

- `"sessions": { "<base_session_id>": { "agent_id": { "tool", "id", "model" }, "human_author" } }` — AI checkpoints.
- `"humans": { "<human_session_id>": { "author" } }` — `known_human` checkpoints (explicitly *not* agent work).

Table-row session ids are also composite for AI sessions — `<base_session_id>::<sub_session_id>` (e.g.
`s_ad36ddc935d61a::t_d02f9535f3f305`) — not the bare id the docs/fixtures assumed, and a human-checkpoint row's id
(`h_...`) carries no `::` suffix at all.

**Before this task**, `src/importers/gitai.ts` only read `meta.prompts[sessionId]`, so against real output every
row's `agent`/`model` came back `undefined` (silently degraded, not wrong), AND — the real bug — it imported
**every** table row as an agent `RawIntent`, including `known_human` rows (note-3's `fileB.js`), which is a wrong
link: a human-attested line range reported as AI-authored. Fixed in this task (see `2 insights.md`) by reading the
real `sessions`/`humans` keys, excluding any row whose id is a key in `meta.humans`, and resolving `agent`/`model`
from `meta.sessions[<base_id>]` by stripping the `::` suffix. The old `meta.prompts` path is kept for backward
compatibility with the documented (if never observed) shape.
