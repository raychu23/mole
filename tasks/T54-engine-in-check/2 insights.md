# T54 insights

## What was actually wired in, and why it's an honest "engine in the check path"

The M2 v2 bench's 61 ADRs (`decisions_manifest.json`) have zero hand-authored `.mole/arguments/*.argdown`
files -- T48's `argumentFramework()` (built T48, real, tested) has nothing to load for this corpus. Wiring
packages/reasoning (T42) into the check path "as-is" against this bench would therefore be a no-op: the
cascade would import the right modules but never actually call them on real data. T54 instead derives a
second, rule-based source of Dung-framework args/attacks from the ADR's OWN MADR/Nygard headings
(`## Considered Options` + `## Decision Outcome`'s "because" bullets) -- see `4 log/prior-art.md` for the
full reasoning and the rejected alternative (a one-level Consequences-sentiment framework, dropped because
it trivially defeats the claim on almost every real ADR).

## What was tried and dropped

A first sketch classified every Consequences-bucket paragraph as a support or an attack on the claim by a
negative-keyword lexicon ("risk", "cost", "trade-off", ...), feeding attacks directly into the evaluated
framework. Dropped before writing any test: real ADRs document trade-offs by nature (that is what the
Consequences section is FOR), so almost any real record would have gotten its claim auto-labelled 'out' by
grounded semantics -- a trivial, non-discriminative result that adds a plausible-looking computation without
adding real signal. The Considered-Options/Decision-Outcome shape (rejected alternative attacks the claim;
a stated "because" reason attacks the alternative back, defending the claim) is the one place MADR-style ADRs
actually carry a real, two-level argument structure in their own prose, so that is what T54 derives.

## Known limitations (own, not hidden)

- `optionNameOf`'s separator-based name extraction (`- **Name** -- why`) is a heuristic; an ADR bullet shaped
  differently (no separator, or a separator inside the name itself) can mis-split the name/reason boundary.
  Exact-match-only comparison against the "Chosen option" quote (not substring) avoids the worst failure mode
  (two options sharing a prefix, e.g. "MADR 2.1.2" vs "MADR 2.1.2 with Log4brains patch") but a near-miss
  (different capitalization inside markdown links, extra whitespace) can still fail to recognize the chosen
  option as itself, double-counting it as its own attacker. Not hit in the M2 v2 corpus's own ADRs by spot
  check, but not exhaustively verified across all 61.
- "Reasons" are taken as every bullet in the Decision Outcome section after the "Chosen option: X, because"
  line, which can over-collect (e.g. log4brains's "Log4brains patch modifications" bullets, which are
  implementation detail, not a defeating reason) -- harmless for the grounded evaluation (an extra 'in' reason
  that attacks the same already-defeated options changes nothing), but means `argumentLabels` is not a
  perfectly clean "exactly the stated reasons" set.
- Consequences text is carried through to the judge prompt verbatim but never argument-evaluated (by design,
  see prior-art.md) -- the engine's labels say nothing about whether a decision's trade-offs are acceptable,
  only whether its considered-but-rejected alternatives were rebutted in the record's own text.

## A real limitation the held-out run surfaced (fix deferred, see t54-results.md)

14/61 M2 v2 cases route to a decision with a real `## Considered Options` + `## Decision Outcome` structure
(python-tuf, log4brains). In all 14, `deriveAdrArgumentFramework`'s claim came out labelled 'out' (undefended)
because the ADR's stated "because" reason is plain prose, not a markdown bullet list (e.g. python-tuf's
`0001-python-version-3-6-plus.md`: `Chosen option: "Support only Python 3.6+", because we want modern
features...` is one sentence, no `-`/`*` bullets), and `bulletsOf()` only recognizes bulleted lines. All 14
were still classified correctly on this bench run (the judge prompt's "UNRESOLVED ALTERNATIVES ... do not
treat the decision as void" wording exists specifically to make an incorrectly-'out' claim harmless to the
final verdict), so this cost nothing on THIS run, but the `argumentLabels` reported on those verdicts are
wrong in a specific, named way. The fix (fall back to the whole post-"because" paragraph as one reason when
`bulletsOf` finds nothing) is a few lines, but applying it now would mean re-running the held-out split a
second time against changed code -- against the "held-out once" rule this task was given. Left as a named
follow-up rather than silently fixed and re-run.

## Process note

`npm run check` ran on a machine shared with several other concurrent Mole chats (screen sessions `m2v3`,
`m2v3compile`, `rr2`, `mcv4b` -- unrelated labeling/compile/AB-test jobs from other chats, confirmed via `ps
aux`, not T54's). The first full run showed 4 failed test files, none touching `packages/decisions` or
`packages/reasoning`; re-running those 4 files in isolation (no concurrent load from this task's own M2 v2
bench run) passed 3/4 outright, and the 4th (`tool-annotations-schema.test.ts`'s "a real call to a
representative read-only tool" case) is a real MCP round-trip through `mole_coverage`'s whole-repo scan with
a 30s test timeout -- the same scan `bounded-pagination.test.ts`'s 90s-timeout case also hit in the first
run. Treated as pre-existing environmental flakiness under shared-machine load, not a T54 regression: nothing
in the failure traces touches the derive module, the cascade escalation prompt, or any file T54 edited. A
second concern during the M2 v2 run itself: an earlier `screen` invocation using GNU's `-Logfile <name>`
syntax failed silently (this machine's `screen` is BSD 4.00.03, no such flag) and left an orphaned `node`
process competing with the next, correctly-launched run for the SAME output JSON file -- surfaced as spurious
`hermes` CLI failures on the first two dev cases. Fixed by killing the orphan and hardening the run script to
drop (not just skip) any row with `.error` set on restart, so a transient failure is retried automatically
instead of silently "done".

<!-- merged 11-02: below = the ledger/t54-engine-in-check branch notes (follow-up fixes, reviews 1-5); later sections supersede earlier ones -->


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
