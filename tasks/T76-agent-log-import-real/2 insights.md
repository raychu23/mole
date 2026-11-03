## Summary
- Got real output from two of the three T39 sources. git-ai v1.7.5 (pinned release binary, scratch-installed, no
  shell/IDE/global git config left behind). Entire (T76 review fix, 2026-11-03): the original claim that no real
  public Entire checkpoint data exists was FALSE -- `entireio/cli`'s own `refs/entire/checkpoints/*` is public
  and fetchable with plain `git` (59 real refs via `git ls-remote`, 5 checkpoints / 10 metadata.json files
  captured in `4 log/real-samples/entire/`). Agent Trace still has no non-AI way to produce a real record
  (`4 log/prior-art.md`) and stays `NOT RUN`; claim stays fixture-only there.
- Real git-ai notes differ from the usegitai.com docs T39's `gitai.ts` was built against: `meta.prompts` is always
  `{}`; real attribution is under undocumented `meta.sessions` (AI) / `meta.humans` (`known_human`) keys, and AI
  session ids in the table are composite `<base>::<sub>`.
- Found and fixed a real wrong-link bug the fixtures couldn't catch: the old parser imported every table row,
  including `known_human` rows, as agent intent. Fixed to skip any row whose id is a `meta.humans` key, and to
  resolve `agent`/`model` from the real `meta.sessions[<base>]` shape (keeping the old `meta.prompts` path too).
  T76 review fix (2026-11-03, per `specs/git_ai_standard_v3.0.0.md` §1.2.3.1): the exclusion now also catches an
  `h_`-prefixed id with `meta.humans` entirely absent (the prefix alone identifies it as human, independent of
  whether the map confirms it) and the BASE of a composite `base::sub` id being a `meta.humans` key (a malformed/
  future-note guard; a spec-compliant `h_` key is never composite, so this exact case has no real sample --
  exercised with synthetic/fuzz tests instead, `t76-real-gitai.test.ts`).
- Entire's parser (T76 review fix): T39's `entire.ts` was built against an invented `fileRanges` per-session
  shape that no real checkpoint ever contains -- confirmed against 5 real checkpoints and entireio/cli's own
  `api/checkpoint/metadata.go` source. Rewrote `entire.ts` to parse the real snake_case `CheckpointSummary`/
  `Metadata` shapes and link at the granularity the real data supports: file-level (`files_touched`, via a new
  `granularity: 'file'` RawIntent that `unify.ts` now reports as an explicit miss rather than fabricating a
  line-range anchor) and commit-level (the `Entire-Checkpoint:` trailer, resolved in `external.ts` via
  `git log --grep`, not a `commit_sha` metadata field -- that field is import-only and absent on every real
  sample). The pre-existing hand-built fixture test is kept, renamed LEGACY in `t39-importers.test.ts` (Entire
  never wrote that shape) and in `bench/m33.ts`'s builder, which still needs per-function line ranges the real
  data doesn't have.
- 3 real git-ai commits / notes captured to `4 log/real-samples/gitai/` with exact reproduction steps. 5 real
  Entire checkpoints captured to `4 log/real-samples/entire/` with exact reproduction steps. Hand-checked tables:
  `4 log/link-table.md` (git-ai: 5/5 real AI rows link to the correct function, 0 wrong, 2/2 known_human rows
  correctly excluded) and `4 log/link-table-entire.md` (Entire: 5/5 checkpoints produce exactly the files their
  own real data names, 0 fabricated line ranges, commit-trailer mechanism confirmed against a real instance).
  **Scope**: both tables, and the claims above, cover only what the cited tests actually exercise -- git-ai's
  table is 5 real AI rows + 2 excluded human rows from 3 captured notes; Entire's is 5 real checkpoints' file-
  level data and one real commit-trailer example, not a claim about every checkpoint or commit Entire has ever
  written.
- Tests: `packages/agentstate/test/t76-real-gitai.test.ts` (9 tests: 4 original real-sample tests + 5 new
  id-prefix-exclusion tests incl. a fuzz-style sweep) and `packages/agentstate/test/t76-real-entire.test.ts` (7
  tests, real samples, new this review round). Round 1 red/green: `4 log/red.txt` (4/4 fail before the gitai.ts
  fix) / `4 log/green.txt` (15/15 after). Round 2 (this review's fixes) red/green: `4 log/red-reviewfix.txt`
  (12/27 fail before: the new gitai id-prefix tests + all new entire tests, captured by temporarily stashing
  just the `src/importers/*` fix commits) / `4 log/green-reviewfix.txt` (27/27 after).
- `npx tsc -b packages/agentstate` builds clean (including `bench/m33.ts`, updated to the renamed legacy Entire
  functions). `npx vitest run packages/agentstate/test` : 125/128 pass; the 3 failures are pre-existing MCP
  client/server integration tests needing `packages/mcp`/`packages/daemon` built (`Cannot find module
  .../packages/mcp/dist/cli.js`), unrelated to this task's importer changes -- confirmed by diff: this review
  round only touches `src/importers/*`, `bench/m33.ts`, the importer tests, and task docs.

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
- Entire and Agent Trace, ORIGINAL (2026-10-xx) claim, now corrected for Entire: this line previously said "No
  mock/test checkpoint command exists for Entire... A GitHub code search for real public instances of either
  format... found none". The "no create command" half is still true (unchanged). The "found none" half was
  FALSE for Entire and is corrected above (Summary) and in `4 log/prior-art.md`'s `entire` row -- `entireio/cli`
  dogfoods itself and its checkpoint refs are public. Agent Trace's half of this claim is unchanged: still no
  reference CLI, still NOT RUN, still fixture-only (re-verified not retested this round).
