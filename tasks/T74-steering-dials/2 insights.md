## Summary
Built `mole steer signal|update|query|deliver`: a tiny Temporal-style signal/update/query contract for steering a
running agent, over the existing hooks transport. `signal` queues a one-shot note; `update` is checked by a
validator before it's queued and a rejection carries its reason and is never delivered; `query` reads the agent's
current intent/files/decisions from @mole/agentstate's own run graph (T18). State lives in a per-session,
file-based inbox under `.mole/local/steer/` (never committed). Steering is delivered exactly once via
PreToolUse (Edit|Write only) and UserPromptSubmit, as `additionalContext`, never a block. Delivery is atomic
(claim-by-rename, store.ts's `withInboxClaim`) and `steerDeliverText` never spawns the CLI for an empty inbox.

## Review 1 fixes (finding -> fix -> proof)
- **HIGH 1** (`hooks/hooks.json` PreToolUse matcher widened to `"*"` made the full decisions block fire on Read,
  since `pre-tool-use.mjs` branches only on `tool_input.file_path`, which Read also sets, never on `tool_name`) ->
  fix: matcher restored to exactly `"Edit|Write"`; `pre-tool-use.mjs`'s decisions control flow restored to the
  pre-T74 base commit's structure byte-for-byte (steering is appended to the SAME `parts` array the decisions block
  already used, never a separate early-return branch that could change the decisions-only output) -> proof:
  `plugins/claude-code/test/steer-hook.test.ts`'s "Review 1 HIGH 1" describe block asserts
  `hooks.json`'s matcher equals `"Edit|Write"` and diffs this file's additionalContext for a governed Edit against
  `git show 8e4352b:...pre-tool-use.mjs` (the commit immediately before T74's own) byte-for-byte; both pass.
- **HIGH 2** (`steerDeliverText` spawned `mole steer deliver` -- a subprocess, +60-80ms -- on every Edit|Write call
  even with an empty inbox) -> fix: `lib.mjs`'s new `hasPendingSteer` does an in-process `existsSync` (no inbox
  file at all) then a `readFileSync`+`JSON.parse` (inbox exists but nothing undelivered) BEFORE ever calling
  `moleJson`/`execFileSync`; only a session with a real pending signal/update pays for the CLI spawn -> proof:
  `tasks/T74-steering-dials/4 log/bench/review1-high2-latency.txt`, n=30 each, identical harness: BEFORE (always
  spawn) avg 156.96ms vs AFTER (fast path) avg 76.88ms, delta 80.08ms -- matches the reported finding almost
  exactly; `steer-hook.test.ts`'s "Review 1 HIGH 2" tests additionally confirm a broken `MOLE_BIN` never crashes an
  empty-inbox call (proving the CLI is never even touched).
- **HIGH 3** (`deliverPending`'s read-modify-write had no lock; a stress test of 8 concurrent deliverers x 50
  queued items produced double deliveries -- items delivered to more than one winner, never lost) -> fix:
  `store.ts`'s new `withInboxClaim` makes the whole read-filter-mark-write sequence atomic via a rename-based claim
  (`fs.renameSync` is atomic on POSIX -- only one racer's rename against a given canonical path can succeed,
  modeled on Maildir's tmp->new rename and git's `index.lock` O_EXCL+rename idiom, both cited with sources in
  `tasks/T74-steering-dials/4 log/prior-art.md`'s "Review 1 additions"); `sendSignal`/`requestUpdate`/
  `deliverPending` (index.ts) all route their inbox mutation through it -> proof: new
  `packages/agentstate/test/steer-stress.test.ts` -- 8 processes launched truly concurrently (`Promise.all` over
  `spawn`, not `spawnSync`) x 50 items each (400 total), asserts every item delivered to exactly one winner (no
  doubles via a per-item delivery count map, no losses via a missing-items diff). Confirmed this test actually
  catches the original bug: reverted `store.ts`/`index.ts` to the pre-fix read-modify-write and re-ran 5x -- 4/5
  runs failed with every item double/triple/quadruple-delivered (verbatim capture in `4 log/red.txt`); restored the
  fix and re-ran 5x -- 5/5 passed.

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
- Full regression (post Review 1 fixes): `npx tsc -b` clean; `npx vitest run packages/agentstate plugins/claude-code
  packages/daemon` = 205/205 passed (25 test files, including every pre-existing T15/T18/T21/T24/T37/T64/T65 hook
  and agentstate test, the two new Review 1 test files, and daemon's own 23 tests, all in one run).

## Proof paths
- `tasks/T74-steering-dials/4 log/prior-art.md` (Temporal handling-messages/message-passing/TypeScript SDK docs,
  Claude Code hooks reference + additionalContext issue history, LangGraph interrupt/human-in-the-loop docs, and
  (Review 1) Maildir delivery + git's lockfile API; all fetched and dated 2026-11-03).
- `tasks/T74-steering-dials/4 log/red.txt` (red captures, verbatim, including the Review 1 stress-test red/green).
- `tasks/T74-steering-dials/4 log/bench/review1-high2-latency.txt` (HIGH 2 before/after timing, n=30).

## NOT RUN
- Nothing. Every check in this task's scope (`tsc -b`, the steer/steer-hook/steer-stress test files, the full
  `agentstate` + `claude-code` + `daemon` suites, the HIGH 2 latency bench, the HIGH 3 stress test red/green cycle)
  ran for real; no model calls were needed (validators and query are deterministic, zero-LLM, same as the rest of
  this plugin's hooks). The one thing explicitly NOT built: a separate any-tool-matcher hook (the task's fix spec
  made this optional -- "if a separate any-tool hook is kept at all" -- and PreToolUse Edit|Write + UserPromptSubmit
  already satisfy "before the agent's very next edit or next prompt" without reintroducing HIGH 1's matcher-widening
  regression, so it was not added; no n>=30 any-tool-hook latency measurement was needed as a result).

## Limits (INFERENCE)
- INFERENCE: decision-scope matching for `queryAgentState`'s `decisionsInPlay` and for `validateUpdate`'s
  `decision-superseded` kind is a light, hand-rolled parse (id/title/scope only) -- it does not use the real citator
  graph (`@mole/decisions`) or compute live flags. A decision renamed/retired through the real engine but still
  present as a `.md` file would still validate as "exists" here. This mirrors the SAME simplification
  `plugins/claude-code/scripts/lib.mjs` already makes on purpose (dependency-free hooks), so it is consistent with
  the existing codebase's risk profile, not a new one.
- INFERENCE: ~~`deliverPending`'s read-modify-write has no file lock.~~ FIXED in Review 1 (HIGH 3): see
  `withInboxClaim` (store.ts) and the "Review 1 fixes" section above -- a rename-based atomic claim closes this
  window, proven by `packages/agentstate/test/steer-stress.test.ts`'s 8x50 concurrent stress test.
- INFERENCE: `withInboxClaim`'s retry loop is bounded (300 attempts x 10ms sleep, ~3s ceiling) and throws past that
  -- a session under far heavier contention than this task's proven 8-concurrent-deliverer case (e.g. dozens of
  parallel agents steering the same session id) could see a thrown error surface as a stderr line from
  `steerDeliverText`'s `moleJson` catch (never a crash or a block, per the T74 stop condition, but the steering
  text for that call would be `''`). Not exercised beyond 8 concurrent deliverers; widening the stress test is a
  one-parameter change (`WORKERS`) if this needs a higher proven ceiling later.
- INFERENCE: `requestUpdate`'s `KNOWN_UPDATE_KINDS` (`stop-editing`, `decision-superseded`, `scope`, `note`) is a
  starting set chosen to cover the two examples in the task contract ("stop editing X", "decision D superseded")
  plus two more that fit the same validator shape; it is not exhaustive and is meant to grow (each kind's check
  lives in one place, `steer/validate.ts`).
