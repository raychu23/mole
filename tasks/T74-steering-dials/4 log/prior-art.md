---
task: T74-steering-dials
---
# Prior art (fetched + dated before design)

Design source: decision D76 (`context/product-plan/systems/decisions.jsonl`, 2026-10-30, status OPEN) -- live agent
control "steered via Temporal-style signal / update / query through hooks", superseding a rejected NOW/ASK/STEER/DIALS
sidebar mock from the same day. D76 names three concrete models to borrow from; all three fetched 2026-11-03.

## 1. Temporal: workflow signals, queries, updates (fetched 2026-11-03)
- https://docs.temporal.io/handling-messages ("Handling Signals, Queries, & Updates")
- https://docs.temporal.io/encyclopedia/workflow-message-passing
- https://docs.temporal.io/develop/typescript/workflows/message-passing (Update Validators, TypeScript shape)

What it says: three message kinds to a running workflow --
- **Query**: synchronous read, cannot block, never changes workflow state or history.
- **Signal**: asynchronous write, "fire and forget", no result/exception for the sender; the workflow processes it
  whenever it next runs.
- **Update**: synchronous, tracked write. A sender can optionally define an **Update Validator**: a read-only check
  run before the handler. If the validator throws, the update is **rejected** (never written to history, caller gets
  the rejection reason) instead of **accepted** (then the handler runs and can return a result). Validators cannot
  block and run exactly once per update (dedup by Update ID).

**What we borrow:** the three-way split signal/update/query and, specifically, "a validator decides accept/reject
before anything is written, and a rejection carries a reason and is never delivered" -- this is the whole shape of
`mole steer update`. "Exactly once" for message delivery (Temporal: dedup by Update ID / idempotency key) maps onto
our hook-side `deliver` call: it marks items delivered and never returns them again.

**What does not fit:** Temporal workflows are long-running, replayable state machines with a durable Event History;
an agent session here is a transcript file + git worktree with no replay/determinism requirement. We do not need
Update IDs for dedup (our inbox file already tracks delivered: true per item, one file per session, no retries to
collide with) or a worker polling a task queue (the "worker" is the next PreToolUse/UserPromptSubmit hook, which
Claude Code already schedules). We also do not implement Signals-vs-Updates' throughput/concurrency limits -- out of
scope at this task's steering-only grain (file writes, not a workflow engine).

## 2. Claude Code hooks: additionalContext, PreToolUse/UserPromptSubmit (fetched 2026-11-03)
- https://docs.claude.com/en/docs/claude-code/hooks (hooks reference: hookSpecificOutput.additionalContext, event
  cadence table, "never blocks" semantics per event)
- https://github.com/anthropics/claude-code/issues/18465 (additionalContext support history for PreToolUse)
- https://github.com/obra/superpowers-developing-for-claude-code/.../hooks.md (hook I/O shapes, matcher syntax)

What it says: `hookSpecificOutput.additionalContext` is a string Claude reads on its next model request without it
appearing as a chat message (a "system reminder"); PreToolUse/PostToolUse put it "next to the tool result",
UserPromptSubmit "alongside the submitted prompt". PreToolUse CAN block (via `permissionDecision`/`decision`), but a
hook that returns only `additionalContext` (no decision/permissionDecision field) never blocks the tool call -- this
repo's existing hooks (`pre-tool-use.mjs`, `user-prompt-submit.mjs`) already rely on exactly that, and it is this
task's STOP condition ("a hook that blocks or fails the session").

**What we borrow:** steering is delivered the same way the existing decisions/collisions context already is --
`hookSpecificOutput.additionalContext`, clipped to MAX_CHARS, no decision field ever set. We widened PreToolUse's
matcher from `Edit|Write` to `*` (hooks/hooks.json) so a signal is seen on the agent's very next tool call, not only
its next edit -- matches D76/T74's own wording ("the agent sees once on its next tool call").

**What does not fit:** Claude Code hooks have no notion of a validated, synchronous "write with accept/reject" the
way Temporal Updates do -- a hook's only control surface is block/allow + additionalContext. `mole steer update`'s
validation therefore happens entirely in the CLI call itself (synchronous, same process, same semantics as a
Temporal Update Validator), not in the hook; the hook only ever *delivers* an already-accepted update, it never
validates.

## 3. LangGraph: interrupt() / human-in-the-loop (fetched 2026-11-03)
- https://docs.langchain.com/oss/javascript/langgraph/human-in-the-loop (Interrupts)
- https://reference.langchain.com/python/langgraph/types/interrupt
- https://docs.langchain.com/oss/javascript/langchain/frontend/human-in-the-loop

What it says: `interrupt(value)` pauses a graph node and surfaces a value to a client; the client resumes with
`Command({resume: ...})`, which re-executes the node from its start. Interrupts need a checkpointer (durable state)
and are explicitly **not** multi-turn "ask a question, keep going" -- resuming re-runs the whole node. Human-in-the-
loop approval middleware (`interruptOn`) pauses before specific tool calls for approve/reject, keyed by interrupt id.

**What we borrow:** the idea that a human (or another agent) can inject a decision mid-run without the running agent
polling for it -- and that "approve/reject with a reason" (interruptOn's approve/reject) is the right shape for a
synchronous gate, which lines up with Temporal's Update Validator and this task's `mole steer update`.

**What does not fit:** LangGraph interrupts require a checkpointer and a graph the client is actively streaming --
they pause execution until resumed. `mole steer signal`/`update` never pause the agent; the agent keeps running and
simply sees the note on its next tool call, closer to Temporal's non-blocking Signal than to a blocking interrupt.
We deliberately do NOT add a blocking gate (the task's STOP condition forbids it) -- this is the one place D76's
"Temporal-style" framing and LangGraph's interrupt pattern diverge, and we followed Temporal/the explicit STOP
condition, not LangGraph's pause-and-resume.

## Net design (what actually got built)
- `packages/agentstate/src/steer/`: `SteerSignal` (Signal), `SteerUpdateRequest`/`SteerUpdateResult` (Update +
  Validator verdict), `AgentStateSnapshot` (Query, built on T18's `getRun`). File-based inbox,
  `.mole/local/steer/<session>.json`, never committed (same convention as `packages/memory/src/seen.ts`).
- `mole steer signal|update|query|deliver` (`packages/daemon/src/cli.ts`, light entry like T24's `claims`).
- `plugins/claude-code/scripts/lib.mjs`'s `steerDeliverText` + wiring into `pre-tool-use.mjs` (matcher widened to
  `*`) and `user-prompt-submit.mjs`: both call `mole steer deliver --session <id> --json` and surface the result as
  `additionalContext`, never a decision field -- so the hook never blocks, matching Claude Code's own
  block-vs-additionalContext split above.

## Review 1 additions (fetched + dated 2026-11-03): atomic inbox claim (HIGH 3)

### 4. Maildir delivery: tmp -> new is atomic via rename() (fetched 2026-11-03)
- https://en.wikipedia.org/wiki/Maildir
- https://manpages.debian.org/stretch/qmail/maildir.5.en.html (qmail's original maildir(5) spec)

What it says: a message is written privately into a maildir's `tmp/` subdirectory under a name guaranteed unique
(`time.pid.host`), then becomes visible to every reader in one step by a `rename()` (or link()+unlink()) into
`new/`. POSIX `rename()` within one filesystem is atomic -- every other process sees either the whole old state or
the whole new state, never a partial write -- so readers never need to coordinate with the writer through a
separate lock, and this is exactly why Maildir works even over NFS where `flock()`/`fcntl()` locking was unreliable.

**What we borrow:** the inbox file itself doubles as its own mutual-exclusion token. `withInboxClaim`
(`packages/agentstate/src/steer/store.ts`) renames the canonical inbox to a unique per-process "claimed" name;
`rename()`'s atomicity guarantees at most one racer's rename can succeed against a given canonical path, so the
winner is provably the only process holding the content. It mutates, then renames back to release -- the Maildir
"publish by rename" step, run in reverse (claim by rename, publish-the-release by rename).

**What does not fit:** Maildir's three-subdirectory (`tmp`/`new`/`cur`) layout models a queue of many
independently-named messages a reader drains one at a time; our inbox is a single small JSON document per session
(all pending signals/updates in one file), so there is no `tmp`/`new` split -- the "claim" step plays the role
`tmp` would, and the single canonical path plays the role `new`/`cur` would, collapsed into one file since the
whole inbox is cheap to read-modify-write in one shot.

### 5. git's lockfile API: O_EXCL create + rename to commit (fetched 2026-11-03)
- https://git-scm.com/docs/api-lockfile/2.0.5 (git's own technical docs for the mechanism behind `.git/index.lock`)
- https://stackoverflow.com/questions/20268300/what-does-the-git-index-lock-file-actually-do (citing the same docs)

What it says: "when we write out a new index file, first we create a new file `$GIT_DIR/index.lock`, write the new
contents into it, and rename it to the final destination `$GIT_DIR/index`. We try to create the `index.lock` file
with `O_EXCL` so that we can notice and fail when somebody else is already trying to update the index file."
Automatic cruft removal (an atexit/signal handler unlinking stale lock files) is the other half of the API.

**What we borrow:** the bootstrap case -- a session's very first `mole steer signal` call, when no inbox file
exists yet at all -- uses the identical `O_EXCL` idiom (`openSync(canonical, 'wx')`): only one of several racers
creating a brand-new inbox can win the exclusive create, and the loser retries the normal claim-by-rename loop
instead of silently overwriting the winner's write (the bug a plain `writeFileSync` on first-use would have).

**What does not fit:** git's lockfile is a SEPARATE file (`index.lock`) next to the file it protects, with explicit
commit/rollback calls and crash cleanup via atexit handlers; we fold the lock into the protected file itself (no
separate `.lock` file to go stale) because a `mole steer` CLI process is always short-lived and synchronous end to
end -- there is no long-held lock across an async boundary that could be abandoned by a crash the way git's
lockfile API explicitly guards against, so we accepted a simpler bounded-retry loop (300 attempts x 10ms, ~3s
ceiling, comfortably inside the hooks' own 15/30s timeouts) instead of git's cleanup machinery.

## Review 2 additions (fetched + dated 2026-11-03): proper-lockfile replaces the hand-rolled claim-rename scheme

### 6. proper-lockfile (moxystudio/node-proper-lockfile, npm, v4.1.2) -- fetched 2026-11-03
- https://github.com/moxystudio/node-proper-lockfile (README: design, mtime staleness, "Compromised" section)
- https://www.npmjs.com/package/proper-lockfile
- https://www.npmjs.com/package/@types/proper-lockfile (TypeScript types: `LockOptions.stale/update/retries/
  onCompromised`, `lock`/`lockSync`/`unlock`/`check` + Sync variants)

What it says: creates a lock as a DIRECTORY next to the protected file (`${file}.lock`) via `fs.mkdir`, which is
atomic the same way `O_EXCL` is (`mkdir` either succeeds -- we hold the lock -- or fails `EEXIST` -- someone else
does). While held, the lock's mtime is periodically refreshed (`update` interval, default `stale/2`) so a live
holder's lock never looks abandoned; if a NEW acquirer finds an existing lock dir whose mtime is older than ITS
OWN `stale` option, it treats the holder as dead, removes the lock dir, and reclaims it -- this is per-acquisition
(the new claimant's own `stale`, not whatever the original holder set), confirmed by reading `lib/lockfile.js`'s
`acquireLock`/`isLockStale`. `onCompromised` fires if the lock is lost unexpectedly (e.g. reclaimed as stale while
the original holder still thought it was alive); the library's own default is to throw, which this repo's
callback overrides to a stderr log instead, since a hook-adjacent CLI must never crash. `lockSync`/`unlockSync`
exist (used here) but forbid `retries > 0` (`toSyncOptions` throws `ESYNC`) since retrying needs an async wait --
`withInboxClaim` (store.ts) does its own bounded `sleepSync`-based retry loop around single `lockSync` attempts
instead, so the whole call stays synchronous (no ripple of `async`/`await` through `sendSignal`/`requestUpdate`/
`deliverPending`/the CLI, which were all synchronous before this fix and still are).

**What we borrow:** the entire mutual-exclusion mechanism, replacing Review 1's hand-rolled claim-by-rename. The
reviewer's HIGH finding was specific to the rename scheme: renaming the canonical file away to claim it meant
"claimed by someone else" and "doesn't exist yet" were the SAME observable state (ENOENT) to a racer, and the old
code's guess (ENOENT = bootstrap a fresh empty inbox) was wrong exactly when it mattered (contention). A
mkdir-based lock DIRECTORY next to an UNTOUCHED canonical file removes that ambiguity entirely: the canonical
file's existence and the lock directory's existence are two independent, unambiguous facts, so there is no state
where "the file is gone" could mean two different things. Stale reclaim replaces the old scheme's permanent
kill -9-orphan failure mode (nothing ever looked for an abandoned claimed file again) with a bounded, self-healing
one.

**What does not fit:** proper-lockfile's library default (`onCompromised` throws, `stale` floor 2000ms, no
built-in retry budget tuned for a 15s hook timeout) is tuned for general-purpose file locking, not this task's
specific "hooks must fit inside ~3s of an overall 15s budget" constraint -- `withInboxClaim`'s own retry loop
(default 30 attempts x 80ms, ~2.4s) and `onCompromised` override are both this task's values layered on top of
the library's mechanism, not the library's own defaults.

### 7. Review 2 migration note: folding Review 1's orphaned `*.claim-*` files
Not third-party prior art -- a one-time compatibility step this task's own fix needed. Any `<canonical>.claim-*`
file left over from the OLD scheme (a kill -9'd claimer that never renamed back) is read, its signals/updates
merged into the in-memory inbox, and the file deleted -- inside the NEW lock, on every `withInboxClaim` call (see
`foldOrphanedClaims`, store.ts). This runs unconditionally rather than once-at-startup because there is no reliable
"have we migrated yet" flag to check that would be simpler than just re-scanning a small directory each time; the
scan is a no-op once no orphans remain.

