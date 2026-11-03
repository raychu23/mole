
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

## 11-02 18:05 review 3 (deleg_e17ab4d3) FAIL → fixed (2 new tests: red without the fix, green with)
- round-2 P0/P1 all confirmed fixed · P2 deferred (accepted) · dotted names (Node.js 18, MADR 2.1.2) + containment + TS/JS parity OK
- P1 new: fallback took the first "because" in the paragraph, even one about a REJECTED option ("almost chose Y because…,
  but selected X since…") → now only the first sentence holding "because", and only if it names no rejected option and
  doesn't turn (but/however/although/though); unsure → no reason (claim undefended), never a guess
- limit: when the ADR lists no Considered Options, a sentence about an unlisted option can't be detected by name
- real ADRs still 16/20 defended · decisions + plugin 41 files, 319 tests

## 11-02 18:10 review 4 (deleg_e03f57e3) FAIL → fixed (2 new tests red → green)
- round-3 P1 fixed for its trigger · real ADRs 16/20 unchanged · as/given-that/not-because = conservative misses (P2), no misattribution
- P1 siblings: "i.e." split the sentence away from the rejected name · rejected option named by one word ("Legacy" for
  "Legacy Python 2.7 Runtime") → guard rewritten: the text BEFORE the first "because" (no sentence split) may not hold any
  word only a rejected option's name has; the because-clause's sentence may not turn; unsure → no reason
- INFERENCE: 3 rounds of siblings = the prose fallback is a heuristic with a ceiling; rule kept deliberately one-sided
  (a missed reason → claim shown undefended to the judge, visible; a misattributed one → silently wrong). Stop
  extending it after round 5; anything subtler goes to the LLM judge, which sees the full outcome text anyway
- 41 files, 321 tests · all round-3/4 reproducers now give reasons []

## 11-02 18:15 review 5 (deleg_48978bd8) FAIL → rule cut back to the MADR template slot (decision, not another guard)
- the 8 reproducers in /Users/a1/.hermes/cache/scratch/t54-review5/ hit two different things:
    mid-prose "because"     guard rounds 3-5 kept finding new wordings ("the former", "i.e.", shortened names)
                            measured: it rescued 0 of 20 real ADRs (16/20 with and without) → REMOVED
    template slot           all 8 repros actually use "Chosen option: X, because <praise of rejected Y>"
                            DISPUTED, not fixed: MADR defines that slot as the justification
                            (adr/madr template/adr-template.md:32 `Chosen option: "{title of option 1}", because {justification…}`,
                            same line log4brains docs/adr/template.md:29). A record that says "chose X because Y was
                            faster" contradicts itself; Mole reports what the record states and the LLM judge sees the full text
- test changed: "Chosen option: Modern Python. We picked it because …" now → no reason (was review-2 P0 "use it");
  superseded by the one-sided rule (missed reason visible, misattributed reason silent)
- 41 files, 323 tests · real ADRs 16/20
