// T74: live agent steering, modeled on Temporal's signal/update/query semantics (see
// tasks/T74-steering-dials/4 log/prior-art.md) delivered over the existing Claude Code hooks transport (T15/T37/T64).
//   signal  = a note the agent sees once on its next tool call/prompt (Temporal: fire-and-forget async write)
//   update  = a change checked by a validator before it is accepted, rejection reason returned when it is not
//             (Temporal: synchronous write with an Update Validator; here synchronous = the CLI call itself validates)
//   query   = read-only: what the agent is doing right now (intent, files, decisions in play), from @mole/agentstate (T18)
// State lives in a per-session, file-based inbox under .mole/local/steer/ (never committed, same convention as
// packages/memory/src/seen.ts's .mole/local/seen.jsonl) -- not under the Claude-Code-specific plugin data dir, so
// `mole steer` works for any session id regardless of which harness (or no harness at all) is steering it.
//
// T75: this inbox is the write side of steering (decision 0014: agent states are read-only over the harness
// transcripts) -- it lives in its own package, @mole/steer, so @mole/agentstate itself never performs a write call.
// `query` (read-only, built on agentstate's own run graph) stays in @mole/agentstate; see index.ts's re-export.

/** A one-shot note: delivered to the agent at most once (PreToolUse or UserPromptSubmit, whichever fires first). */
export interface SteerSignal {
  id: string;
  session: string;
  time: string; // ISO, when it was sent
  text: string;
  from?: string; // who/what sent it (free text: a person's name, another agent's run id, ...)
  delivered: boolean;
  deliveredAt?: string; // ISO
}

/** What a caller asks to change; `kind` + `target` are what the validator checks, `text` is what the agent reads. */
export interface SteerUpdateRequest {
  kind: string;
  target?: string; // file path (stop-editing) or decision id (decision-superseded); meaning depends on kind
  text: string;
  from?: string;
}

/** The validator's verdict, with the request it validated, kept whether accepted or not (rejected ones are never
 * delivered to the agent -- the rejection reason goes back to the caller that asked for the update, same turn). */
export interface SteerUpdateResult extends SteerUpdateRequest {
  id: string;
  session: string;
  time: string;
  accepted: boolean;
  reason?: string; // set when accepted === false
  delivered: boolean;
  deliveredAt?: string;
}

/** The whole per-session inbox file (.mole/local/steer/<session>.json). */
export interface SteerInbox {
  session: string;
  signals: SteerSignal[];
  updates: SteerUpdateResult[];
}

/** Items delivered by one `deliver` call (PreToolUse/UserPromptSubmit): newly-delivered, never repeated. */
export interface SteerDelivery {
  session: string;
  signals: SteerSignal[];
  updates: SteerUpdateResult[]; // accepted only: a rejected update was never queued for delivery
}

/** T87 review fix (HIGH): structural mirror of @mole/agentstate's own AgentStateSnapshot
 * (packages/agentstate/src/steer/query.ts) kept here too, field-for-field, so this package's public type for
 * `queryAgentState` (index.ts) does not require @mole/agentstate's source to be present (that package is
 * excluded from the public release export -- author-machine workflow, see scripts/export-public.mjs). The two
 * must be kept in sync by hand; agentstate's own copy is the source of truth for the shape. */
export interface AgentStateSnapshot {
  session: string;
  found: boolean;
  harness?: string;
  cwd?: string | null;
  start?: string;
  end?: string | null;
  steps?: number;
  intent?: string | null;
  filesInPlay?: string[];
  decisionsInPlay?: Array<{ id: string; title: string }>;
  lastStep?: { time: string; operation: string; kind: string; tool: string | null; command: string | null } | null;
}
