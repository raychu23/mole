## Summary
Built `mole steer signal|update|query|deliver`: a tiny Temporal-style signal/update/query contract for steering a
running agent, over the existing hooks transport. `signal` queues a one-shot note; `update` is checked by a
validator before it's queued and a rejection carries its reason and is never delivered; `query` reads the agent's
current intent/files/decisions from @mole/agentstate's own run graph (T18). State lives in a per-session,
file-based inbox under `.mole/local/steer/` (never committed). The Claude Code plugin's PreToolUse (now matches
every tool, not just Edit|Write) and UserPromptSubmit hooks deliver pending signals/accepted updates exactly once,
as `additionalContext`, never a block.

## Design notes
- `packages/agentstate/src/steer/{types,store,validate,query,index,cli}.ts`: new module, boundary-clean (no new
  dependency on `@mole/decisions` -- decision-id/scope checks are a light, dependency-free parse of
  `.mole/decisions/*.md`, same pattern as `plugins/claude-code/scripts/lib.mjs`'s own duplicated decision parsing,
  and for the same reason: agentstate must not gain a heavy dependency just to spell a decision id).
- Inbox location is a REVERSIBLE, evidence-backed choice: `.mole/local/steer/<session>.json`, not
  `CLAUDE_PLUGIN_DATA` (which the existing T15/T37/T64 hooks use for their own per-session state). Rationale: `mole
  steer` must work for a session id from ANY harness (or none), and `CLAUDE_PLUGIN_DATA` is a Claude-Code-specific
  env var the CLI would not have when invoked by a human or another agent. Same `.mole/local` convention as
  `packages/memory/src/seen.ts` (gitignored via a written `.gitignore` with `*`), so it is never committed. Reversing
  this (moving the inbox under `CLAUDE_PLUGIN_DATA`) would be a one-file change (`steer/store.ts`'s `inboxFile`).
- `mole steer` is registered as a light CLI entry (`packages/daemon/src/cli.ts`, same pattern as T24's `claims`):
  `signal`/`update`/`deliver` never load the LangGraph-backed main `@mole/agentstate` index; only `query` does
  (dynamic `import('../index.js')` inside `query.ts`), and only when actually called -- a hook calling `deliver` on
  every tool call never pays that cost.
- `pre-tool-use.mjs`'s matcher widened from `Edit|Write` to `*` (`hooks/hooks.json`) so a signal is seen on the
  agent's very next tool call (not only its next edit), matching the contract's own wording. Verified this did not
  regress any of the 11 existing plugin test files (decisions/collisions/claims/stop-verifier all still pass).
- Hooks never set `decision`/`permissionDecision` when delivering steering -- only `hookSpecificOutput.additionalContext`
  (Claude Code docs: this is the non-blocking surface; `decision`/`permissionDecision` is the only blocking one). An
  update's VALIDATION happens synchronously in the CLI call itself (`mole steer update`), never in a hook -- hooks
  only ever deliver an ALREADY-accepted update.

## Tests (red -> green, saved: `tasks/T74-steering-dials/4 log/red.txt`)
- `packages/agentstate/test/steer.test.ts`: 14 tests. Red by moving `src/steer/` aside (module-not-found), green
  after restoring the implementation + 3 follow-up fixes (missing `inboxFile` export, `MOLE_HERMES_DB` env not set
  before a direct `queryAgentState` call, decision-scope matching against absolute vs. repo-relative paths).
- `plugins/claude-code/test/steer-hook.test.ts`: 6 tests. Red by `git stash`-ing just the 4 touched hook files
  (`lib.mjs`, `pre-tool-use.mjs`, `user-prompt-submit.mjs`, `hooks.json`) and rerunning -- 3 of 6 failed exactly as
  expected (the delivery assertions); the 3 "never blocks"/"silent" tests passed even pre-wiring, as they should
  (absence of bad behavior, not presence of the new feature).
- Full regression: `npx tsc -b` clean; `npx vitest run packages/agentstate plugins/claude-code` = 170/170 passed
  (22 test files, including every pre-existing T15/T18/T21/T24/T37/T64/T65 hook and agentstate test);
  `npx vitest run packages/daemon` = 28/28 passed (daemon CLI dispatch untouched elsewhere).

## Proof paths
- `tasks/T74-steering-dials/4 log/prior-art.md` (Temporal handling-messages/message-passing/TypeScript SDK docs,
  Claude Code hooks reference + additionalContext issue history, LangGraph interrupt/human-in-the-loop docs; all
  fetched and dated 2026-11-03).
- `tasks/T74-steering-dials/4 log/red.txt` (both red captures above, verbatim).

## NOT RUN
- Nothing. Every check in this task's scope (`tsc -b`, the two new test files, the full `agentstate` +
  `claude-code` + `daemon` suites) ran for real; no model calls were needed (validators and query are deterministic,
  zero-LLM, same as the rest of this plugin's hooks).

## Limits (INFERENCE)
- INFERENCE: decision-scope matching for `queryAgentState`'s `decisionsInPlay` and for `validateUpdate`'s
  `decision-superseded` kind is a light, hand-rolled parse (id/title/scope only) -- it does not use the real citator
  graph (`@mole/decisions`) or compute live flags. A decision renamed/retired through the real engine but still
  present as a `.md` file would still validate as "exists" here. This mirrors the SAME simplification
  `plugins/claude-code/scripts/lib.mjs` already makes on purpose (dependency-free hooks), so it is consistent with
  the existing codebase's risk profile, not a new one.
- INFERENCE: `deliverPending`'s read-modify-write has no file lock. Two `mole steer deliver` calls racing on the
  same session (e.g. PreToolUse and UserPromptSubmit firing within the same event loop tick) could each read the
  same "pending" state and each report delivering it once -- a double-delivery, not a loss. Given Claude Code hooks
  run sequentially per event and `writeFileSync` is atomic per call, this is a narrow window; a lock file would
  close it if it turns out to matter in practice.
- INFERENCE: `requestUpdate`'s `KNOWN_UPDATE_KINDS` (`stop-editing`, `decision-superseded`, `scope`, `note`) is a
  starting set chosen to cover the two examples in the task contract ("stop editing X", "decision D superseded")
  plus two more that fit the same validator shape; it is not exhaustive and is meant to grow (each kind's check
  lives in one place, `steer/validate.ts`).
