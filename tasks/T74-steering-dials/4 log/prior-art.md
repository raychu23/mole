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
