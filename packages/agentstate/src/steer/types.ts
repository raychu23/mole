// T74: live agent steering, modeled on Temporal's signal/update/query semantics (see
// tasks/T74-steering-dials/4 log/prior-art.md) delivered over the existing Claude Code hooks transport (T15/T37/T64).
//   signal  = a note the agent sees once on its next tool call/prompt (Temporal: fire-and-forget async write)
//   update  = a change checked by a validator before it is accepted, rejection reason returned when it is not
//             (Temporal: synchronous write with an Update Validator; here synchronous = the CLI call itself validates)
//   query   = read-only: what the agent is doing right now (intent, files, decisions in play), from @mole/agentstate (T18)
// State lives in a per-session, file-based inbox under .mole/local/steer/ (never committed, same convention as
// packages/memory/src/seen.ts's .mole/local/seen.jsonl) -- not under the Claude-Code-specific plugin data dir, so
// `mole steer` works for any session id regardless of which harness (or no harness at all) is steering it.

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

/** Query: what the agent is doing right now, read from @mole/agentstate's own run graph (T18) -- never from the
 * steer inbox, which is a different concern (query is read-only and carries no steering state). */
export interface AgentStateSnapshot {
  session: string;
  found: boolean; // false when no source (hermes/claude-code/codex) has this run
  harness?: string;
  cwd?: string | null;
  start?: string;
  end?: string | null;
  steps?: number;
  intent?: string | null; // a short description of the run's last step, or its title
  filesInPlay?: string[]; // files this run has edited so far
  decisionsInPlay?: Array<{ id: string; title: string }>; // .mole/decisions whose scope covers filesInPlay
  lastStep?: { time: string; operation: string; kind: string; tool: string | null; command: string | null } | null;
}
