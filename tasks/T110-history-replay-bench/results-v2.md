# T110 (Q4) v2 results -- H2-style real-history benchmark, v2 case set (11 cases), run once

v2 fixes the review FAIL on v1 (see `DEFECT.md`, `protocol_v2.md`): v1 scored its 4 "violate" positives
against the FINAL MERGED (already-fixed) PR diff; v2 scores them against `base...original_commit_id`, the
commit the human's ADR-citing review comment was actually anchored to, and adds the final merged diff of
the SAME PR as a paired `compliant` "fixed" negative. Widened the repo search to 41 repos (6 from v1 + 35
new, `4 log/search_log_v2.txt`); honest yield is **0 additional confirmed positives** -- the >=30 target is
NOT met, reasons logged in `protocol_v2.md`. n stays at 11 (4 positive / 7 negative), all backstage/backstage.

## Losses first

```notes
all 3 LLM-driven arms (reviewer, RAG, T46 cascade) have 3 false positives on the 4 "fixed" paired
negatives/same-file negatives -- reviewer and T46 cascade both flag 3 of the 4 POST-FIX diffs as still
violating; RAG flags 3 different negatives (2 fixed pairs + 1 same-file). This is the paired design doing
its job: a model/pattern that merely recognizes "this touches ADR004-governed code" (lexical/topical
match) cannot tell FIXED from NOT-FIXED without actually checking whether the specific violation (a
missing types.ts, a wildcard export, a surviving default export) was resolved -- T53 Mole is the only arm
with ZERO false positives across all 7 negatives (reviewer 3/7, RAG 3/7, T46 cascade 3/7), but T53's own
true-positive recall is still the worst of the four (0.500 vs reviewer's 1.000, T46 cascade's 1.000, RAG's
0.750) -- it misses 2 of 4 real violations outright. No arm is simultaneously high-recall AND low-false-
alarm on this corrected 11-case set; that tradeoff, not a single "best" arm, is this run's headline.

T53's 2 misses replicate v1's EXACT pattern even with the corrected (now-really-violating) diffs: h2v2-bs-
17875-prefix is a ROUTING miss (routing=[adr004, adr006, adr011, adr014] -- the TARGET adr003 never
appears, same miss v1 reported before the defect fix), h2v2-bs-20007-prefix is an ESCALATION miss (routed
adr004 correctly, 1 LLM call made, the escalation itself answered "compliant" on genuinely violating code).
This is useful confirmation that v1's finding ("T53 misses real human-cited violations, split between
routing and escalation failures") was NOT an artifact of the v1 defect -- the SAME 2 cases fail the SAME
way once scored against the actually-violating commit.

reviewer (given the oracle decision) now gets 4/4 recall (v1: 2/4, because v1's positives were already
fixed) -- expected once the positive label matches real violating code -- but trades it for 3/7 false
positives on the fixed pairs: reviewer.json shows it calls h2v2-bs-18540-fixed and h2v2-bs-17875-fixed
VIOLATES even though the author incorporated the exact fix the SAME maintainer asked for, i.e. given only
the decision text + a diff, claude-sonnet-5 cannot reliably tell "this still has the problem" from "this
part of the diff still touches the same area, but the problem is gone."

T46 cascade (NEW this task, zero-LLM at check time) matches reviewer's 4/4 recall exactly (the SAME 2
compiled match: patterns -- a wildcard-export regex for adr004, a default-export regex for adr003 --
happen to re-fire on 3 of the 4 fixed diffs too, because the pattern only checks "is this syntax present
ANYWHERE in the added lines," not "is the SPECIFIC flagged location still using it"): h2v2-bs-17875-fixed
and h2v2-bs-6882-fixed both still contain SOME added line matching the compiled regex (not the originally
flagged one), so the deterministic check cannot distinguish them from the real violations either --
compile-at-capture buys zero-cost checking, not more semantic precision than the LLM arms it's compared
against here.
```

## Case set (11: 4 positive / 7 negative -- see `protocol_v2.md` for the full defect fix + search log)

```notes
positives (4)  h2v2-bs-18540-prefix (adr004), h2v2-bs-20007-prefix (adr004), h2v2-bs-17875-prefix (adr003),
               h2v2-bs-6882-prefix (adr004) -- same 4 real PRs/comments v1 found, diff corrected to
               base...original_commit_id (pre-fix).
negatives (7)  h2v2-bs-18540-fixed, h2v2-bs-20007-fixed, h2v2-bs-17875-fixed, h2v2-bs-6882-fixed (NEW:
               same PR, same ADR, post-fix) + h2v2-bs-23449-neg, h2v2-bs-28578-neg, h2v2-bs-6993-neg
               (carried from v1: different PR, same file, zero human "adr" mention).
widen search   41 repos, ~128 queries, 0 additional confirmed positives (honest yield, protocol_v2.md).
```

## Numbers -- recall / false-alarm (Wilson 95% CI), n=11 (4 positive / 7 negative)

```notes
arm                          recall (95% CI)         false-alarm (95% CI)     TP  FN  FP  TN
T53 Mole (semantic-routed)   0.500 (0.150-0.850)     0.000 (0.000-0.354)      2   2   0   7
reviewer (given decision)    1.000 (0.510-1.000)     0.429 (0.158-0.750)      4   0   3   4
RAG (reads all live ADRs)    0.750 (0.301-0.954)     0.429 (0.158-0.750)      3   1   3   4
T46 cascade (compile+check)  1.000 (0.510-1.000)     0.429 (0.158-0.750)      4   0   3   4
```

(source: `scored_v2.json`, computed via `evals/inspect/dcbench_eval/stats.py`'s `wilson()`; raw predictions
in `arm_t53_v2.json`, `arm_reviewer_v2.json`, `arm_rag_v2.json`, `arm_t46_cascade_v2.json`.)

## McNemar -- computed, NOT a significance claim (n far below the pre-registered power target)

```notes
pair                   b10 (T53-only-right)  b01 (other-only-right)  n_discordant  exact binomial p
T53 vs reviewer         3                     2                       5             1.0000
T53 vs RAG              4                     2                       6             0.6875
T53 vs T46 cascade      3                     2                       5             1.0000
```

Per the pre-registered decision rule (protocol_v2.md / v1's power note, unchanged): n=11 is ~2.6% of the
~415-440 target for 80% power at this effect size. These p-values are reported because they ARE computable
(unlike v1's n=7, which had too few discordant pairs for even an exact test to be meaningful at all) but
none approach significance and none should be read as "T53 beats/loses to X" -- all three pairs sit ~50/50
on which arm gets the discordant case right, which at n=5-6 discordant pairs is exactly what pure chance
looks like.

## Per-case table

```notes
id                      label      T53 pred  T53 routing hit its OWN target adr_id?  reviewer pred  RAG pred (picked)          T46 cascade pred
h2v2-bs-18540-prefix    violate    True (right, crisp)        adr004: yes             True (right)   False (wrong, NONE)        True (right)
h2v2-bs-18540-fixed     compliant  False (right*)              adr004: NO (not routed) True (WRONG)   True (WRONG, adr004)       True (WRONG)
h2v2-bs-20007-prefix    violate    False (WRONG, escalation)  adr004: yes             True (right)   True (right, adr004)       True (right)
h2v2-bs-20007-fixed     compliant  False (right)               adr004: yes             False (right)  False (right, adr004)      False (right)
h2v2-bs-17875-prefix    violate    False (WRONG, routing)     adr003: NO (routed adr004 instead)  True (right)  True (right, adr003)  True (right)
h2v2-bs-17875-fixed     compliant  False (right*)              adr003: NO (routed adr004 instead, not its own target)  True (WRONG)  True (WRONG, adr003)  True (WRONG)
h2v2-bs-6882-prefix     violate    True (right, crisp)        adr004: yes             True (right)   True (right, adrs-adr004)  True (right)
h2v2-bs-6882-fixed      compliant  False (right)               adr004: yes             False (right)  False (right, adr014)      True (WRONG)
h2v2-bs-23449-neg       compliant  False (right*)              adr004: NO (not routed) False (right)  False (right, adr004)      False (right)
h2v2-bs-28578-neg       compliant  False (right)               adr004: yes             True (WRONG)   True (WRONG, adr004)       False (right)
h2v2-bs-6993-neg        compliant  False (right)               adr004: yes             False (right)  False (right, adr004)      False (right)
```
\* "right*" = T53 landed on the correct label, but its OWN target adr_id was never routed/escalated at all (3
of T53's 7 correct negatives -- 18540-fixed, 17875-fixed, 23449-neg -- are "correct by default," i.e. no
verdict was ever reached for that case's real governing decision, not "escalated and correctly judged
compliant"). Only 4 of T53's 7 correct negatives (20007-fixed, 6882-fixed, 28578-neg, 6993-neg) reflect an
actual escalation call against the right decision that answered compliant.

## Per-failure analysis -- routing vs check (T53's own tier breakdown, this is the thing a cascade
## architecture is supposed to let you localize)

```notes
h2v2-bs-17875-prefix   ROUTING failure: adr003 (the real target) never appears in semantic-route output
(routed: adr004, adr006, adr011, adr014). The check tier never ran against the right decision at all --
no amount of improving the escalation prompt fixes this case; the fix has to be in routing/retrieval.
h2v2-bs-20007-prefix   CHECK (escalation) failure: adr004 WAS routed correctly, one LLM call was made
(llmCallCount=1), and the escalation itself answered "compliant" on code a human maintainer called out as
a violation in the same review thread. The right decision reached the model; the model's verdict was
wrong. This is the failure mode worth escalation-prompt iteration on, not retrieval changes.
h2v2-bs-18540-prefix, h2v2-bs-6882-prefix   both CRISP zero-LLM hits (llmCallCount=0, isCrisp path:
content-anchor/export-convention match decided outright) -- these 2 did not need the LLM tier at all once
routed, and got the right answer for $0 marginal cost.
negatives (the 7 compliant cases)   T53's 7/7 correct negatives split into two very different kinds, and
conflating them would overstate the result: 4 (20007-fixed, 6882-fixed, 28578-neg, 6993-neg) are cases
where the case's OWN target adr_id WAS routed and escalated (llmCallCount>=1), and the escalation itself
correctly answered compliant -- real work, the escalation tier distinguishing fixed-from-violating code.
The other 3 (18540-fixed, 17875-fixed, 23449-neg) are "correct by default": the case's own target adr_id
was never routed at all (18540-fixed/23449-neg: nothing routed; 17875-fixed: adr004 was routed instead of
its real target adr003, mirroring the SAME adr003/adr004 confusion that made h2v2-bs-17875-prefix a routing
miss on the positive side), so no verdict against the real decision was ever reached -- "compliant" here is
the no-governed-hit default, not a judgment. Read plainly: T53's false-alarm rate of 0.000 is real for 4/7
negatives and an artifact of routing gaps for 3/7 -- a wider real-history set would be needed to tell
whether that 3/7 "gets lucky" ratio holds up, which this n=11 cannot settle. The escalation tier's own
record when it DOES fire against the right decision is 5-for-6 across this whole case set (4/4 correct
negatives + 1/2 positives it escalated on, h2v2-bs-20007-prefix being its one miss) -- a genuinely mixed
but more informative number than the raw 0.000 false-alarm headline alone.
reviewer/RAG/T46 cascade's false positives   all 3 of reviewer's FPs (18540-fixed, 17875-fixed, 28578-neg)
and all 3 of T46 cascade's FPs (18540-fixed, 17875-fixed, 6882-fixed) are CHECK failures by construction
(reviewer/T46 cascade have no routing step distinct from the check -- they are TOLD the decision or run a
decision-specific pattern directly), so 100% of their false positives are "given the right decision, still
said violates when the human-approved fix made it compliant."
```

## Limits

```notes
power          n=11 (4 positive/7 negative) vs the pre-registered target of ~415-440 (McNemar power for
               >= v3's own observed effect, psi=0.70). n is ~2.6% of target (v1 was ~1.7%); still far short.
               McNemar p-values are reported (computable this time, unlike v1) but explicitly flagged as
               uninformative at this n -- see "McNemar" section above.
widen search failed to meet its own target  the task instructed targeting >=30 positives; this run found 0
               additional confirmed positives across 41 repos / ~128 queries. Reported honestly, not padded
               with a weaker-evidence case (quarkus #43148, Apicurio #7829 were both investigated and
               explicitly rejected, reasons in `4 log/search_log_v2.txt` / `protocol_v2.md`) -- same
               standard v1 applied when it rejected easi-app #3527 and the two RocketChat bot-only hits.
single repo    all 11 cases are still backstage/backstage (2 ADRs: adr003, adr004) -- unchanged from v1,
               the widen search's zero-yield result means this limit is NOT resolved by this task.
negative label is still partly an absence proxy  3 of the 7 negatives (the same-file ones carried from v1)
               are "no human flagged a violation in comments," not "a human confirmed compliance" -- same
               stated limit as v1. The 4 NEW paired-fixed negatives do NOT have this limit: a human
               explicitly requested and reviewed the fix in the same thread, the strongest compliance
               signal available in this method.
T53 recordsRoot reused v1's already-built `.mole` records for backstage's 14 other live ADRs (not
               rebuilt); decision text for adr003/adr004 is the REAL repo markdown, read directly.
T46 cascade compile cost   $0.0447 total / $0.0224 per-decision, ONE-TIME (2 unique ADRs here), amortized;
               $0/case at check time (deterministic regex match, no model call), per its own convention
               (tasks/T109-b2-baselines/4 log/scripts/t46_cascade_arm_v3.mjs).
linter-only (v3's regex baseline) NOT re-run this task (the arm list for this review round names T53,
               reviewer, RAG, T46 cascade, not v3's separate linter_arm_v3.py) -- v1's result (6/7 abstain
               on real ADR prose) stands unmodified and uncontradicted, see v1-failed-attempt/results.md.
single run     one run per arm, no repeat-run variance measurement (same as v1/T53's own convention).
```
