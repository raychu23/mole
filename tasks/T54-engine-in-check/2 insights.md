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
