## Summary
Prior art for T92 (D102): what Anthropic's own Claude Code hooks contract says about blocking (Stop
`decision: "block"`, PreToolUse `permissionDecision: "deny"`, `stop_hook_active`, exit code 2), fetched and
dated 2026-11-04, plus 3 real open-source Claude Code hook projects that already block on a PreToolUse
check, read for pattern (none of their code was copied — this task's implementation reuses Mole's OWN
`mole rules` engine as the crisp signal, per Raymond 11-04: integrate with the harness's own contract,
don't invent one). Open: none — this is a research-first pointer, not a design doc.

## Primary source: Anthropic Claude Code hooks reference (newest first)
1. **code.claude.com/docs/en/hooks** (fetched 2026-11-04, full page saved locally during this task at
   `/Users/a1/.hermes/cache/scratch/t92-hooks-docs.{html,txt}`, not committed — scratch only per rules).
   Exact wording, current as of this fetch:
   - **Stop decision control** (`#stop-decision-control`): `{"decision": "block", "reason": "..."}` —
     `reason` is "Required when decision is block. Tells Claude why it should continue." A hook that exits
     2 instead "routes the same way as reason: Claude receives the stderr message as the explanation."
     `additionalContext` is the non-blocking alternative, explicitly described as going "through the same
     loop protections as decision: block, namely the stop_hook_active input and the 8-consecutive-
     continuation cap."
   - **Stop input** (`#stop-input`): "The `stop_hook_active` field is `true` when Claude Code is already
     continuing as a result of a stop hook. Check this value ... to avoid blocking on a condition that will
     never resolve." And: "Claude Code applies an 8-consecutive-continuation cap: after stop hooks have
     continued the turn eight times in a row, Claude Code overrides the next block and ends the turn. ...
     To raise the cap, set `CLAUDE_CODE_STOP_HOOK_BLOCK_CAP`." T92 reuses `stop_hook_active` directly (never
     re-block when true) and adds its OWN smaller, independently-testable counter (`MOLE_STOP_BLOCK_CAP`,
     default 3) on top of — not instead of — this built-in cap, per the ux-research design note ("reuse
     that cap, don't build a new one").
   - **PreToolUse decision control** (`#pretooluse-decision-control`): the deprecated top-level
     `decision`/`reason` schema is replaced by `hookSpecificOutput.permissionDecision`
     (`"allow"|"deny"|"ask"`) + `hookSpecificOutput.permissionDecisionReason`. Anthropic's own worked example
     is literally a deny-with-reason:
     `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"Database writes are not allowed"}}`.
     T92's pre-tool-use.mjs uses exactly this shape.
   - **Exit code 2** (`#exit-code-2`, `#exit-code-output`): "Exit with code 2 to block the action. On events
     that can block, Claude Code stops the action." Both schema and exit-2 are valid; T92 uses the JSON
     schema (clearer field names, works the same across PreToolUse/Stop) rather than exit 2 + stderr.

## Open-source Claude Code hook projects that block (read for pattern, not copied)
2. **deskof0ne/denylist-hook** (github.com/deskof0ne/denylist-hook, fetched via web search 2026-11-04) — a
   PreToolUse hook denying destructive Bash commands (`rm -rf /`, `git push --force`, `DROP TABLE`, ...).
   Pattern confirmed: parse stdin JSON, fail closed on an unparseable command, one denylist-blocks.log per
   denial. T92 differs in kind (a deterministic AST/import-graph check, not a regex denylist) but the same
   "fail closed only on what you can prove, never on a guess" shape informed keeping by-meaning matches
   advisory-only.
3. **jvm-skills/jvm-skills** `examples/hooks/command-policy.sh` (fetched 2026-11-04) — PreToolUse Bash
   policy hook using the exact `hookSpecificOutput.permissionDecision: "deny"` schema with a `BLOCKED:
   <reason>` message; cites a real Claude Code GitHub issue (anthropics/claude-code#30519) for why a
   hook-based policy exists instead of relying on `permissions.deny` alone (compound commands with `&&`/`;`
   aren't matched by permission wildcards). Confirms the deny-with-reason shape is the established
   community pattern, not Mole-specific.
4. **anthropics/cwc-long-running-agents#2** (fetched 2026-11-04) — a real bug report showing three hook
   scripts (`kill-switch.sh`, `steer.sh`, `verify-gate.sh`) that blocked PreToolUse using the OLD deprecated
   top-level `decision`/`reason` schema and were silently ignored by current Claude Code, with the exact
   two-line fix (swap to `hookSpecificOutput.permissionDecision`/`permissionDecisionReason`). Direct
   confirmation that the schema distinction (Stop = top-level `decision`/`reason`; PreToolUse =
   `hookSpecificOutput.permissionDecision`) is not cosmetic — using the wrong one for an event silently does
   nothing, which is exactly the shape of bug D102 was raised to prevent happening to Mole's own hooks.

## Mole's own source, read to confirm the gap (not new reading for this task — carried over from
`ux-research 11-04/0 summary.md` item #1, re-confirmed here)
- `plugins/claude-code/scripts/stop.mjs` (pre-T92): computed `ruleViolationsText` (a real crisp violation)
  but only ever emitted it as `systemMessage` text; the `additionalContext`-continue path existed but was
  gated behind `MOLE_STOP_CONTINUE === '1'`, off by default — never `decision: "block"`.
- `plugins/claude-code/scripts/pre-tool-use.mjs` (pre-T92): comment at the bottom read "intentionally no
  permissionDecision field: Claude Code allows the tool call as normal (never a block)."
- `context/product-plan/systems/metrics-proof/productivity/results-72.md` (T63, 72 pre-registered runs):
  "Mole's hooks named the right decision for 15 of 18 scored checks; the agent still missed decisions it
  had just been shown, and in this setup the end-of-run check did not force a fix" — the null result this
  task exists to fix the root cause of (not to re-run; v2 protocol reruns separately, out of this task's
  boundary).

## Decision this task implements
`context/product-plan/systems/decisions.jsonl` D102 (2026-11-04, ACCEPTED): "Agents must be stopped, not
just told: Claude Code Stop hook blocks by default (decision: block + reason) when a crisp rule from an
accepted decision is violated, PreToolUse denies an edit that adds a crisp-rule violation, judged
by-meaning items stay advisory; opt-out env documented. Also fix stale CLI --help, add the
AGENTS.md/CLAUDE.md precedence sentence and a CI snippet in the README."
