## Summary
Built `mole steer signal|update|query|deliver`: a tiny Temporal-style signal/update/query contract for steering a
running agent, over the existing hooks transport. `signal` queues a one-shot note; `update` is checked by a
validator before it's queued and a rejection carries its reason and is never delivered; `query` reads the agent's
current intent/files/decisions from @mole/agentstate's own run graph (T18). State lives in a per-session,
file-based inbox under `.mole/local/steer/` (never committed). Steering is delivered exactly once via
PreToolUse (Edit|Write only) and UserPromptSubmit, as `additionalContext`, never a block. Delivery is atomic:
every read-modify-write of the inbox (signal/update/deliver) runs inside `withInboxClaim` (store.ts), which since
Review 2 is backed by `proper-lockfile` (mkdir-based lock directory, mtime-refresh staleness, stale reclaim) --
the canonical inbox file is never moved away, only ever read -> mutated -> written to a temp file -> renamed over
itself while the lock is held. `steerDeliverText` never spawns the CLI for an empty inbox.

## Review 2 fixes (finding -> fix -> proof)
- **HIGH** (Review 1's `withInboxClaim` hand-rolled mutual exclusion by renaming the canonical inbox to a unique
  claimed name and back; on `ENOENT` it could not tell "no inbox yet" from "inbox currently claimed by ANOTHER
  process" -- both look identical to a failed `renameSync` -- so it guessed "bootstrap a fresh empty inbox" and
  looped back to claim THAT, meaning two racers could each mutate their own empty copy and whichever renamed back
  LAST won, silently discarding the other's items; reviewer measured 98 successful sends -> 6 survived. A kill
  -9'd claimer also orphaned its claimed file forever, since nothing ever looked for it again, so the next writer
  started from empty too. The Review 1 stress test never caught this because it sent all 400 items BEFORE any
  deliverer started -- it only ever raced deliverers against each other, never a sender against a deliverer) ->
  fix: stopped hand-rolling. `store.ts`'s `withInboxClaim` now wraps every read-modify-write in `proper-lockfile`
  (moxystudio, npm, mature/widely-used): a SEPARATE mkdir-based lock directory next to the (never-moved) canonical
  inbox, so "claimed by someone else" and "doesn't exist yet" are two independent, unambiguous facts instead of
  the same ENOENT. Stale reclaim (mtime refresh via `update` while held, a new acquirer's own `stale` option
  decides staleness) replaces the old scheme's permanent kill-9-orphan failure mode with a bounded, self-healing
  one; `onCompromised` logs instead of throwing, so a lock lost out from under a holder never crashes the process.
  The write itself still follows Review 1's Maildir/git-lockfile "read -> mutate -> write temp -> atomic rename
  onto canonical" idiom, just with the canonical path itself never renamed away. `withInboxClaim`'s retry budget
  (default 30 attempts x 80ms ~= 2.4s, fits comfortably inside the hooks' 15s timeout) is bounded; on timeout it
  throws, and `deliverPending` (index.ts) catches that specific case and returns an empty delivery instead of
  propagating -- a hook that cannot get the lock in time delivers nothing THIS CALL and exits 0, the item(s) stay
  queued in the untouched canonical file, never lost. Leftover `*.claim-*` files from the OLD scheme are folded
  back into the inbox (`foldOrphanedClaims`, inside the new lock, every call) so nothing queued before this
  upgrade is lost. Added `proper-lockfile` + `@types/proper-lockfile` as real dependencies (not hand-rolled) ->
  proof: rewrote `packages/agentstate/test/steer-stress.test.ts` for the reviewer's exact scenario -- 8 concurrent
  SENDER processes x 8 concurrent DELIVERER processes launched together (senders keep adding WHILE deliverers are
  already polling, not sent-then-raced) over 20 iterations (2400 items total): every sent item delivered exactly
  once, none lost, none doubled. Confirmed red first: ran this new test against the OLD claim-rename
  `withInboxClaim` (git-stashed back to Review 1 state) -- it failed immediately with a JSON parse error
  ("Unexpected end of JSON input" mid-claim, the exact "two racers both renamed, one clobbered the other's
  half-written file" corruption window) rather than merely losing items, an even sharper failure than the
  reviewer's silent-loss description; restored the fix and all 4 new tests pass (verbatim captures in
  `tasks/T74-steering-dials/4 log/red.txt`'s "Review 2 fixes" section). Two additional new tests cover the kill -9
  case directly (a process holding the lock is SIGKILL'd mid-mutation; a later `deliverPending` call eventually
  succeeds once the lock goes stale, and the pre-existing item survives while the killed process's never-written
  mutation does not) and the hook-budget case (a long-held, non-stale lock makes `withInboxClaim` give up within
  ~2.5s and `deliverPending` returns `{signals:[],updates:[]}` rather than throwing, and the queued item is still
  there -- delivered later once the lock frees up).

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
- `packages/agentstate/test/steer-stress.test.ts` (Review 2 rewrite): 4 tests -- 8x8 interleaved senders/
  deliverers x 20 iterations (2400 items, none lost/doubled), kill -9 stale reclaim, orphaned `*.claim-*`
  migration, and lock-acquire-timeout-fits-hook-budget. Red against the OLD claim-rename scheme (all 4 failed,
  the main race test with a JSON-parse corruption error, not merely a lost item); green after the proper-lockfile
  rewrite.
- Full regression (post Review 2 fixes): `npx tsc -b` clean; `npx vitest run packages/agentstate plugins/claude-code
  packages/daemon` = 208/208 passed (25 test files, including every pre-existing T15/T18/T21/T24/T37/T64/T65 hook
  and agentstate test, all Review 1 + Review 2 steer test files, and daemon's own 23 tests, all in one run).

## Proof paths
- `tasks/T74-steering-dials/4 log/prior-art.md` (Temporal handling-messages/message-passing/TypeScript SDK docs,
  Claude Code hooks reference + additionalContext issue history, LangGraph interrupt/human-in-the-loop docs,
  (Review 1) Maildir delivery + git's lockfile API, and (Review 2) proper-lockfile's own docs/source; all fetched
  and dated 2026-11-03).
- `tasks/T74-steering-dials/4 log/red.txt` (red captures, verbatim, including the Review 1 and Review 2
  stress-test red/green cycles).
- `tasks/T74-steering-dials/4 log/bench/review1-high2-latency.txt` (HIGH 2 before/after timing, n=30).

## NOT RUN
- Nothing. Every check in this task's scope (`tsc -b`, the steer/steer-hook/steer-stress test files, the full
  `agentstate` + `claude-code` + `daemon` suites, the HIGH 2 latency bench, the HIGH 3 and Review 2 stress-test
  red/green cycles) ran for real; no model calls were needed (validators and query are deterministic, zero-LLM,
  same as the rest of this plugin's hooks). The one thing explicitly NOT built: a separate any-tool-matcher hook
  (the task's fix spec made this optional -- "if a separate any-tool hook is kept at all" -- and PreToolUse
  Edit|Write + UserPromptSubmit already satisfy "before the agent's very next edit or next prompt" without
  reintroducing HIGH 1's matcher-widening regression, so it was not added; no n>=30 any-tool-hook latency
  measurement was needed as a result).

## Limits (INFERENCE)
- INFERENCE: decision-scope matching for `queryAgentState`'s `decisionsInPlay` and for `validateUpdate`'s
  `decision-superseded` kind is a light, hand-rolled parse (id/title/scope only) -- it does not use the real citator
  graph (`@mole/decisions`) or compute live flags. A decision renamed/retired through the real engine but still
  present as a `.md` file would still validate as "exists" here. This mirrors the SAME simplification
  `plugins/claude-code/scripts/lib.mjs` already makes on purpose (dependency-free hooks), so it is consistent with
  the existing codebase's risk profile, not a new one.
- INFERENCE: ~~`deliverPending`'s read-modify-write has no file lock.~~ FIXED in Review 1 (HIGH 3), then the
  mechanism itself replaced in Review 2 after a real data-loss bug was found in the Review 1 claim-rename scheme
  under sender/deliverer interleaving. See `withInboxClaim` (store.ts, now `proper-lockfile`-backed) and the
  "Review 2 fixes" section above -- proven by `packages/agentstate/test/steer-stress.test.ts`'s 8-sender x
  8-deliverer x 20-iteration interleaved race (2400 items), kill -9 stale-reclaim, and orphan-migration tests.
- INFERENCE: `withInboxClaim`'s retry loop is bounded (default 30 attempts x 80ms, ~2.4s ceiling) and on timeout
  `deliverPending` catches it and returns an empty delivery (never a throw out of the public `deliver` path) --
  but `sendSignal`/`requestUpdate` still let the lock-timeout error propagate (a human/agent sending a signal
  should know it failed to queue, unlike a hook's silent `deliver`). Not exercised beyond 8 concurrent senders x 8
  concurrent deliverers; widening either count is a one-parameter change in the stress test if a higher proven
  ceiling is needed later. `proper-lockfile`'s `stale` option has a library-enforced 2000ms floor regardless of
  what is passed -- a `staleMs` below that is clamped, not honored exactly (confirmed empirically while writing
  the kill-9 test).
- INFERENCE: `requestUpdate`'s `KNOWN_UPDATE_KINDS` (`stop-editing`, `decision-superseded`, `scope`, `note`) is a
  starting set chosen to cover the two examples in the task contract ("stop editing X", "decision D superseded")
  plus two more that fit the same validator shape; it is not exhaustive and is meant to grow (each kind's check
  lives in one place, `steer/validate.ts`).
