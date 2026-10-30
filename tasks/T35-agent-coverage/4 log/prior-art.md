# T35 prior art (R0, read before the red-tests commit)

## 1. git-ai (trialed already: `context/product-plan/systems/tool-trials/round 2/findings.md`, fetched/run 2026-10-29)
- https://github.com/git-ai-org/git-ai — verdict from round 2: **integrate** (read its output), not rebuild. 72/72 lines right through 6
  rewrites (amend, rebase, squash, cherry-pick, stash) with a mock agent; attribution lives in `refs/notes/ai`, one git note per
  commit naming which lines an agent wrote vs a human, survives history rewrites because it's addressed by commit, not line number.
  Weakness found: it only sees work after install (0/80 existing Mole commits carry notes) and under-credits an agent when the
  human's own typing isn't itself checkpointed (57/72 in that case).
- Takeaway for T35: a commit-indexed note (git notes namespace) is the right place to store attribution once computed, because it
  travels with the commit through rebases; but it must be populated by reading transcripts/commits after the fact (git-ai's
  instrumentation is forward-only), so T35 computes attribution by re-deriving it from existing logs each scan rather than
  depending on an install having been present — same conclusion the round-2 trial reached for other builders (T18 already reads
  history after the fact).

## 2. Cursor's Agent Trace spec
- https://github.com/cursor/agent-trace (README + `schemas.ts`, checked 2026-10-29 via web_search). Published as RFC v0.1.0,
  January 2026, with Cognition (Devin) and Google Jules as drafting partners; a vendor-neutral JSON Schema
  (`https://agent-trace.dev/schemas/v1/trace-record.json`) for "1 record = 1 edit event": `{version, id, timestamp, vcs, tool,
  files:[{path, conversations:[{contributor:{type, model_id}, ranges:[{start_line, end_line}], url}]}]}`. The reference
  implementation (`reference/trace-store.ts`, `reference/trace-hook.ts`) appends records to a sidecar JSONL file
  (`.agent-trace/traces.jsonl`) on file-change hooks; it is a data spec, not a product, and storage is implementation-defined.
- Takeaway for T35: Agent Trace's per-file `conversations[]` with a `contributor` + line `ranges` + a link back to the
  conversation is structurally the same shape T35's own `agents:[{harness, session, read, edited, last}]` needs, and confirms
  file+line attribution linked back to the originating session/conversation is the field's own going standard (not just
  Mole's invention). T35 does not adopt `.agent-trace/traces.jsonl` as a write target (it requires a hook installed going
  forward, same forward-only limit git-ai had in the round-2 trial, 0/80 existing Mole commits had notes); T35 instead
  *computes* the equivalent record after the fact from existing session logs, matching Agent Trace's record shape in its own
  JSON output (`agents[]` entries carry the same `harness`/`session`/`time` fields an Agent Trace `conversations[]` entry would)
  so the output is compatible with that spec's intent even though it isn't written as `.agent-trace/traces.jsonl`.

## 3. Claude Code / Codex session file formats
- Claude Code: `~/.claude/projects/<slug>/<session-uuid>.jsonl`, one JSON object per line, `message.content[].type === "tool_use"`
  entries carry `name` + `input` (e.g. `Edit`/`Write`/`Read` with `file_path`); subagent runs are separate files under a
  `subagents/` subfolder with a sibling `.meta.json` naming the parent `toolUseId`. Confirmed by reading
  `packages/agentstate/src/index.ts` (`claudeRun`, `children()`), which already implements this reader (T18, 2026-10-28/29).
- Codex: `~/.codex/sessions/<year>/<month>/*.jsonl`, first line's `payload.cwd` gives the working directory, subsequent lines'
  `payload.{type,name,arguments|input}` carry tool calls (`local_shell_call`, `apply_patch`, etc). Also already implemented in
  `packages/agentstate/src/sources.ts` (`codexRun`, `codexMeta`).
- Takeaway: T35 does not re-implement these readers. It imports `@mole/agentstate`'s `attribute()`, `listRuns()`, `agents()`
  (read-only per the task boundary) because T18 already solved "which run/step edited this file, with re-checkable evidence"
  at 100% (542/542) on this exact repo's history (`packages/agentstate/bench/m6.ts`, M6). Re-deriving a parallel transcript
  parser would duplicate that work and risk a worse number; T35's job is the *join* (sessions → files → human reads → tests →
  decisions → weak-spot reasons), not re-parsing transcripts from scratch.

## 4. Code coverage data models (Istanbul / lcov)
- lcov `.info` format (https://ltp.sourceforge.net/coverage/lcov/geninfo.1.php, spec reviewed 2026-10-29): per source file,
  `FN`/`FNDA` (function hit counts), `DA` (line hit counts), `BRDA` (branch hit counts) — a flat per-file record keyed by path,
  with counts, not identities. Istanbul's `coverage-final.json` (https://github.com/istanbuljs/istanbuljs, docs reviewed
  2026-10-29) nests `statementMap`/`fnMap`/branch maps per file with a `path` key and hit counts per id.
- Takeaway: the per-file-keyed, nested-map shape (file → {thing → count/detail}) is the right precedent for Mole's own
  `{file, agents:[], human:{}, tests:[], decisions:[], weak:{}}` schema — same idea as lcov's "coverage is counted per file,
  not globally" — but T35 substitutes "hit count" with "which agent session, when" because the question here is attribution
  and staleness, not execution counts. T22 (`packages/verify/src/testmap.ts`) already builds the test-reachability side of
  this (which tests reach a file) the same per-file way; T35 reads that module read-only rather than recomputing reachability.

## 5. Code ownership research (Bird et al., "Don't Touch My Code!", FSE 2011)
- https://www.microsoft.com/en-us/research/publication/dont-touch-my-code-examining-the-effects-of-ownership-on-software-quality/
  (abstract + findings reviewed 2026-10-29). Finding: modules with low-ownership contributors (many minor contributors, no
  single author responsible for most of a component) have significantly more post-release defects; ownership is defined per
  module as the contributor with the highest share of commits touching it, and "minor contributors" (below a share threshold)
  are the risk signal, not just contributor count.
- Takeaway for the weak-spot reason: "agent-edited, no human read since, no guarding test" is Mole's analogue of Bird's
  low-ownership signal, but inverted — the risk isn't *many* owners, it's *zero human* ownership (no read-log entry) over code
  an agent changed. T35's weak-spot flag follows the same "per-file, from commit/attribution history, thresholded" shape Bird's
  methodology uses, substituting Mole's own seen-log (T13) for Bird's commit-share ownership metric, because Mole tracks human
  *reads*, not just commits, as the proxy for understanding (per D31/D24, the project's accepted framing).

## 6. GitHub CODEOWNERS
- https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners
  (reviewed 2026-10-29). CODEOWNERS maps path globs to people/teams who are auto-requested for review; it is static, hand-
  maintained, and silent about whether an owner has actually looked at a given later change — a known gap also raised by T32's
  own prior-art pass (team PR check).
- Takeaway: CODEOWNERS answers "who is *responsible*", not "who actually read/edited this, when, and is that getting stale" —
  the gap T35 fills. T35 does not add a CODEOWNERS parser (T32 already owns "which decision/owner governs these lines"); T35's
  per-file `decisions` field reads T29's existing decision-flag output (read-only) instead of re-deriving ownership.

## method picked (and why), vs the field's own measure
- **Attribution (M27a)**: reuse `@mole/agentstate`'s `attribute()` (T18, already verified 100% on this repo's own commit
  history via its own bench, `packages/agentstate/bench/m6.ts`) rather than writing a second transcript parser. The *key*
  (ground truth) for T35's own bench is built by a **different** method again, as R1 requires: `git log <branch>` filtered to
  each 10-29 overnight builder's own session time window (from the Hermes `sessions` table's `started_at`/`ended_at` columns —
  session *metadata*, not transcript/message content — crossed with `context/agents/registry.json`'s static branch-ownership
  record), then `git diff-tree --name-only` per commit for the file list. This never parses a tool-call/message body, so it is
  independent of the transcript-based code under test, per R1's explicit requirement ("the key's truth from a DIFFERENT method
  than the code under test, e.g. git log on ledger branches, not transcript parsing").
- **Weak spots (M27b)**: computed by code only (R6) from the joined per-file record (agent edits, T13's seen-log, T22/T28's
  guarding-test map, T29's decision flags) — no model call, mirroring T29's own M21 (decision flags, 100% code-computed) and
  the round-2 trial's finding that the one model-judged metric (Graphiti's "is this superseded?") scored worst (3/10) of
  everything tried; T35 follows T29's code-only precedent instead.
- **Latency (M27c)**: cached-scan-then-query shape follows Istanbul/lcov's own split (instrument once, query the map many
  times) and T29's own recompute benchmark (1,000 decisions, p95 398 ms, `packages/decisions/bench/m21.ts`).
