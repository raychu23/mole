# T110 (Q4) v2 results -- H2-style real-history benchmark, v2 case set (11 cases), run once

## T117 follow-up (2026-11-08): the `!(index)` dead rule DEFECT_V2_FILESCOPE.md flagged is now FIXED;
## adr004 fires again, recall 0.250 -> 0.500

`DEFECT_V2_FILESCOPE.md`'s "a real, separate, NOT-fixed finding" (below) reported that adr004's
`in: "**/!(index).{ts,tsx}"` content-anchor pattern used Bash extglob negation syntax
(`!(pattern)` = "not pattern") that Mole's hand-rolled `globToRegExp`
(`packages/decisions/src/check/options.ts`) did not implement -- it compiled the glob as the literal,
regex-escaped string `!(index)`, matching no real file, a dead rule. T117 (`tasks/T117-glob-negation/`)
replaced `globToRegExp`'s hand-rolled engine with `picomatch` (already a transitive dependency via
`dependency-cruiser`, `@mole/decisions`'s own direct dependency, pinned 4.0.7, zero deps of its own, 116 KB
on disk -- no bundle-size cost per T101; `picomatch.makeRe('**/!(index).{ts,tsx}')` matches `a/foo.ts` and
correctly rejects `a/index.ts`) and added `deadInGlobProblems()`, a compile-time check that warns when a
`match: in:` glob matches zero files in the repo.

Re-run (CHECK-ONLY, same posture as the file-scope fix above): `compiled_adrs_v2.json` reused unchanged
(the 2 real compiled ADRs, no recompile, no model call); `run/run_t46_cascade_v2.mjs` run unmodified except
for its two `dist/` import paths, pointed at the T117 worktree's own build
(`Mole-worktrees/T117-glob-negation/packages/decisions/dist/`, built via `npx tsc -b packages/decisions`
in that worktree) instead of main's dist, output written to a new file
(`run/arm_t46_cascade_v2_T117.json`, main's `arm_t46_cascade_v2.json` left untouched) so this does not
overwrite the file-scope-fix's own frozen numbers. Full output: `tasks/T117-glob-negation/4 log/t46_rerun_output.txt`.

**adr004 DOES now fire**, on `h2v2-bs-18540-prefix` (label `violate`): the hit is via the exact
previously-dead pattern, `^\s*export\s*(\*|\{[^}]*\})\s*from\s*['"]` scoped `in: "**/!(index).{ts,tsx}"`
(confirmed from `arm_t46_cascade_v2_T117.json`'s `hit_patterns`, cross-checked against
`compiled_adrs_v2.json`'s match list -- this is adr004's SECOND pattern, the one DEFECT_V2_FILESCOPE.md
named as dead, not the first `**/index.{ts,tsx}`-scoped one). The other 2 previously-masked cases
(`h2v2-bs-20007-prefix`, `h2v2-bs-6882-prefix`) still predict `false`: inspected their real diffs
(`cases_h2_v2.json`) -- neither touches a non-index `.ts`/`.tsx` file with a re-export line matching
adr004's drafted regex at all (one is a changeset/README/api-report-only diff, the other a changeset/docs
diff), so these two are genuine compiler-drafted-pattern misses, not a glob-engine artifact; the T117 fix
only recovers cases where the ENGINE was the problem, not every one DEFECT_V2_FILESCOPE.md's framing might
have suggested.

Recomputed T46 cascade confusion matrix (11 cases, same confusion-matrix method as the file-scope-fix
correction below): TP=2 FN=2 FP=1 TN=6 (was TP=1 FN=3 FP=1 TN=6 before this fix). **Recall 0.250 (1/4) ->
0.500 (2/4)**, 95% Wilson CI 0.150-0.850 (computed this task, `tasks/T117-glob-negation/4 log/`).
False-alarm unchanged at 0.143 (1/7, 95% CI 0.026-0.513) -- the fix recovered a true positive, it did not
touch any negative case's prediction. T53/reviewer/RAG numbers are UNCHANGED (not part of this task,
not re-run). `scored_v2.json` / the frozen `arm_t46_cascade_v2.json` are intentionally NOT overwritten by
this follow-up (T117 is its own ledger task/branch, not a rescoring of the merged file-scope-fix arm); a
future task can fold `arm_t46_cascade_v2_T117.json`'s numbers in if this fix merges to main.

---

## CORRECTION (2026-11-08, v2 review FAIL #2 -- see `run/test_file_scope_fix.mjs`, `DEFECT_V2_FILESCOPE.md`)

`run/run_t46_cascade_v2.mjs`'s `checkStep()` applied every compiled `match:` pattern to ALL of a case's
added lines, ignoring the pattern's own `in:` glob scope entirely -- real Mole
(`packages/decisions/src/check/pr-check.ts:318`) scopes a content anchor to the files its `in:` glob
covers BEFORE testing the pattern (`if (f.newPath === null || (c.inRe && !c.inRe.test(f.newPath)))
continue;`). Fixed by mirroring that line exactly, file-by-file, reusing Mole's own `globToRegExp` helper
(`packages/decisions/src/check/options.ts`, exported via `check/index.js`) instead of a new one; see
`run/test_file_scope_fix.mjs` for a standalone demonstration using case `h2v2-bs-18540-fixed`'s real diff
(an `export * from './types'` line added to `index.ts` no longer matches adr004's non-index-scoped
pattern). Re-run was CHECK-ONLY: `compiled_adrs_v2.json`'s 2 compiled ADRs were reused as-is, no model
call, no recompile.

**T46 cascade's numbers below are now WRONG by 3 rows and are superseded by this note; every mention of
T46 cascade matching reviewer's "4/4 recall" or being tied for highest recall is FALSE as of this
correction.** Corrected: recall 0.250 (1/4, 95% CI 0.046-0.699), false-alarm 0.143 (1/7, 95% CI
0.026-0.513) -- TP=1 FN=3 FP=1 TN=6 (`arm_t46_cascade_v2.json`, `scored_v2.json`, both updated in place;
pre-fix copy kept at `run/arm_t46_cascade_v2.json.PRE_FILESCOPE_FIX.bak`). Three of T46 cascade's
"true positives" (h2v2-bs-18540-prefix, h2v2-bs-20007-prefix, h2v2-bs-6882-prefix) were false: all 3 hit
ONLY via adr004's `in: "**/!(index).{ts,tsx}"` pattern misapplied outside its own scope, and once properly
scoped that pattern matches NOTHING real (`globToRegExp` does not support the `!(...)` extglob negation
syntax the compiler drafted here -- a separate, real limitation of Mole's compiled scope glob, noted but
NOT fixed by this task, since fixing it would require a new drafted pattern, not a scoping bug). Two of
T46 cascade's reported "false positives" (h2v2-bs-18540-fixed, h2v2-bs-6882-fixed) are also corrected: they
are now TRUE NEGATIVES (the index.ts re-export lines that drove them no longer fire at all). Only
h2v2-bs-17875-fixed remains a genuine false positive (adr003's `^export default\b` pattern, correctly
scoped to `**/*.{js,jsx,ts,tsx}`, legitimately still matches an unrelated `export default {` elsewhere in
that diff) -- this ONE case is the only part of the original "given the right decision, still said
violates" framing (Per-failure analysis, below) that survives the fix; the other two T46-cascade FPs
attributed to that framing were artifacts of the file-scope bug, not real check failures. T53 vs T46
cascade McNemar is now b10=3, b01=1, n_discordant=4, p=0.6250 (not significant, same conclusion as before
the fix, just different underlying numbers) -- see `run/rescore_t46_filescope_fix.py`. T53/reviewer/RAG
numbers are UNCHANGED (their own scripts were not part of this defect, not re-run).

---

v2 fixes the review FAIL on v1 (see `DEFECT.md`, `protocol_v2.md`): v1 scored its 4 "violate" positives
against the FINAL MERGED (already-fixed) PR diff; v2 scores them against `base...original_commit_id`, the
commit the human's ADR-citing review comment was actually anchored to, and adds the final merged diff of
the SAME PR as a paired `compliant` "fixed" negative. Widened the repo search to 41 repos (6 from v1 + 35
new, `4 log/search_log_v2.txt`); honest yield is **0 additional confirmed positives** -- the >=30 target is
NOT met, reasons logged in `protocol_v2.md`. n stays at 11 (4 positive / 7 negative), all backstage/backstage.

## Losses first

```notes
all 3 LLM-driven arms (reviewer, RAG, T46 cascade) have false positives on the 4 "fixed" paired
negatives/same-file negatives -- reviewer and RAG both flag 3 of the 7 negatives as still violating; T46
cascade (zero-LLM, CORRECTED 2026-11-08, see correction note at top) has only 1 FP after the file-scope
fix, h2v2-bs-17875-fixed, a genuine adr003 re-match, not an artifact. This is the paired design doing
its job: a model/pattern that merely recognizes "this touches ADR004-governed code" (lexical/topical
match) cannot tell FIXED from NOT-FIXED without actually checking whether the specific violation (a
missing types.ts, a wildcard export, a surviving default export) was resolved -- T53 Mole is the only arm
with ZERO false positives across all 7 negatives (reviewer 3/7, RAG 3/7, T46 cascade 1/7 post-fix), but T53's own
true-positive recall is still the worst of the four (0.500 vs reviewer's 1.000, RAG's 0.750, T46 cascade's
0.250 post-fix) -- it misses 2 of 4 real violations outright, while T46 cascade (post-fix) misses 3 of 4.
No arm is simultaneously high-recall AND low-false-alarm on this corrected 11-case set; that tradeoff, not
a single "best" arm, is this run's headline.

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

T46 cascade (NEW this task, zero-LLM at check time; CORRECTED 2026-11-08, see correction note at top) now
matches reviewer's RECALL only incidentally before the fix -- POST-FIX it catches just 1 of 4 real
violations (h2v2-bs-17875-prefix, adr003's `^export default\b` pattern, correctly scoped), and misses the
other 3 (h2v2-bs-18540-prefix, h2v2-bs-20007-prefix, h2v2-bs-6882-prefix) because adr004's compiled
`in: "**/!(index).{ts,tsx}"` pattern never legitimately fires once scoped (the compiled glob uses `!(...)`
extglob negation syntax Mole's own `globToRegExp` does not support, so it matches no real path at all --
a separate limitation, not this task's scoping bug). It has exactly ONE false positive, h2v2-bs-17875-fixed
(the same adr003 pattern legitimately matching an unrelated `export default {` elsewhere in that diff) --
the other 2 originally-reported false positives (h2v2-bs-18540-fixed, h2v2-bs-6882-fixed) were themselves
artifacts of the file-scope bug and are now correct true negatives.
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
T46 cascade (compile+check)  0.250 (0.046-0.699)     0.143 (0.026-0.513)      1   3   1   6
```
T46 cascade row CORRECTED 2026-11-08 (see correction note at top) -- was TP=4 FN=0 FP=3 TN=4 before the
`checkStep()` file-scope fix; `scored_v2.json` and `arm_t46_cascade_v2.json` both updated in place.

(source: `scored_v2.json`, computed via `evals/inspect/dcbench_eval/stats.py`'s `wilson()`; raw predictions
in `arm_t53_v2.json`, `arm_reviewer_v2.json`, `arm_rag_v2.json`, `arm_t46_cascade_v2.json`.)

## McNemar -- computed, NOT a significance claim (n far below the pre-registered power target)

```notes
pair                   b10 (T53-only-right)  b01 (other-only-right)  n_discordant  exact binomial p
T53 vs reviewer         3                     2                       5             1.0000
T53 vs RAG              4                     2                       6             0.6875
T53 vs T46 cascade      3                     1                       4             0.6250
```
T53 vs T46 cascade row CORRECTED 2026-11-08 (was b10=3, b01=2, n_discordant=5, p=1.0000 before the
file-scope fix; recomputed by `run/rescore_t46_filescope_fix.py`) -- conclusion (not significant) is
unchanged, only the underlying counts are.

Per the pre-registered decision rule (protocol_v2.md / v1's power note, unchanged): n=11 is ~2.6% of the
~415-440 target for 80% power at this effect size. These p-values are reported because they ARE computable
(unlike v1's n=7, which had too few discordant pairs for even an exact test to be meaningful at all) but
none approach significance and none should be read as "T53 beats/loses to X" -- all three pairs sit ~50/50
on which arm gets the discordant case right, which at n=5-6 discordant pairs is exactly what pure chance
looks like.

## Per-case table

```notes
id                      label      T53 pred  T53 routing hit its OWN target adr_id?  reviewer pred  RAG pred (picked)          T46 cascade pred (CORRECTED 2026-11-08)
h2v2-bs-18540-prefix    violate    True (right, crisp)        adr004: yes             True (right)   False (wrong, NONE)        False (WRONG, miss -- was True pre-fix)
h2v2-bs-18540-fixed     compliant  False (right*)              adr004: NO (not routed) True (WRONG)   True (WRONG, adr004)       False (right -- was True/WRONG pre-fix)
h2v2-bs-20007-prefix    violate    False (WRONG, escalation)  adr004: yes             True (right)   True (right, adr004)       False (WRONG, miss -- was True pre-fix)
h2v2-bs-20007-fixed     compliant  False (right)               adr004: yes             False (right)  False (right, adr004)      False (right)
h2v2-bs-17875-prefix    violate    False (WRONG, routing)     adr003: NO (routed adr004 instead)  True (right)  True (right, adr003)  True (right)
h2v2-bs-17875-fixed     compliant  False (right*)              adr003: NO (routed adr004 instead, not its own target)  True (WRONG)  True (WRONG, adr003)  True (WRONG, genuine re-match, not an artifact)
h2v2-bs-6882-prefix     violate    True (right, crisp)        adr004: yes             True (right)   True (right, adrs-adr004)  False (WRONG, miss -- was True pre-fix)
h2v2-bs-6882-fixed      compliant  False (right)               adr004: yes             False (right)  False (right, adr014)      False (right -- was True/WRONG pre-fix)
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
are CHECK failures by construction (reviewer has no routing step distinct from the check -- it is TOLD the
decision directly), so 100% of reviewer's false positives are "given the right decision, still said
violates when the human-approved fix made it compliant." T46 cascade's false positives are CORRECTED
2026-11-08 (see correction note at top): only 1 of its originally-reported 3 FPs survives the file-scope
fix (h2v2-bs-17875-fixed, adr003's `^export default\b` pattern, correctly scoped, legitimately still
matching an unrelated `export default {` elsewhere in that diff -- a genuine "given the right decision,
still said violates" case). The other 2 (h2v2-bs-18540-fixed, h2v2-bs-6882-fixed) were NEVER real check
failures: they were the file-scope bug itself (a pattern scoped to non-index files firing on an index.ts
line), now fixed, and are correct true negatives.
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
T46 cascade's `in:` scoping bug (CORRECTED 2026-11-08)   `checkStep()` applied every compiled `match:`
               pattern to ALL added lines, ignoring the pattern's own `in:` glob scope -- see correction
               note at top. Fixed by reusing Mole's real `globToRegExp` (not a new implementation);
               demonstrated in `run/test_file_scope_fix.mjs`. Exposed a SEPARATE, NOT-fixed limitation:
               the compiled `in: "**/!(index).{ts,tsx}"` pattern for adr004 uses `!(...)` extglob negation
               syntax `globToRegExp` does not support, so once correctly scoped it matches no real file at
               all -- 3 of T46 cascade's 4 positives were hit ONLY through this (buggy scoping masked a
               dead pattern as a working one). Fixing the extglob gap in `globToRegExp` itself, or having
               the compiler avoid drafting unsupported glob syntax, is NOT this task's scope.
linter-only (v3's regex baseline) NOT re-run this task (the arm list for this review round names T53,
               reviewer, RAG, T46 cascade, not v3's separate linter_arm_v3.py) -- v1's result (6/7 abstain
               on real ADR prose) stands unmodified and uncontradicted, see v1-failed-attempt/results.md.
single run     one run per arm, no repeat-run variance measurement (same as v1/T53's own convention).
```
