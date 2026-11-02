
## 11-02 17:40 follow-up fix: stated reasons in prose (parent, tests first)

The deferred limitation above is now fixed. `deriveAdrArgumentFramework` reads a stated reason that is not a bullet list:
", because …", ". Because …" (next sentence), ", since …", ", to …" (purpose clause); joins wrapped bullet lines
(markdown continuation); matches a quoted chosen option across a line break and with commas. Tests:
packages/decisions/test/argdown-prose-reasons.test.ts (8 cases, 6 red on the old code, all green after).
Real ADRs (python-tuf + log4brains, 20 with Considered Options + Decision Outcome): claim defended 9/20 before →
17/20 after. The 3 left as 'out' state no reason clause (0008 "The motivation for this decision is…", 0009 has no
"Chosen option" line, lunr gives the reason only under Pros and Cons) — not invented. Held-out NOT re-run (held-out
once rule); verdicts there were already unaffected (judge prompt treats an undefended claim as not void).
Decisions package: 32 files, 291 tests pass.

## 11-02 18:00 review 2 (deleg_15f56175) FAIL → fixed, tests first (4 red → green)
- P0 ", to be revisited…" was read as a reason → "to" purpose clauses dropped (too ambiguous); python-tuf 0004 now 'out'
- P0 unquoted "Chosen option: Modern Python. We picked it because…" swallowed the sentence → unquoted name stops at a
  sentence-ending period; the reason is the text after the first "because" in the paragraph right after the choice
- P1 real log4brains gitflow ADR: chosen option listed as its own rejected alternative → bold names + one-bullet
  containment match (only when exactly one bullet fits; else no guess, test with MADR 2.1.2 vs …with patch)
- P1 "## Decision Drivers" matched /^decision\b/ → went into the DECISION line of the judge prompt → fixed in
  rationale.ts AND the plugin's lib.mjs copy (parity test)
- P2 NOT fixed: CONTEXT block still repeats the raw Considered Options list next to the labelled blocks (noise, no label flip)
- real ADRs defended: 16/20 (was 9/20 before T54 follow-ups; 0004 lost on purpose) · decisions + plugin: 41 files, 317 tests
