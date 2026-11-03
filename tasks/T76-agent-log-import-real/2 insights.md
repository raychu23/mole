## Summary
- Got real output from one of the three T39 sources: git-ai v1.7.5 (pinned release binary, scratch-installed, no
  shell/IDE/global git config left behind). Entire v0.12.2 and Agent Trace have no non-AI way to produce a real
  record (surveyed and documented in `4 log/prior-art.md`) — both stay `NOT RUN`, claim stays fixture-only for them.
- Real git-ai notes differ from the usegitai.com docs T39's `gitai.ts` was built against: `meta.prompts` is always
  `{}`; real attribution is under undocumented `meta.sessions` (AI) / `meta.humans` (`known_human`) keys, and AI
  session ids in the table are composite `<base>::<sub>`.
- Found and fixed a real wrong-link bug the fixtures couldn't catch: the old parser imported every table row,
  including `known_human` rows, as agent intent. Fixed to skip any row whose id is a `meta.humans` key, and to
  resolve `agent`/`model` from the real `meta.sessions[<base>]` shape (keeping the old `meta.prompts` path too).
- 3 real commits / notes captured to `4 log/real-samples/gitai/` with exact reproduction steps. Hand-checked table
  in `4 log/link-table.md`: 5/5 real AI rows (100%) link to the correct function, 0 wrong links, 2/2 known_human
  rows correctly excluded.
- Tests: `packages/agentstate/test/t76-real-gitai.test.ts` (4 tests, real samples) — red (`4 log/red.txt`, 4/4
  fail) before the fix, green (`4 log/green.txt`, 15/15 incl. the 11 existing fixture tests) after.
- `npx tsc -b packages/agentstate` builds clean. Full `packages/agentstate` vitest suite has 11 pre-existing
  failures unrelated to importers (daemon/flows CLI integration tests needing `packages/daemon`/`packages/flows`
  built — out of this task's boundary; confirmed by diff: this task only touches `src/importers/gitai.ts` + tests
  + task docs).

## Notes (limits labelled INFERENCE)
- git-ai install: the real `install.sh` installs hooks into Claude Code, Codex, VS Code (incl. installing a VS
  Code extension), GitHub Copilot, OpenCode and Gemini, and sets `trace2.eventtarget`/`trace2.eventnesting`
  **globally** in `~/.gitconfig` — all on the live machine, not scratch. This was run once by mistake, caught
  immediately, and fully reverted (`git-ai uninstall-hooks`, `code --uninstall-extension`, `git config --global
  --unset trace2.*`) — verified clean afterward (no leftover global git config, no VS Code extension, no shell rc
  edits, no `~/.local/bin/git-ai` shim). All further testing used the raw downloaded binary directly plus a
  **repo-local** `trace2.eventtarget` first (didn't work — the daemon needs it to correlate the full command
  sequence, not just `commit`) then a temporary **global** trace2 config set only for the duration of the test and
  unset immediately after capturing the samples.
- Why global trace2 was needed at all (INFERENCE from observed daemon logs): real git (not a proxy) emits trace2
  events natively when `trace2.eventtarget` is configured; git-ai's daemon correlates commands via a reflog-cursor
  model across the whole sequence (checkpoint → add → commit), so a repo-local-only config left intermediate
  commands uncorrelated and no note was written. This wasn't tested against git-ai's source, only inferred from
  behavior.
- The `add` function range (9cda3e26, lines 1-2) anchoring to `add` even though `add`'s text didn't change between
  the human and mock_ai snapshots is git-ai's own char-diff attribution, not a Mole anchoring bug — Mole anchors
  whatever range git-ai's note claims; it doesn't re-derive or second-guess git-ai's own diff. Noted in
  `link-table.md`, not scored as wrong.
- Entire and Agent Trace: NOT RUN. No mock/test checkpoint command exists for Entire (`entire checkpoint` is
  read-only: list/explain/tokens/search/delete); checkpoint creation requires `entire enable` wired to a live
  coding-agent CLI's hooks, which needs a live AI agent session this environment doesn't have. Agent Trace has no
  reference CLI at all (a spec only); Cursor's/Cognition's own implementations are closed products. A GitHub code
  search for real public instances of either format (committed `entire/checkpoints/v1` metadata.json,
  `refs/entire/checkpoints/*`, `.agent-trace/*.json`/`traces.jsonl`) found none — only the format's own spec/doc
  repos. Full detail and search queries in `4 log/prior-art.md`.
