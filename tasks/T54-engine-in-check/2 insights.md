
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
